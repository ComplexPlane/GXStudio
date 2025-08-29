import { mat4, vec2, vec3 } from "gl-matrix";
import { Color, colorCopy, colorLerp, colorNewCopy, White } from "../../Color.js";
import { GfxDevice } from "../../gfx/platform/GfxPlatform.js";
import { GfxRenderCache } from "../../gfx/render/GfxRenderCache.js";
import { GfxRenderInst } from "../../gfx/render/GfxRenderInstManager.js";
import { GXMaterialBuilder } from "../../gx/GXMaterialBuilder.js";
import * as GX from "../../gx/gx_enum.js";
import { GXMaterialHacks, SwapTable } from "../../gx/gx_material.js";
import { ColorKind, DrawParams, GXMaterialHelperGfx, MaterialParams } from "../../gx/gx_render.js";
import { assertExists } from "../../util.js";
import { RenderParams } from "../Model.js";
import { ColorAnim, ColorChannel, CurveKind, ScalarAnim, ScalarChannel } from "./Anim.js";
import { TevStage } from "./Scene.js";
import { TextureInst } from "./TextureInst.js";
import { animateColors, animateScalars, newColorState, newScalarState } from "./Anim.js";

type BuildState = {
    stage: number;
    texCoord: GX.TexCoordID;
    texMap: GX.TexMapID;
};

const SWAP_TABLES: SwapTable[] = [
    [GX.TevColorChan.R, GX.TevColorChan.G, GX.TevColorChan.B, GX.TevColorChan.A],
    [GX.TevColorChan.R, GX.TevColorChan.G, GX.TevColorChan.B, GX.TevColorChan.R], // Used for alpha textures
    [GX.TevColorChan.R, GX.TevColorChan.G, GX.TevColorChan.B, GX.TevColorChan.G],
    [GX.TevColorChan.R, GX.TevColorChan.G, GX.TevColorChan.B, GX.TevColorChan.B],
];

const TEXMTX_UV_CHANNELS = [
    { u: ScalarChannel.UV0_TranslateU, v: ScalarChannel.UV0_TranslateV },
    { u: ScalarChannel.UV1_TranslateU, v: ScalarChannel.UV1_TranslateV },
    { u: ScalarChannel.UV2_TranslateU, v: ScalarChannel.UV2_TranslateV },
    { u: ScalarChannel.UV3_TranslateU, v: ScalarChannel.UV3_TranslateV },
    { u: ScalarChannel.UV4_TranslateU, v: ScalarChannel.UV4_TranslateV },
    { u: ScalarChannel.UV5_TranslateU, v: ScalarChannel.UV5_TranslateV },
    { u: ScalarChannel.UV6_TranslateU, v: ScalarChannel.UV6_TranslateV },
    { u: ScalarChannel.UV7_TranslateU, v: ScalarChannel.UV7_TranslateV },
];

const COLOR_CHANNELS = [
    { colorChannel: ColorChannel.C0, colorKind: ColorKind.C0, alphaChannel: ScalarChannel.A0 },
    { colorChannel: ColorChannel.C1, colorKind: ColorKind.C1, alphaChannel: ScalarChannel.A1 },
    { colorChannel: ColorChannel.C2, colorKind: ColorKind.C2, alphaChannel: ScalarChannel.A2 },
    { colorChannel: ColorChannel.CPREV, colorKind: ColorKind.CPREV, alphaChannel: ScalarChannel.APREV },
];

const KONST_CHANNELS = [
    { colorChannel: ColorChannel.K0, colorKind: ColorKind.K0 },
    { colorChannel: ColorChannel.K1, colorKind: ColorKind.K1 },
    { colorChannel: ColorChannel.K2, colorKind: ColorKind.K2 },
    { colorChannel: ColorChannel.K3, colorKind: ColorKind.K3 },
];

const TEXGEN_MTXS = [
    GX.TexGenMatrix.TEXMTX0,
    GX.TexGenMatrix.TEXMTX1,
    GX.TexGenMatrix.TEXMTX2,
    GX.TexGenMatrix.TEXMTX3,
    GX.TexGenMatrix.TEXMTX4,
    GX.TexGenMatrix.TEXMTX5,
    GX.TexGenMatrix.TEXMTX6,
    GX.TexGenMatrix.TEXMTX7,
    // Does Gamecube have these?
    GX.TexGenMatrix.TEXMTX8,
    GX.TexGenMatrix.TEXMTX9,
]

