import { ImTextureRef } from "@mori2003/jsimgui";
import { Color } from "../../Color.js";
import { GfxDevice } from "../../gfx/platform/GfxPlatform.js";
import { GfxRenderCache } from "../../gfx/render/GfxRenderCache.js";
import * as GX from "../../gx/gx_enum.js";
import { TextureInputGX } from "../../gx/gx_texture.js";
import { TextureCache } from "../ModelCache.js";
import { ColorAnim, ScalarAnim } from "./Anim.js";
import { MaterialInst } from "./MaterialInst.js";
import { TextureInst } from "./TextureInst.js";

export type Texture = {
    idx: number;
    imguiTextureIds: ImTextureRef[]; // Loaded imgui textures, one per mip level
    gxTexture: TextureInputGX; // Original GX texture for passing to TextureCache
};

export type TextureRefResolved = {
    kind: "resolved";
    texture: Texture;
};

export type TextureRefStale = {
    kind: "stale";
    staleIdx: number;
};

export type TextureRefNone = {
    kind: "none";
};

export type TextureRef = TextureRefResolved | TextureRefStale | TextureRefNone;

export type TevStage = {
    uuid: string;

    kcsel: GX.KonstColorSel; // Dummy if GX.CC.KONST unused
    colorInA: GX.CC;
    colorInB: GX.CC;
    colorInC: GX.CC;
    colorInD: GX.CC;
    colorDest: GX.Register;
    colorOp: GX.TevOp;

    alphaInA: GX.CA;
    alphaInB: GX.CA;
    alphaInC: GX.CA;
    alphaInD: GX.CA;
    alphaDest: GX.Register;
    alphaOp: GX.TevOp;

    texture: TextureRef;
    textureWrapU: GX.WrapMode;
    textureWrapV: GX.WrapMode;
};

export function newWhiteTevStage(): TevStage {
    return {
        uuid: crypto.randomUUID(),

        kcsel: GX.KonstColorSel.KCSEL_K0,
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

        texture: { kind: "none" },
        textureWrapU: GX.WrapMode.REPEAT,
        textureWrapV: GX.WrapMode.REPEAT,
    };
}

export function newLitTextureTevStage(): TevStage {
    return {
        uuid: crypto.randomUUID(),

        kcsel: GX.KonstColorSel.KCSEL_K0,
        colorInA: GX.CC.ZERO,
        colorInB: GX.CC.RASC,
        colorInC: GX.CC.TEXC,
        colorInD: GX.CC.ZERO,
        colorDest: GX.Register.PREV,
        colorOp: GX.TevOp.ADD,

        alphaInA: GX.CA.ZERO,
        alphaInB: GX.CA.ZERO,
        alphaInC: GX.CA.ZERO,
        alphaInD: GX.CA.RASA,
        alphaDest: GX.Register.PREV,
        alphaOp: GX.TevOp.ADD,

        texture: { kind: "none" },
        textureWrapU: GX.WrapMode.REPEAT,
        textureWrapV: GX.WrapMode.REPEAT,
    };
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

export function createInsertedTevStage(): TevStage {
    const tevStage = newWhiteTevStage();

    // Set color inputs to use PREV register for passthrough behavior
    tevStage.colorInA = GX.CC.ZERO;
    tevStage.colorInB = GX.CC.ZERO;
    tevStage.colorInC = GX.CC.ZERO;
    tevStage.colorInD = GX.CC.CPREV;
    tevStage.colorDest = GX.Register.PREV;

    // Set alpha inputs to use PREV register for passthrough behavior
    tevStage.alphaInA = GX.CA.ZERO;
    tevStage.alphaInB = GX.CA.ZERO;
    tevStage.alphaInC = GX.CA.ZERO;
    tevStage.alphaInD = GX.CA.APREV;
    tevStage.alphaDest = GX.Register.PREV;

    return tevStage;
}

export class Material {
    public uuid: string;
    public tevStages = [newLitTextureTevStage()];
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
        this.uuid = crypto.randomUUID();
        this.rebuild();
    }

    public rebuild() {
        // Make dummy tev stage if there aren't any
        const tevStages = this.tevStages.length !== 0 ? this.tevStages : this.dummyTevStages;

        const textures = [];
        for (let tevStage of tevStages) {
            if (tevStage.texture.kind === "resolved") {
                textures.push(
                    new TextureInst(
                        this.device,
                        this.renderCache,
                        this.textureCache,
                        tevStage.texture.texture.gxTexture,
                        tevStage.textureWrapU,
                        tevStage.textureWrapV,
                    ),
                );
            }
        }

        this.instances = new Map<GX.CullMode, MaterialInst>();
        for (let cullMode of [
            GX.CullMode.BACK,
            GX.CullMode.FRONT,
            GX.CullMode.ALL,
            GX.CullMode.NONE,
        ]) {
            const materialInst = new MaterialInst(
                tevStages,
                textures,
                this.scalarAnims,
                this.colorAnims,
                cullMode,
            );
            this.instances.set(cullMode, materialInst);
        }
    }

    public clone(name: string): Material {
        const newMaterial = new Material(this.device, this.renderCache, this.textureCache, name);
        newMaterial.uuid = crypto.randomUUID();
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
    material: Material | null;
};

export type Model = {
    name: string;
    visible: boolean;
    hover: boolean;
    meshes: Mesh[];
};


