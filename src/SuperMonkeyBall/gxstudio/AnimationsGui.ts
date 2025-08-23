import { ImGui, ImVec2 } from "@mori2003/jsimgui";
import { GfxDevice } from "../../gfx/platform/GfxPlatform";
import { GfxRenderCache } from "../../gfx/render/GfxRenderCache";
import { TextureCache } from "../ModelCache";
import { ColorAnim, ColorChannel, Interp, InterpKind, Material, Model, ScalarAnim, ScalarChannel, Texture } from "./Scene";
import { MaterialListGui } from "./MaterialListGui";
import { OpaqueBlack } from "../../Color";
import { createIdMap, renderCombo } from "./GuiUtils";

type ScalarChannelInfo = {
    id: ScalarChannel,
    label: string,
};

type ColorChannelInfo = {
    id: ColorChannel,
    label: string,
};

type InterpKindInfo = {
    id: InterpKind,
    label: string,
}

const SCALAR_CHANNELS: ScalarChannelInfo[] = [
    { id: ScalarChannel.UV0_TranlateU, label: "TexCoord0 Translate U" },
    { id: ScalarChannel.UV0_TranlateV, label: "TexCoord0 Translate V" },
    { id: ScalarChannel.UV1_TranlateU, label: "TexCoord1 Translate U" },
    { id: ScalarChannel.UV1_TranlateV, label: "TexCoord1 Translate V" },
    { id: ScalarChannel.UV2_TranlateU, label: "TexCoord2 Translate U" },
    { id: ScalarChannel.UV2_TranlateV, label: "TexCoord2 Translate V" },
    { id: ScalarChannel.UV3_TranlateU, label: "TexCoord3 Translate U" },
    { id: ScalarChannel.UV3_TranlateV, label: "TexCoord3 Translate V" },
    { id: ScalarChannel.UV4_TranlateU, label: "TexCoord4 Translate U" },
    { id: ScalarChannel.UV4_TranlateV, label: "TexCoord4 Translate V" },
    { id: ScalarChannel.UV5_TranlateU, label: "TexCoord5 Translate U" },
    { id: ScalarChannel.UV5_TranlateV, label: "TexCoord5 Translate V" },
    { id: ScalarChannel.UV6_TranlateU, label: "TexCoord6 Translate U" },
    { id: ScalarChannel.UV6_TranlateV, label: "TexCoord6 Translate V" },
    { id: ScalarChannel.UV7_TranlateU, label: "TexCoord7 Translate U" },
    { id: ScalarChannel.UV7_TranlateV, label: "TexCoord7 Translate V" },

    { id: ScalarChannel.A0, label: "Alpha Register 0" },
    { id: ScalarChannel.A1, label: "Alpha Register 1" },
    { id: ScalarChannel.A2, label: "Alpha Register 2" },
    { id: ScalarChannel.APREV, label: "Alpha Register 'PREV'" },
];

const COLOR_CHANNELS: ColorChannelInfo[] = [
    { id: ColorChannel.C0, label: "Color Register 0" },
    { id: ColorChannel.C1, label: "Color Register 1" },
    { id: ColorChannel.C2, label: "Color Register 2" },
    { id: ColorChannel.CPREV, label: "Color Register 'PREV'" },
];

const INTERP_KINDS: InterpKindInfo[] = [
    { id: InterpKind.Constant, label: "Constant" },
    { id: InterpKind.Linear, label: "Linear" },
    { id: InterpKind.Sine, label: "Sine" },
    { id: InterpKind.Square, label: "Square" },
];

const SCALAR_CHANNEL_MAP = createIdMap(SCALAR_CHANNELS);
const COLOR_CHANNEL_MAP = createIdMap(COLOR_CHANNELS);
const INTERP_KIND_MAP = createIdMap(INTERP_KINDS);

const scratchNumberPtr = [0];

export class AnimationsGui {
    constructor(
        private device: GfxDevice,
        private renderCache: GfxRenderCache, 
        private textureCache: TextureCache,
        private models: Model[],
        private materials: Material[],
        private textures: Texture[],
        private materialListGui: MaterialListGui,
    ) {
    }