const scratchMaterialParams = new MaterialParams();
const scratchColor1: Color = colorNewCopy(White);
const scratchColor2: Color = colorNewCopy(White);
const scratchVec3 = vec3.create();

export class MaterialInst {
    private materialHelper: GXMaterialHelperGfx;
    private scalarState = newScalarState();
    private colorState = newColorState();

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
            GX.AttenuationFunction.NONE, // attn_fn
        ); // attn_fn
        mb.setChanCtrl(
            GX.ColorChannelID.COLOR0, // chan
            true, // enable
            GX.ColorSrc.REG, // amb_src
            GX.ColorSrc.REG, // mat_src
            1, // light_mask, assuming we only have one directional light for now
            GX.DiffuseFunction.CLAMP, // diff_fn
            GX.AttenuationFunction.SPOT, // attn_fn
        );

        const buildState: BuildState = {
            stage: 0,
            texCoord: GX.TexCoordID.TEXCOORD0,
            texMap: GX.TexMapID.TEXMAP0,
        };
        for (let tevStageIdx = 0; tevStageIdx < this.tevStages.length; tevStageIdx++) {
            const tevStage = this.tevStages[tevStageIdx];
            mb.setTevDirect(tevStageIdx);
            mb.setTevSwapMode(buildState.stage, SWAP_TABLES[0], SWAP_TABLES[0]);
            mb.setTexCoordGen(
                buildState.texCoord,
                GX.TexGenType.MTX2x4,
                GX.TexGenSrc.TEX0,
                TEXGEN_MTXS[tevStageIdx],
            );
            const texMap = tevStage.texture !== null ? buildState.texMap : GX.TexMapID.TEXMAP_NULL;
            mb.setTevOrder(
                buildState.stage,
                buildState.texCoord,
                texMap,
                GX.RasColorChannelID.COLOR0A0,
            );

            mb.setTevColorIn(
                buildState.stage,
                tevStage.colorInA,
                tevStage.colorInB,
                tevStage.colorInC,
                tevStage.colorInD,
            );
            mb.setTevColorOp(
                buildState.stage,
                GX.TevOp.ADD,
                GX.TevBias.ZERO,
                GX.TevScale.SCALE_1,
                true,
                tevStage.colorDest,
            );
            mb.setTevAlphaIn(
                buildState.stage,
                tevStage.alphaInA,
                tevStage.alphaInB,
                tevStage.alphaInC,
                tevStage.alphaInD,
            );
            mb.setTevAlphaOp(
                buildState.stage,
                GX.TevOp.ADD,
                GX.TevBias.ZERO,
                GX.TevScale.SCALE_1,
                true,
                tevStage.alphaDest,
            );

            buildState.stage++;
            buildState.texCoord++;
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
        renderParams: RenderParams,
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

        colorCopy(materialParams.u_Color[ColorKind.MAT0], materialColor);
        colorCopy(materialParams.u_Color[ColorKind.AMB0], ambientColor);

        materialParams.u_Lights[0].copy(lighting.infLightViewSpace);

        this.setAnimatedStuff(materialParams, renderParams.t);

        this.materialHelper.allocateMaterialParamsDataOnInst(inst, materialParams);
        inst.setSamplerBindingsFromTextureMappings(materialParams.m_TextureMapping);

        // Draw params
        this.materialHelper.allocateDrawParamsDataOnInst(inst, drawParams);
    }

    private setAnimatedStuff(materialParams: MaterialParams, t: number) {
        animateScalars(this.scalarState, this.scalarAnims, t);
        animateColors(this.colorState, this.colorAnims, t);

        const translation = scratchVec3;
        for (let i = 0; i < TEXMTX_UV_CHANNELS.length; i++) {
            vec3.set(
                translation,
                this.scalarState.get(TEXMTX_UV_CHANNELS[i].u)!,
                this.scalarState.get(TEXMTX_UV_CHANNELS[i].v)!,
                0,
            );
            mat4.fromTranslation(
                materialParams.u_TexMtx[i],
                translation,
            );
        }

        for (const colorMapping of COLOR_CHANNELS) {
            const animatedColor = this.colorState.get(colorMapping.colorChannel)!;
            colorCopy(materialParams.u_Color[colorMapping.colorKind], animatedColor);
            materialParams.u_Color[colorMapping.colorKind].a = this.scalarState.get(colorMapping.alphaChannel)!;
        }

        for (const konstMapping of KONST_CHANNELS) {
            const animatedColor = this.colorState.get(konstMapping.colorChannel)!;
            colorCopy(materialParams.u_Color[konstMapping.colorKind], animatedColor);
        }
    }
}
