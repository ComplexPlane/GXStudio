import { ImGui } from "@mori2003/jsimgui";
import { colorCopy, colorFromRGBA } from "../../Color";
import { GfxDevice } from "../../gfx/platform/GfxPlatform";
import { GfxRenderCache } from "../../gfx/render/GfxRenderCache";
import { TextureCache } from "../ModelCache";
import { createIdMap, GuiShared, renderCombo } from "./GuiShared";
import { ColorAnim, ColorChannel, CurveKind, ScalarAnim, ScalarChannel } from "./Anim";

type ScalarChannelInfo = {
    id: ScalarChannel;
    label: string;
};

type ColorChannelInfo = {
    id: ColorChannel;
    label: string;
};

type InterpKindInfo = {
    id: CurveKind;
    label: string;
};

export const SCALAR_CHANNELS: ScalarChannelInfo[] = [
    { id: ScalarChannel.UV0_TranslateU, label: "TexCoord0 Translate U" },
    { id: ScalarChannel.UV0_TranslateV, label: "TexCoord0 Translate V" },
    { id: ScalarChannel.UV0_Scale, label: "TexCoord0 Scale" },

    { id: ScalarChannel.UV1_TranslateU, label: "TexCoord1 Translate U" },
    { id: ScalarChannel.UV1_TranslateV, label: "TexCoord1 Translate V" },
    { id: ScalarChannel.UV1_Scale, label: "TexCoord1 Scale" },
    
    { id: ScalarChannel.UV2_TranslateU, label: "TexCoord2 Translate U" },
    { id: ScalarChannel.UV2_TranslateV, label: "TexCoord2 Translate V" },
    { id: ScalarChannel.UV2_Scale, label: "TexCoord2 Scale" },
    
    { id: ScalarChannel.UV3_TranslateU, label: "TexCoord3 Translate U" },
    { id: ScalarChannel.UV3_TranslateV, label: "TexCoord3 Translate V" },
    { id: ScalarChannel.UV3_Scale, label: "TexCoord3 Scale" },

    { id: ScalarChannel.UV4_TranslateU, label: "TexCoord4 Translate U" },
    { id: ScalarChannel.UV4_TranslateV, label: "TexCoord4 Translate V" },
    { id: ScalarChannel.UV4_Scale, label: "TexCoord4 Scale" },

    { id: ScalarChannel.UV5_TranslateU, label: "TexCoord5 Translate U" },
    { id: ScalarChannel.UV5_TranslateV, label: "TexCoord5 Translate V" },
    { id: ScalarChannel.UV5_Scale, label: "TexCoord5 Scale" },

    { id: ScalarChannel.UV6_TranslateU, label: "TexCoord6 Translate U" },
    { id: ScalarChannel.UV6_TranslateV, label: "TexCoord6 Translate V" },
    { id: ScalarChannel.UV6_Scale, label: "TexCoord6 Scale" },

    { id: ScalarChannel.UV7_TranslateU, label: "TexCoord7 Translate U" },
    { id: ScalarChannel.UV7_TranslateV, label: "TexCoord7 Translate V" },
    { id: ScalarChannel.UV7_Scale, label: "TexCoord7 Scale" },

    { id: ScalarChannel.A0, label: "Alpha Register C0" },
    { id: ScalarChannel.A1, label: "Alpha Register C1" },
    { id: ScalarChannel.A2, label: "Alpha Register C2" },
    { id: ScalarChannel.APREV, label: "Alpha Register PREV" },
];

export const COLOR_CHANNELS: ColorChannelInfo[] = [
    { id: ColorChannel.C0, label: "Color Register C0" },
    { id: ColorChannel.C1, label: "Color Register C1" },
    { id: ColorChannel.C2, label: "Color Register C2" },
    { id: ColorChannel.CPREV, label: "Color Register PREV" },

    { id: ColorChannel.K0, label: "Color Constant K0" },
    { id: ColorChannel.K1, label: "Color Constant K1" },
    { id: ColorChannel.K2, label: "Color Constant K2" },
    { id: ColorChannel.K3, label: "Color Constant K3" },
];

