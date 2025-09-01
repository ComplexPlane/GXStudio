import { Color, colorAdd, colorCopy, colorLerp, colorNewCopy, OpaqueBlack } from "../../Color.js";
import { mod } from "../../util.js";
import { COLOR_CHANNELS, SCALAR_CHANNELS } from "./AnimationsGui.js";

export enum ScalarChannel {
    // Do not change these values, they're part of the export schema
    UV0_TranslateU = 0,
    UV0_TranslateV = 1,
    UV1_TranslateU = 2,
    UV1_TranslateV = 3,
    UV2_TranslateU = 4,
    UV2_TranslateV = 5,
    UV3_TranslateU = 6,
    UV3_TranslateV = 7,
    UV4_TranslateU = 8,
    UV4_TranslateV = 9,
    UV5_TranslateU = 10,
    UV5_TranslateV = 11,
    UV6_TranslateU = 12,
    UV6_TranslateV = 13,
    UV7_TranslateU = 14,
    UV7_TranslateV = 15,

    A0 = 16,
    A1 = 17,
    A2 = 18,
    APREV = 19,

    UV0_Scale = 20,
    UV1_Scale = 21,
    UV2_Scale = 22,
    UV3_Scale = 23,
    UV4_Scale = 24,
    UV5_Scale = 25,
    UV6_Scale = 26,
    UV7_Scale = 27,
}

const SCALE_CHANNELS = [
    ScalarChannel.UV0_Scale,
    ScalarChannel.UV1_Scale,
    ScalarChannel.UV2_Scale,
    ScalarChannel.UV3_Scale,
    ScalarChannel.UV4_Scale,
    ScalarChannel.UV5_Scale,
    ScalarChannel.UV6_Scale,
    ScalarChannel.UV7_Scale,
];

export enum ColorChannel {
    // Do not change these values, they're part of the export schema
    C0 = 0,
    C1 = 1,
    C2 = 2,
    CPREV = 3,
    K0 = 4,
    K1 = 5,
    K2 = 6,
    K3 = 7,
}

export enum CurveKind {
    // Do not change these values, they're part of the export schema
    Constant = 0,
    Linear = 1,
    Sine = 2,
    Saw = 3,
    Square = 4,
}

export type ScalarAnim = {
    uuid: string;
    enabled: boolean;
    channel: ScalarChannel;

    curveKind: CurveKind;
    phaseOffset: number;
    speed: number;

    start: number;
    end: number;
};

export type ColorAnim = {
    uuid: string;
    enabled: boolean;
    channel: ColorChannel;

    curveKind: CurveKind;
    phaseOffset: number;
    speed: number;

    start: Color;
    end: Color;
};

export type ScalarState = Map<ScalarChannel, number>;
export type ColorState = Map<ColorChannel, Color>;

export function newScalarState(): ScalarState {
    return new Map(SCALAR_CHANNELS.map((s) => [s.id, 0]));
}

export function newColorState(): ColorState {
    return new Map(COLOR_CHANNELS.map((c) => [c.id, colorNewCopy(OpaqueBlack)]));
}

function animateCurve(curveKind: CurveKind, phaseOffset: number, speed: number, t: number): number {
    if (Math.abs(speed) < 0.00001) {
        return 0;
    }
    t = mod(mod(t, 1 / speed) * speed + phaseOffset, 1);
    if (curveKind === CurveKind.Constant) {
        return 0;
    } else if (curveKind === CurveKind.Linear) {
        return t;
    } else if (curveKind === CurveKind.Sine) {
        return (Math.sin(t * 2 * Math.PI) + 1) * 0.5;
    } else if (curveKind === CurveKind.Saw) {
        return t > 0.5 ? (1 - t) * 2 : t * 2;
    } else if (curveKind === CurveKind.Square) {
        return t > 0.5 ? 1 : 0;
    }
    throw "Unhandled curve kind";
}

function animateScalar(anim: ScalarAnim, t: number): number {
    if (!anim.enabled) {
        return 0;
    }
    t = animateCurve(anim.curveKind, anim.phaseOffset, anim.speed, t);
    return (1 - t) * anim.start + t * anim.end;
}

function animateColor(anim: ColorAnim, t: number, outColor: Color) {
    if (!anim.enabled) {
        colorCopy(outColor, OpaqueBlack);
        return;
    }
    t = animateCurve(anim.curveKind, anim.phaseOffset, anim.speed, t);
    colorLerp(outColor, anim.start, anim.end, t);
}

export function animateScalars(dstScalarState: ScalarState, anims: ScalarAnim[], t: number) {
    // Set to defaults
    for (let key of dstScalarState.keys()) {
        if (SCALE_CHANNELS.includes(key)) {
            dstScalarState.set(key, 1);
        } else {
            dstScalarState.set(key, 0);
        }
    }
    // Apply specifieds animations
    for (let anim of anims) {
        const curr = dstScalarState.get(anim.channel)!;
        if (SCALE_CHANNELS.includes(anim.channel)) {
            dstScalarState.set(anim.channel, curr * animateScalar(anim, t));
        } else {
            dstScalarState.set(anim.channel, curr + animateScalar(anim, t));
        }
    }
}

const scratchColor1 = colorNewCopy(OpaqueBlack);

export function animateColors(dstColorState: ColorState, anims: ColorAnim[], t: number) {
    const tmpColor = scratchColor1;
    for (let color of dstColorState.values()) {
        colorCopy(color, OpaqueBlack);
    }
    for (let anim of anims) {
        const curr = dstColorState.get(anim.channel)!;
        animateColor(anim, t, tmpColor);
        colorAdd(curr, curr, tmpColor);
    }
}
