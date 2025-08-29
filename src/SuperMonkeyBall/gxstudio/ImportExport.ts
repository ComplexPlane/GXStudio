import * as z from "zod";
import { ColorAnim, ColorChannel, CurveKind, ScalarAnim, ScalarChannel } from "./Anim";
import * as GX from "../../gx/gx_enum.js";
import { Material, TevStage, Texture, TextureRef } from "./Scene";

const SCHEMA_VERSION = "1.0.0";

const SCALAR_CHANNEL_SCHEMA = z.enum(ScalarChannel);
const COLOR_CHANNEL_SCHEMA = z.enum(ColorChannel);
const CURVE_KIND_SCHEMA = z.enum(CurveKind);

const COLOR_SCHEMA = z.object({
    r: z.number().min(0).max(1),
    g: z.number().min(0).max(1),
    b: z.number().min(0).max(1),
    a: z.number().min(0).max(1),
});

const SCALAR_ANIM_SCHEMA = z.object({
    uuid: z.uuid(),
    enabled: z.boolean(),
    channel: SCALAR_CHANNEL_SCHEMA,
    curveKind: CURVE_KIND_SCHEMA,
    phaseOffset: z.number(),
    speed: z.number(),
    start: z.number(),
    end: z.number(),
});

const COLOR_ANIM_SCHEMA = z.object({
    uuid: z.uuid(),
    enabled: z.boolean(),
    channel: COLOR_CHANNEL_SCHEMA,
    curveKind: CURVE_KIND_SCHEMA,
    phaseOffset: z.number(),
    speed: z.number(),
    start: COLOR_SCHEMA,
    end: COLOR_SCHEMA,
});

const TEXTURE_REF_SCHEMA = z.union([z.number().min(0), z.null()]);

const TEV_STAGE_SCHEMA = z.object({
    uuid: z.uuid(),

    kcsel: z.enum(GX.KonstColorSel),
    colorInA: z.enum(GX.CC),
    colorInB: z.enum(GX.CC),
    colorInC: z.enum(GX.CC),
    colorInD: z.enum(GX.CC),
    colorDest: z.enum(GX.Register),
    colorOp: z.enum(GX.TevOp),

    alphaInA: z.enum(GX.CA),
    alphaInB: z.enum(GX.CA),
    alphaInC: z.enum(GX.CA),
    alphaInD: z.enum(GX.CA),
    alphaDest: z.enum(GX.Register),
    alphaOp: z.enum(GX.TevOp),

    texture: TEXTURE_REF_SCHEMA,
    textureWrapU: z.enum(GX.WrapMode),
    textureWrapV: z.enum(GX.WrapMode),
});

const MATERIAL_SCHEMA = z.object({
    uuid: z.uuid(),
    name: z.string(),
    tevStages: z.array(TEV_STAGE_SCHEMA),
    scalarAnims: z.array(SCALAR_ANIM_SCHEMA),
    colorAnims: z.array(COLOR_ANIM_SCHEMA),
});

const ROOT_SCHEMA = z.object({
    version: z.string(),
    materials: z.array(MATERIAL_SCHEMA),
});

function encodeTextureRef(ref: TextureRef): z.infer<typeof TEXTURE_REF_SCHEMA> {
    switch (ref.kind) {
        case "resolved":
            return ref.texture.idx;
        case "stale":
            return ref.staleIdx;
        case "none":
            return null;
    }
}

function decodeTextureRef(
    ref: z.infer<typeof TEXTURE_REF_SCHEMA>,
    textures: Texture[],
): TextureRef {
    if (ref === null) {
        return { kind: "none" };
    }
    if (ref < textures.length) {
        return { kind: "resolved", texture: textures[ref] };
    }
    return { kind: "stale", staleIdx: ref };
}

export function encodeRoot(materials: Material[]): z.infer<typeof ROOT_SCHEMA> {
    return {
        version: SCHEMA_VERSION,
        materials: materials.map(encodeMaterial),
    };
}

export function decodeRoot(
    j: any,
    textures: Texture[],
    newMaterialFunc: (name: string) => Material,
): Material[] | string {
    const root = ROOT_SCHEMA.safeParse(j);
    if (!root.success) {
        return `Failed to parse materials JSON: ${root.error.message}`;
    }
    return root.data.materials.map((m) => decodeMaterial(m, textures, newMaterialFunc));
}

