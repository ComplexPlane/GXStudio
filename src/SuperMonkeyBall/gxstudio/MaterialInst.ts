
import { mat4 } from "gl-matrix";
import { Color, colorCopy, colorMult, colorNewCopy, White } from "../../Color.js";
import { GfxDevice, GfxMipFilterMode, GfxSampler, GfxTexFilterMode } from "../../gfx/platform/GfxPlatform.js";
import { GfxRenderCache } from "../../gfx/render/GfxRenderCache.js";
import { GfxRenderInst } from "../../gfx/render/GfxRenderInstManager.js";
import { GXMaterialBuilder } from "../../gx/GXMaterialBuilder.js";
import * as GX from "../../gx/gx_enum.js";
import { GXMaterialHacks, SwapTable } from "../../gx/gx_material.js";
import { ColorKind, DrawParams, GXMaterialHelperGfx, MaterialParams, translateWrapModeGfx } from "../../gx/gx_render.js";
import { assertExists } from "../../util.js";
import { RenderParams } from "../Model.js";
import * as gui from "./Gui.js";
import { LoadedTexture, TextureMapping } from "../../TextureHolder.js";
import { TextureInputGX } from "../../gx/gx_texture.js";
import { TextureCache } from "../ModelCache.js";
import { ColorAnim, ScalarAnim, TevStage } from "./Scene.js";

type BuildState = {
    stage: number;
    texCoord: GX.TexCoordID;
    texMap: GX.TexMapID;
    texGenSrc: GX.TexGenSrc;
};

const SWAP_TABLES: SwapTable[] = [
    [GX.TevColorChan.R, GX.TevColorChan.G, GX.TevColorChan.B, GX.TevColorChan.A],
    [GX.TevColorChan.R, GX.TevColorChan.G, GX.TevColorChan.B, GX.TevColorChan.R], // Used for alpha textures
    [GX.TevColorChan.R, GX.TevColorChan.G, GX.TevColorChan.B, GX.TevColorChan.G],
    [GX.TevColorChan.R, GX.TevColorChan.G, GX.TevColorChan.B, GX.TevColorChan.B],
];

const scratchMaterialParams = new MaterialParams();
const scratchColor1: Color = colorNewCopy(White);
const scratchColor2: Color = colorNewCopy(White);

export class TextureInst {
    private loadedTex: LoadedTexture;
    private gfxSampler: GfxSampler;

    constructor(
        device: GfxDevice,
        renderCache: GfxRenderCache,
        textureCache: TextureCache,
        texture: TextureInputGX,
        wrapModeU: GX.WrapMode,
        wrapModeV: GX.WrapMode,
    ) {
        this.loadedTex = textureCache.getTexture(device, texture);

        const width = texture.width;
        const height = texture.height;
        let maxLod = 15; // TODO: configure?
        if (width !== height) {
            maxLod = 0;
        } else if (maxLod === 15) {
            // Use 16x16 as the max LOD
            const minDim = Math.min(width, height);
            maxLod = Math.max(0, Math.log2(minDim) - 4);
        }

        this.gfxSampler = renderCache.createSampler({
            wrapS: translateWrapModeGfx(wrapModeU),
            wrapT: translateWrapModeGfx(wrapModeV),
            minFilter: GfxTexFilterMode.Bilinear,
            magFilter: GfxTexFilterMode.Bilinear,
            mipFilter: maxLod === 0 ? GfxMipFilterMode.Nearest : GfxMipFilterMode.Linear,
            minLOD: 0,
            maxLOD: maxLod,
        });
    }

    public fillTextureMapping(mapping: TextureMapping): void {
        mapping.gfxTexture = this.loadedTex.gfxTexture;
        mapping.gfxSampler = this.gfxSampler;
    }
}

export class MaterialInst {
    private materialHelper: GXMaterialHelperGfx;