const INTERP_KINDS: InterpKindInfo[] = [
    { id: CurveKind.Constant, label: "Constant" },
    { id: CurveKind.Linear, label: "Linear" },
    { id: CurveKind.Sine, label: "Sine" },
    { id: CurveKind.Saw, label: "Saw" },
    { id: CurveKind.Square, label: "Square" },
];

const SCALAR_CHANNEL_MAP = createIdMap(SCALAR_CHANNELS);
const COLOR_CHANNEL_MAP = createIdMap(COLOR_CHANNELS);
const INTERP_KIND_MAP = createIdMap(INTERP_KINDS);

const scratchNumberPtr = [0];
const scratchBoolPtr = [false];
const scratchArr3 = [0, 0, 0];

const BIG_RANGE = 4;

const enum AnimAction {
    Duplicate,
    Delete,
}

export class AnimationsGui {
    constructor(
        private device: GfxDevice,
        private renderCache: GfxRenderCache,
        private textureCache: TextureCache,
        private s: GuiShared,
    ) {}

    public render() {
        if (!ImGui.BeginChild("Animations Gui")) {
            return;
        }

        const material = this.s.currMaterial;
        if (material === null) {
            return;
        }

        if (ImGui.CollapsingHeader(`Scalar Channels`, ImGui.TreeNodeFlags.DefaultOpen)) {
            if (ImGui.Button("Add Scalar Animation")) {
                const anim: ScalarAnim = {
                    uuid: crypto.randomUUID(),
                    enabled: true,
                    channel: ScalarChannel.UV0_TranslateU,
                    start: 0,
                    end: 1,
                    curveKind: CurveKind.Constant,
                    phaseOffset: 0,
                    speed: 1,
                };
                material.scalarAnims.push(anim);
            }

            let dupIdx: number | null = null;
            let delIdx: number | null = null;
            for (let i = 0; i < material.scalarAnims.length; i++) {
                const scalarAnim = material.scalarAnims[i];
                const action = this.renderScalarAnim(scalarAnim);
                if (action === AnimAction.Duplicate) {
                    dupIdx = dupIdx ?? i;
                }
                if (action === AnimAction.Delete) {
                    delIdx = delIdx ?? i;
                }
            }
            if (dupIdx !== null) {
                const animClone = {
                    ...material.scalarAnims[dupIdx],
                    uuid: crypto.randomUUID(),
                };
                material.scalarAnims.splice(dupIdx + 1, 0, animClone);
            } else if (delIdx !== null) {
                material.scalarAnims.splice(delIdx, 1);
            }
        }
        ImGui.Spacing();

        if (ImGui.CollapsingHeader(`Color Channels`, ImGui.TreeNodeFlags.DefaultOpen)) {
            if (ImGui.Button("Add Color Animation")) {
                const anim: ColorAnim = {
                    uuid: crypto.randomUUID(),
                    enabled: true,
                    channel: ColorChannel.C0,
                    start: { r: 0, g: 0, b: 0, a: 1 },
                    end: { r: 0, g: 0, b: 0, a: 1 },
                    curveKind: CurveKind.Constant,
                    phaseOffset: 0,
                    speed: 1,
                };
                material.colorAnims.push(anim);
            }

            let dupIdx: number | null = null;
            let delIdx: number | null = null;
            for (let i = 0; i < material.colorAnims.length; i++) {
                const colorAnim = material.colorAnims[i];
                const action = this.renderColorAnim(colorAnim);
                if (action === AnimAction.Duplicate) {
                    dupIdx = dupIdx ?? i;
                }
                if (action === AnimAction.Delete) {
                    delIdx = delIdx ?? i;
                }
            }
            if (dupIdx !== null) {
                const animClone = {
                    ...material.colorAnims[dupIdx],
                    uuid: crypto.randomUUID(),
                };
                material.colorAnims.splice(dupIdx + 1, 0, animClone);
            } else if (delIdx !== null) {
                material.colorAnims.splice(delIdx, 1);
            }
        }

        ImGui.EndChild();
    }