function encodeMaterial(m: Material): z.infer<typeof MATERIAL_SCHEMA> {
    return {
        uuid: m.uuid,
        name: m.name,
        tevStages: m.tevStages.map(encodeTevStage),
        scalarAnims: m.scalarAnims.map(encodeScalarAnim),
        colorAnims: m.colorAnims.map(encodeColorAnim),
    };
}

function decodeMaterial(
    m: z.infer<typeof MATERIAL_SCHEMA>,
    textures: Texture[],
    newMaterialFunc: (name: string) => Material,
): Material {
    const material = newMaterialFunc(m.name);
    material.uuid = m.uuid;
    material.tevStages = m.tevStages.map((s) => decodeTevStage(s, textures));
    material.scalarAnims = m.scalarAnims.map(decodeScalarAnim);
    material.colorAnims = m.colorAnims.map(decodeColorAnim);
    return material;
}

function encodeTevStage(stage: TevStage): z.infer<typeof TEV_STAGE_SCHEMA> {
    return {
        uuid: stage.uuid,
        kcsel: stage.kcsel,
        colorInA: stage.colorInA,
        colorInB: stage.colorInB,
        colorInC: stage.colorInC,
        colorInD: stage.colorInD,
        colorDest: stage.colorDest,
        colorOp: stage.colorOp,
        alphaInA: stage.alphaInA,
        alphaInB: stage.alphaInB,
        alphaInC: stage.alphaInC,
        alphaInD: stage.alphaInD,
        alphaDest: stage.alphaDest,
        alphaOp: stage.alphaOp,
        texture: encodeTextureRef(stage.texture),
        textureWrapU: stage.textureWrapU,
        textureWrapV: stage.textureWrapV,
    };
}

function decodeTevStage(stage: z.infer<typeof TEV_STAGE_SCHEMA>, textures: Texture[]): TevStage {
    return {
        uuid: stage.uuid,
        kcsel: stage.kcsel,
        colorInA: stage.colorInA,
        colorInB: stage.colorInB,
        colorInC: stage.colorInC,
        colorInD: stage.colorInD,
        colorDest: stage.colorDest,
        colorOp: stage.colorOp,
        alphaInA: stage.alphaInA,
        alphaInB: stage.alphaInB,
        alphaInC: stage.alphaInC,
        alphaInD: stage.alphaInD,
        alphaDest: stage.alphaDest,
        alphaOp: stage.alphaOp,
        texture: decodeTextureRef(stage.texture, textures),
        textureWrapU: stage.textureWrapU,
        textureWrapV: stage.textureWrapV,
    };
}

function encodeScalarAnim(anim: ScalarAnim): z.infer<typeof SCALAR_ANIM_SCHEMA> {
    return {
        uuid: anim.uuid,
        enabled: anim.enabled,
        channel: anim.channel,
        curveKind: anim.curveKind,
        phaseOffset: anim.phaseOffset,
        speed: anim.speed,
        start: anim.start,
        end: anim.end,
    };
}

function decodeScalarAnim(anim: z.infer<typeof SCALAR_ANIM_SCHEMA>): ScalarAnim {
    return {
        uuid: anim.uuid,
        enabled: anim.enabled,
        channel: anim.channel,
        curveKind: anim.curveKind,
        phaseOffset: anim.phaseOffset,
        speed: anim.speed,
        start: anim.start,
        end: anim.end,
    };
}

function encodeColorAnim(anim: ColorAnim): z.infer<typeof COLOR_ANIM_SCHEMA> {
    return {
        uuid: anim.uuid,
        enabled: anim.enabled,
        channel: anim.channel,
        curveKind: anim.curveKind,
        phaseOffset: anim.phaseOffset,
        speed: anim.speed,
        start: anim.start,
        end: anim.end,
    };
}

function decodeColorAnim(anim: z.infer<typeof COLOR_ANIM_SCHEMA>): ColorAnim {
    return {
        uuid: anim.uuid,
        enabled: anim.enabled,
        channel: anim.channel,
        curveKind: anim.curveKind,
        phaseOffset: anim.phaseOffset,
        speed: anim.speed,
        start: anim.start,
        end: anim.end,
    };
}