    // TODO(complexplane): ways to avoid regenerating on certain changes like constants/colors/texmtx?
    constructor(
        private tevStages: TevStage[],
        private textureInsts: TextureInst[],
        private scalarAnims: ScalarAnim[],
        private colorAnims: ColorAnim[],
        cullMode: GX.CullMode,
    ) {
        const mb = new GXMaterialBuilder();

        mb.setCullMode(cullMode);

        // Set up lighting channel. No vertex colors or anything crazy for now
        mb.setChanCtrl(
            GX.ColorChannelID.ALPHA0, // chan
            false, // enable
            GX.ColorSrc.REG, // amb_src
            GX.ColorSrc.REG, // mat_src
            0, // light_mask
            GX.DiffuseFunction.NONE, // diff_fn
            GX.AttenuationFunction.NONE // attn_fn
        ); // attn_fn
        mb.setChanCtrl(
            GX.ColorChannelID.COLOR0, // chan
            true, // enable
            GX.ColorSrc.REG, // amb_src
            GX.ColorSrc.REG, // mat_src
            1, // light_mask, assuming we only have one directional light for now
            GX.DiffuseFunction.CLAMP, // diff_fn
            GX.AttenuationFunction.SPOT // attn_fn
        );

        const buildState: BuildState = {
            stage: 0,
            texCoord: GX.TexCoordID.TEXCOORD0,
            texMap: GX.TexMapID.TEXMAP0,
            texGenSrc: GX.TexGenSrc.TEX0,
        };
        for (let tevStageIdx = 0; tevStageIdx < this.tevStages.length; tevStageIdx++) {
            const tevStage = this.tevStages[tevStageIdx];
            mb.setTevDirect(tevStageIdx);
            mb.setTevSwapMode(buildState.stage, SWAP_TABLES[0], SWAP_TABLES[0]);
            mb.setTexCoordGen(buildState.texCoord, GX.TexGenType.MTX2x4, buildState.texGenSrc, GX.TexGenMatrix.TEXMTX1);
            const texMap = tevStage.texture !== null ? buildState.texMap : GX.TexMapID.TEXMAP_NULL;
            mb.setTevOrder(buildState.stage, buildState.texCoord, texMap, GX.RasColorChannelID.COLOR0A0);

            mb.setTevColorIn(buildState.stage, tevStage.colorInA, tevStage.colorInB, tevStage.colorInC, tevStage.colorInD);
            mb.setTevColorOp(buildState.stage, GX.TevOp.ADD, GX.TevBias.ZERO, GX.TevScale.SCALE_1, true, tevStage.colorDest);
            mb.setTevAlphaIn(buildState.stage, tevStage.alphaInA, tevStage.alphaInB, tevStage.alphaInC, tevStage.alphaInD);
            mb.setTevAlphaOp(buildState.stage, GX.TevOp.ADD, GX.TevBias.ZERO, GX.TevScale.SCALE_1, true, tevStage.alphaDest);

            buildState.stage++;
            buildState.texCoord++;
            buildState.texGenSrc++;
            if (tevStage.texture !== null) {
                buildState.texMap++;
            }
        }

        mb.setAlphaCompare(GX.CompareType.GREATER, 0, GX.AlphaOp.AND, GX.CompareType.GREATER, 0);

        const srcBlendFactor = GX.BlendFactor.SRCALPHA;
        const destBlendFactor = GX.BlendFactor.INVSRCALPHA;
        mb.setBlendMode(GX.BlendMode.BLEND, srcBlendFactor, destBlendFactor, GX.LogicOp.CLEAR);

        mb.setZMode(true, GX.CompareType.LEQUAL, true);

        this.materialHelper = new GXMaterialHelperGfx(mb.finish());
    }

    public setMaterialHacks(hacks: GXMaterialHacks): void {
        this.materialHelper.setMaterialHacks(hacks);
    }

    public setOnRenderInst(
        device: GfxDevice,
        renderCache: GfxRenderCache,
        inst: GfxRenderInst,
        drawParams: DrawParams,
        renderParams: RenderParams
    ): void {
        // Shader program
        this.materialHelper.setOnRenderInst(renderCache, inst);

        // Sampler bindings
        const materialParams = scratchMaterialParams;
        materialParams.clear();
        for (let i = 0; i < this.textureInsts.length; i++) {
            this.textureInsts[i].fillTextureMapping(materialParams.m_TextureMapping[i]);
        }

        const lighting = assertExists(renderParams.lighting);

        // Ambient lighting color. Alpha should be irrelevant since alpha light channel is
        // always disabled
        const ambientColor = scratchColor2;
        colorCopy(ambientColor, lighting.ambientColor);

        // Material color
        const materialColor = scratchColor1;
        colorCopy(materialColor, White);
        materialColor.a = renderParams.alpha;

        // TODO: SMB uses texmtx1, do we need to?
        mat4.copy(materialParams.u_TexMtx[1], renderParams.texMtx);

        colorCopy(materialParams.u_Color[ColorKind.MAT0], materialColor);
        colorCopy(materialParams.u_Color[ColorKind.AMB0], ambientColor);
        // Game uses TEVREG0 instead of RASC when lighting and vertex colors are disabled
        colorCopy(materialParams.u_Color[ColorKind.C0], materialColor);

        materialParams.u_Lights[0].copy(lighting.infLightViewSpace);

        this.materialHelper.allocateMaterialParamsDataOnInst(inst, materialParams);
        inst.setSamplerBindingsFromTextureMappings(materialParams.m_TextureMapping);

        // Draw params
        this.materialHelper.allocateDrawParamsDataOnInst(inst, drawParams);
    }
}