    public render() {
        const selMaterial = this.materialListGui.getSelectedMaterialIdx();
        const material = this.materials[selMaterial];
       
        if (ImGui.CollapsingHeader(`Scalar Channels`, ImGui.TreeNodeFlags.DefaultOpen)) {
            if (ImGui.Button("Add Scalar Animation")) {
                const anim: ScalarAnim = {
                    uuid: crypto.randomUUID(),
                    channel: ScalarChannel.UV0_TranlateU,
                    start: 0,
                    end: 0,
                    interp: {
                        kind: InterpKind.Constant,
                        offset: 0,
                        scale: 1,
                        speed: 0,
                    },
                };
                material.scalarAnims.push(anim);
            }

            let scalarAnimDeleteIdx: number | null = null;
            for (let i = 0; i < material.scalarAnims.length; i++) {
                const scalarAnim = material.scalarAnims[i];
                if (this.renderScalarAnim(scalarAnim)) {
                    scalarAnimDeleteIdx = scalarAnimDeleteIdx ?? i;
                }
            }
            if (scalarAnimDeleteIdx !== null) {
                material.scalarAnims.splice(scalarAnimDeleteIdx, 1);
            }
        }
        ImGui.Spacing();

        if (ImGui.CollapsingHeader(`Color Channels`, ImGui.TreeNodeFlags.DefaultOpen)) {
            if (ImGui.Button("Add Color Animation")) {
                const anim: ColorAnim = {
                    uuid: crypto.randomUUID(),
                    channel: ColorChannel.C0,
                    start: OpaqueBlack,
                    end: OpaqueBlack,
                    interp: {
                        kind: InterpKind.Constant,
                        offset: 0,
                        scale: 1,
                        speed: 0,
                    },
                    interpSpace: "RGB",
                };
                material.colorAnims.push(anim);
            }       

            let colorAnimDeleteIdx: number | null = null;
            for (let i = 0; i < material.colorAnims.length; i++) {
                const colorAnim = material.colorAnims[i];
                if (this.renderColorAnim(colorAnim)) {
                    colorAnimDeleteIdx = colorAnimDeleteIdx ?? i;
                }
            }
            if (colorAnimDeleteIdx !== null) {
                material.colorAnims.splice(colorAnimDeleteIdx, 1);
            }
        }
    }

    private renderScalarAnim(anim: ScalarAnim): boolean {
        let deleteMe = false;

        const selectedChannel = SCALAR_CHANNEL_MAP.get(anim.channel)!;
        const treeName = `${selectedChannel.label}###${anim.uuid}`;
        if (ImGui.TreeNodeEx(treeName, ImGui.TreeNodeFlags.DefaultOpen)) {
            anim.channel = renderCombo(
                "Scalar Channel", 
                SCALAR_CHANNELS, 
                selectedChannel,
                (c) => c.label,
            ).id;

            anim.interp.kind = renderCombo(
                "Interp",
                INTERP_KINDS,
                INTERP_KIND_MAP.get(anim.interp.kind)!,
                (i) => i.label,
            ).id;

            this.renderInterp(anim.interp);

            if (ImGui.Button("Delete")) {
                deleteMe = true;
            }

            ImGui.TreePop();
        }
       
        return deleteMe;
    }

    private renderColorAnim(anim: ColorAnim): boolean {
        let deleteMe = false;

        const selectedChannel = COLOR_CHANNEL_MAP.get(anim.channel)!;
        const treeName = `${selectedChannel.label}###${anim.uuid}`;
        if (ImGui.TreeNodeEx(treeName, ImGui.TreeNodeFlags.DefaultOpen)) {
            anim.channel = renderCombo(
                "Color Channel", 
                COLOR_CHANNELS, 
                selectedChannel,
                (c) => c.label,
            ).id;

            anim.interp.kind = renderCombo(
                "Interp",
                INTERP_KINDS,
                INTERP_KIND_MAP.get(anim.interp.kind)!,
                (i) => i.label,
            ).id;

            this.renderInterp(anim.interp);

            if (ImGui.Button("Delete")) {
                deleteMe = true;
            }

            ImGui.TreePop();
        }
       
        return deleteMe;
    }

    private renderInterp(interp: Interp) {
        const n = scratchNumberPtr;
        if (interp.kind !== InterpKind.Constant) {
            n[0] = interp.offset;
            ImGui.SliderFloat("Offset", n, 0, 1);
            interp.offset = n[0];

            n[0] = interp.scale;
            ImGui.SliderFloat("Scale", n, -10, 10);
            interp.scale = n[0];
            
            n[0] = interp.speed;
            ImGui.SliderFloat("Speed", n, -10, 10);
            interp.speed = n[0];
        }
    }
}