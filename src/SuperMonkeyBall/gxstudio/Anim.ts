import { Color, colorAdd, colorCopy, colorLerp, colorNewCopy, OpaqueBlack } from "../../Color.js";
import { mod } from "../../util.js";
import { COLOR_CHANNELS, SCALAR_CHANNELS } from "./AnimationsGui.js";

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
    K0,
    K1,
    K2,
    K3,
}

export const enum CurveKind {
    Constant,
    Linear,
    Sine,
    Saw,
    Square,
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
        return Math.sin(t * 2 * Math.PI) * 2 + 1;
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
    for (let key of dstScalarState.keys()) {
        dstScalarState.set(key, 0);
    }
    for (let anim of anims) {
        const curr = dstScalarState.get(anim.channel)!;
        dstScalarState.set(anim.channel, curr + animateScalar(anim, t));
    }
}

const scratchColor1 = colorNewCopy(OpaqueBlack);

export function animateColors(dstScalarState: ColorState, anims: ColorAnim[], t: number) {
    const tmpColor = scratchColor1;
    for (let color of dstScalarState.values()) {
        colorCopy(color, OpaqueBlack);
    }
    for (let anim of anims) {
        const curr = dstScalarState.get(anim.channel)!;
        animateColor(anim, t, tmpColor);
        colorAdd(curr, curr, tmpColor);
    }
}