    private renderScalarAnim(anim: ScalarAnim): AnimAction | null {
        let action: AnimAction | null = null;

        const selectedChannel = SCALAR_CHANNEL_MAP.get(anim.channel)!;
        const treeName = `${selectedChannel.label}###${anim.uuid}`;
        if (ImGui.TreeNodeEx(treeName, ImGui.TreeNodeFlags.DefaultOpen)) {
            const b = scratchBoolPtr;
            b[0] = anim.enabled;
            ImGui.Checkbox("Enabled", b);
            anim.enabled = b[0];
            anim.channel = renderCombo(
                "Scalar Channel",
                SCALAR_CHANNELS,
                selectedChannel,
                (c) => c.label,
            ).id;

            this.renderInterp(anim);

            const n = scratchNumberPtr;
            if (anim.curveKind === CurveKind.Constant) {
                n[0] = anim.start;
                ImGui.SliderFloat("Value", n, -BIG_RANGE, BIG_RANGE);
                anim.start = n[0];
            } else {
                n[0] = anim.start;
                ImGui.SliderFloat("Start Value", n, -BIG_RANGE, BIG_RANGE);
                anim.start = n[0];
                n[0] = anim.end;
                ImGui.SliderFloat("End Value", n, -BIG_RANGE, BIG_RANGE);
                anim.end = n[0];
            }

            if (ImGui.Button("Duplicate")) {
                action = AnimAction.Duplicate;
            }
            ImGui.SameLine();
            if (ImGui.Button("Delete")) {
                action = AnimAction.Delete;
            }

            ImGui.TreePop();
        }

        return action;
    }

    private renderColorAnim(anim: ColorAnim): AnimAction | null {
        let action: AnimAction | null = null;

        const selectedChannel = COLOR_CHANNEL_MAP.get(anim.channel)!;
        const treeName = `${selectedChannel.label}###${anim.uuid}`;
        if (ImGui.TreeNodeEx(treeName, ImGui.TreeNodeFlags.DefaultOpen)) {
            const b = scratchBoolPtr;
            b[0] = anim.enabled;
            ImGui.Checkbox("Enabled", b);
            anim.enabled = b[0];
            anim.channel = renderCombo(
                "Color Channel",
                COLOR_CHANNELS,
                selectedChannel,
                (c) => c.label,
            ).id;

            this.renderInterp(anim);

            const arr3 = scratchArr3;
            if (anim.curveKind === CurveKind.Constant) {
                arr3[0] = anim.start.r;
                arr3[1] = anim.start.g;
                arr3[2] = anim.start.b;
                ImGui.ColorEdit3("Color", arr3);
                colorFromRGBA(anim.start, arr3[0], arr3[1], arr3[2]);
                colorCopy(anim.end, anim.start);
            } else {
                arr3[0] = anim.start.r;
                arr3[1] = anim.start.g;
                arr3[2] = anim.start.b;
                ImGui.ColorEdit3("Start Color", arr3);
                colorFromRGBA(anim.start, arr3[0], arr3[1], arr3[2]);

                arr3[0] = anim.end.r;
                arr3[1] = anim.end.g;
                arr3[2] = anim.end.b;
                ImGui.ColorEdit3("End Color", arr3);
                colorFromRGBA(anim.end, arr3[0], arr3[1], arr3[2]);
            }

            if (ImGui.Button("Duplicate")) {
                action = AnimAction.Duplicate;
            }
            ImGui.SameLine();
            if (ImGui.Button("Delete")) {
                action = AnimAction.Delete;
            }

            ImGui.TreePop();
        }

        return action;
    }

    private renderInterp(anim: { curveKind: CurveKind; phaseOffset: number; speed: number }) {
        anim.curveKind = renderCombo(
            "Curve",
            INTERP_KINDS,
            INTERP_KIND_MAP.get(anim.curveKind)!,
            (i) => i.label,
        ).id;

        const n = scratchNumberPtr;
        if (anim.curveKind !== CurveKind.Constant) {
            n[0] = anim.phaseOffset;
            ImGui.SliderFloat("Phase Offset", n, 0, 1);
            anim.phaseOffset = n[0];

            n[0] = anim.speed;
            ImGui.SliderFloat("Speed", n, 0, BIG_RANGE, undefined);
            anim.speed = n[0];
        }
    }
}
