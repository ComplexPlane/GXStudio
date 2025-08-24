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
import { ImTextureRef } from "@mori2003/jsimgui";
import { MaterialInst, TextureInst } from "./MaterialInst.js";

export type Texture = {
    imguiTextureIds: ImTextureRef[], // Loaded imgui textures, one per mip level
    gxTexture: TextureInputGX, // Original GX texture for passing to TextureCache
}

export type TevStage = {
    uuid: string,

    colorInA: GX.CC,
    colorInB: GX.CC,
    colorInC: GX.CC,
    colorInD: GX.CC,
    colorDest: GX.Register,
    colorOp: GX.TevOp,

    alphaInA: GX.CA,
    alphaInB: GX.CA,
    alphaInC: GX.CA,
    alphaInD: GX.CA,
    alphaDest: GX.Register,
    alphaOp: GX.TevOp,

    texture: Texture | null,
    textureWrapU: GX.WrapMode,
    textureWrapV: GX.WrapMode,
}

export function newWhiteTevStage(): TevStage {
    return {
        uuid: crypto.randomUUID(),

        colorInA: GX.CC.ZERO,
        colorInB: GX.CC.ZERO,
        colorInC: GX.CC.ZERO,
        colorInD: GX.CC.ONE,
        colorDest: GX.Register.PREV,
        colorOp: GX.TevOp.ADD,

        alphaInA: GX.CA.ZERO,
        alphaInB: GX.CA.ZERO,
        alphaInC: GX.CA.ZERO,
        alphaInD: GX.CA.RASA,
        alphaDest: GX.Register.PREV,
        alphaOp: GX.TevOp.ADD,

        texture: null,
        textureWrapU: GX.WrapMode.REPEAT,
        textureWrapV: GX.WrapMode.REPEAT,
    }
}

export function newPassthroughTevStage(prevTevStage: TevStage): TevStage {
    const tevStage = newWhiteTevStage();

    tevStage.colorInA = GX.CC.ZERO;
    tevStage.colorInB = GX.CC.ZERO;
    tevStage.colorInC = GX.CC.ZERO;
    if (prevTevStage.colorDest === GX.Register.PREV) {
        tevStage.colorInD = GX.CC.CPREV;
    } else if (prevTevStage.colorDest === GX.Register.REG0) {
        tevStage.colorInD = GX.CC.C0;
    } else if (prevTevStage.colorDest === GX.Register.REG1) {
        tevStage.colorInD = GX.CC.C1;
    } else if (prevTevStage.colorDest === GX.Register.REG2) {
        tevStage.colorInD = GX.CC.C2;
    }

    tevStage.alphaInA = GX.CA.ZERO;
    tevStage.alphaInB = GX.CA.ZERO;
    tevStage.alphaInC = GX.CA.ZERO;
    if (prevTevStage.alphaDest === GX.Register.PREV) {
        tevStage.alphaInD = GX.CA.APREV;
    } else if (prevTevStage.alphaDest === GX.Register.REG0) {
        tevStage.alphaInD = GX.CA.A0;
    } else if (prevTevStage.alphaDest === GX.Register.REG1) {
        tevStage.alphaInD = GX.CA.A1;
    } else if (prevTevStage.alphaDest === GX.Register.REG2) {
        tevStage.alphaInD = GX.CA.A2;
    }

    return tevStage;
}


export class Material {
    public tevStages = [newWhiteTevStage()];
    public scalarAnims: ScalarAnim[] = [];
    public colorAnims: ColorAnim[] = [];
    public instances: Map<GX.CullMode, MaterialInst>;

    private dummyTevStages = [newWhiteTevStage()];

    constructor(
        private device: GfxDevice,
        private renderCache: GfxRenderCache,
        private textureCache: TextureCache,
        public name: string,
    ) {
        this.rebuild();
    }

    public rebuild() {
        // Make dummy tev stage if there aren't any
        const tevStages = this.tevStages.length !== 0 ? this.tevStages : this.dummyTevStages;

        const textures = [];
        for (let tevStage of tevStages) {
            if (tevStage.texture !== null) {
                textures.push(new TextureInst(
                    this.device,
                    this.renderCache,
                    this.textureCache,
                    tevStage.texture.gxTexture,
                    tevStage.textureWrapU,
                    tevStage.textureWrapV,
                ));
            }
        }

        this.instances = new Map<GX.CullMode, MaterialInst>();
        for (let cullMode of [GX.CullMode.BACK, GX.CullMode.FRONT, GX.CullMode.ALL, GX.CullMode.NONE]) {
            const materialInst = new MaterialInst(tevStages, textures, this.scalarAnims, this.colorAnims, cullMode);
            this.instances.set(cullMode, materialInst);
        }
    }

    public clone(name: string): Material {
        const newMaterial = new Material(this.device, this.renderCache, this.textureCache, name);
        newMaterial.tevStages = this.tevStages.map((t) => { 
            return { ...t, uuid: crypto.randomUUID() }; 
        });
        newMaterial.scalarAnims = this.scalarAnims.map((a) => {
            const clone = structuredClone(a);
            clone.uuid = crypto.randomUUID();
            return clone;
        });
        newMaterial.colorAnims = this.colorAnims.map((a) => {
            const clone = structuredClone(a);
            clone.uuid = crypto.randomUUID();
            return clone;
        });
        newMaterial.rebuild();
        return newMaterial;
    }
}

export type Mesh = {
    material: Material | null,
}

export type Model = {
    name: string,
    visible: boolean,
    hover: boolean,
    meshes: Mesh[],
}

export type GuiScene = {
    models: Model[],
    materials: Material[],
}

export const enum ScalarChannel {
    UV0_TranlateU,
    UV0_TranlateV,
    UV1_TranlateU,
    UV1_TranlateV,
    UV2_TranlateU,
    UV2_TranlateV,
    UV3_TranlateU,
    UV3_TranlateV,
    UV4_TranlateU,
    UV4_TranlateV,
    UV5_TranlateU,
    UV5_TranlateV,
    UV6_TranlateU,
    UV6_TranlateV,
    UV7_TranlateU,
    UV7_TranlateV,

    A0,
    A1,
    A2,
    APREV,
}

export const enum ColorChannel {
    C0,
    C1,
    C2,
    CPREV,
}

export const enum InterpKind {
    Constant,
    Linear,
    Sine,
    Saw,
    Square,
};

export type ScalarAnim = {
    uuid: string,
    channel: ScalarChannel,

    curveKind: InterpKind,
    phaseOffset: number,
    speed: number,

    start: number,
    end: number,
};

export type ColorAnim = {
    uuid: string,
    channel: ColorChannel,

    curveKind: InterpKind,
    phaseOffset: number,
    speed: number,
    space: "RGB" | "HSL",

    start: Color,
    end: Color,
};