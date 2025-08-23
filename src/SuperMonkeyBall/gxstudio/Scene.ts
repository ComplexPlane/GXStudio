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

export class TevStage {
    private uuid: string;

    public colorInA = GX.CC.ZERO;
    public colorInB = GX.CC.ZERO;
    public colorInC = GX.CC.ZERO;
    public colorInD = GX.CC.ONE;
    public colorDest = GX.Register.PREV;
    public colorOp = GX.TevOp.ADD;

    public alphaInA = GX.CA.ZERO;
    public alphaInB = GX.CA.ZERO;
    public alphaInC = GX.CA.ZERO;
    public alphaInD = GX.CA.RASA;
    public alphaDest = GX.Register.PREV;
    public alphaOp = GX.TevOp.ADD;

    public texture: Texture | null = null;
    public textureWrapU = GX.WrapMode.REPEAT;
    public textureWrapV = GX.WrapMode.REPEAT;

    constructor() {
        this.uuid = crypto.randomUUID();
    }

    public getUuid(): string {
        return this.uuid;
    }

    public clone(): TevStage {
        return { ...this, uuid: crypto.randomUUID() };
    }
}

export class Material {
    public tevStages = [new TevStage()];
    public scalarAnims: ScalarAnim[] = [];
    public colorAnims: ColorAnim[] = [];
    public instances: Map<GX.CullMode, MaterialInst>;

    private dummyTevStages = [new TevStage()];

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
        newMaterial.tevStages = this.tevStages.map((t) => t.clone());
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
    Linear,
    Sine,
    Saw,
    Square,
};

export type Interp = {
    kind: InterpKind,
    offset: number,
    scale: number,
    speed: number,
};

export type ScalarAnim = {
    channel: ScalarChannel,
    start: number,
    end: number,
    interp: Interp,
};

export type ColorAnim = {
    channel: ColorChannel,
    start: Color,
    end: Color,
    interp: Interp,
    interpSpace: "RGB" | "HSL",
};