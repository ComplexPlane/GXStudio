import { Color, colorAdd, colorCopy, colorLerp, colorNewCopy, OpaqueBlack } from "../../Color.js";
import { COLOR_CHANNELS, SCALAR_CHANNELS } from "./AnimationsGui.js";
import { ColorAnim, ColorChannel, CurveKind, ScalarAnim, ScalarChannel } from "./Scene.js";

export type ScalarState = Map<ScalarChannel, number>;
export type ColorState = Map<ColorChannel, Color>;

export function newScalarState(): ScalarState {
    return new Map(SCALAR_CHANNELS.map((s) => [s.id, 0]));
}

export function newColorState(): ColorState {
    return new Map(COLOR_CHANNELS.map((c) => [c.id, colorNewCopy(OpaqueBlack)]));
}

function animateCurve(curveKind: CurveKind, phaseOffset: number, speed: number, t: number): number {
    t = ((t + phaseOffset) * speed) % 1;
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
    t = animateCurve(anim.curveKind, anim.phaseOffset, anim.speed, t);
    return (1 - t) * anim.start + t * anim.end;
}

function animateColor(anim: ColorAnim, t: number, outColor: Color) {
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