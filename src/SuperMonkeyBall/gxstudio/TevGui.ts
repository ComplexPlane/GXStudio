import { ImGui, ImGuiID, ImGuiImplWeb, ImTextureID, ImTextureRef, ImVec2, ImVec4 } from "@mori2003/jsimgui";

import * as GX from '../../gx/gx_enum.js';
import { LoadedTexture } from "../../TextureHolder.js";
import { TextureCache } from "../ModelCache.js";
import { Gma } from "../Gma.js";
import { calcMipChain, decodeTexture, TextureInputGX } from "../../gx/gx_texture.js";
import * as gui_material from "./MaterialInst.js";
import { GfxDevice } from "../../gfx/platform/GfxPlatform.js";
import { GfxRenderCache } from "../../gfx/render/GfxRenderCache.js";
import { assertExists } from "../../util.js";
import { GuiScene, Material, Model, newPassthroughTevStage, newWhiteTevStage, TevStage, Texture } from "./Scene.js";
import { MaterialListGui } from "./MaterialListGui.js";

type ColorIn = {
    id: GX.CC,
    label: string,
    help: string,
};

const COLOR_INS: ColorIn[] = [
    { id: GX.CC.ZERO, label: "0.0", help: "Constant value 0.0" },
    { id: GX.CC.HALF, label: "0.5", help: "Constant value 0.5" },
    { id: GX.CC.ONE, label: "1.0", help: "Constant value 1.0" },
    { id: GX.CC.RASC, label: "Lighting Color", help: "Color value from rasterizer" },
    { id: GX.CC.TEXC, label: "Texture Color", help: "Color value from texture" },
    { id: GX.CC.TEXA, label: "Texture Alpha", help: "Alpha value from texture" },
    { id: GX.CC.CPREV, label: "Color PREV", help: "Color value from color register 'PREV'" },
    { id: GX.CC.C0, label: "Color 0", help: "Color value from color register 0" },
    { id: GX.CC.C1, label: "Color 1", help: "Color value from color register 1" },
    { id: GX.CC.C2, label: "Color 2", help: "Color value from color register 2" },
    { id: GX.CC.APREV, label: "Alpha PREV", help: "Alpha value from alpha register 'PREV'" },
    { id: GX.CC.A0, label: "Alpha 0", help: "Alpha value from alpha register 0" },
    { id: GX.CC.A1, label: "Alpha 1", help: "Alpha value from alpha register 1" },
    { id: GX.CC.A2, label: "Alpha 2", help: "Alpha value from alpha register 2" },
    // { id: GX.CC.RASA, label: "Lighting Alpha", help: "Alpha value from rasterizer" },
    // { id: GX.CC.KONST, label: "Constant", help: "Constant color" }, // TODO
];

const COLOR_IN_MAP = new Map<GX.CC, ColorIn>(
    COLOR_INS.map(sel => [sel.id, sel])
);

type AlphaIn = {
    id: GX.CA,
    label: string,
    help: string,
};

const ALPHA_INS: AlphaIn[] = [
    { id: GX.CA.ZERO, label: "0.0", help: "Constant value 0.0" },
    { id: GX.CA.RASA, label: "1.0", help: "Constant value 1.0" },
    { id: GX.CA.TEXA, label: "Texture Alpha", help: "Alpha value from texture" },
    { id: GX.CA.APREV, label: "Alpha PREV", help: "Alpha value from alpha register 'PREV'" },
    { id: GX.CA.A0, label: "Alpha 0", help: "Alpha value from alpha register 0" },
    { id: GX.CA.A1, label: "Alpha 1", help: "Alpha value from alpha register 1" },
    { id: GX.CA.A2, label: "Alpha 2", help: "Alpha value from alpha register 2" },
    // { id: GX.CA.KONST, label: "Constant", help: "Constant alpha value" }, // TODO
];

const ALPHA_IN_MAP = new Map<GX.CA, AlphaIn>(
    ALPHA_INS.map(sel => [sel.id, sel])
);

type OutReg = {
    id: GX.Register,
    label: string,
    help: string,
};

const COLOR_OUTS: OutReg[] = [
    { id: GX.Register.PREV, label: "Color PREV", help: "Color register 'PREV' (most common)" },
    { id: GX.Register.REG0, label: "Color 0", help: "Color register 0" },
    { id: GX.Register.REG1, label: "Color 1", help: "Color register 1" },
    { id: GX.Register.REG2, label: "Color 2", help: "Color register 2" },
];

const COLOR_OUT_MAP = new Map<GX.Register, OutReg>(
    COLOR_OUTS.map(out => [out.id, out])
);

const ALPHA_OUTS: OutReg[] = [
    { id: GX.Register.PREV, label: "Alpha PREV", help: "Alpha register 'PREV' (most common)" },
    { id: GX.Register.REG0, label: "Alpha 0", help: "Alpha register 0" },
    { id: GX.Register.REG1, label: "Alpha 1", help: "Alpha register 1" },
    { id: GX.Register.REG2, label: "Alpha 2", help: "Alpha register 2" },
];

const ALPHA_OUT_MAP = new Map<GX.Register, OutReg>(
    ALPHA_OUTS.map(out => [out.id, out])
);

type WrapMode = {
    id: GX.WrapMode,
    label: string,
};

const WRAP_MODES: WrapMode[] = [
    { id: GX.WrapMode.REPEAT, label: "Repeat" },
    { id: GX.WrapMode.MIRROR, label: "Mirror" },
    { id: GX.WrapMode.CLAMP, label: "Clamp" },
];

const WRAP_MODE_MAP = new Map<GX.WrapMode, WrapMode>(
    WRAP_MODES.map(w => [w.id, w])
)

export class TevGui {
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

        const stagesFull = material.tevStages.length >= 8;
        if (stagesFull) {
            ImGui.BeginDisabled();
        }

        if (ImGui.Button(`Add TEV Stage (${material.tevStages.length}/8)`)) {
            const tevStage = material.tevStages.length === 0 
                ? newWhiteTevStage()
                : newPassthroughTevStage(material.tevStages[material.tevStages.length - 1]);
            material.tevStages.push(tevStage);
            material.rebuild();
        }
        if (stagesFull) {
            ImGui.EndDisabled();
        }

        let tevStageToDelete: number | null = null;
        for (let tevStageIdx = 0; tevStageIdx < material.tevStages.length; tevStageIdx++) {
            const tevStage = material.tevStages[tevStageIdx];
            const prevTevStage = { ...tevStage };

            ImGui.PushID(tevStage.uuid);

            if (ImGui.CollapsingHeader(`TEV Stage ${tevStageIdx}###${tevStage.uuid}`, ImGui.TreeNodeFlags.DefaultOpen)) {
                if (ImGui.TreeNodeEx("Texture", ImGui.TreeNodeFlags.DefaultOpen)) {
                    this.renderTextureSelDropdown("Input Texture", tevStage);
                    ImGui.PushItemWidth(100);
                    tevStage.textureWrapU = renderCombo(
                        "U Wrap", 
                        WRAP_MODES, 
                        WRAP_MODE_MAP.get(tevStage.textureWrapU)!, 
                        (w) => w.label,
                    ).id;
                    ImGui.SameLine();
                    tevStage.textureWrapV = renderCombo(
                        "V Wrap",
                        WRAP_MODES,
                        WRAP_MODE_MAP.get(tevStage.textureWrapV)!,
                        (w) => w.label,
                    ).id;
                    ImGui.PopItemWidth();
                    ImGui.TreePop();
                }

                if (ImGui.TreeNodeEx("Color Function", ImGui.TreeNodeFlags.DefaultOpen)) {
                    ImGui.Text("Dest = A × (1-C) + B × C + D");
                    tevStage.colorInA = this.renderColorSelDropdown(`A Source`, tevStage.colorInA);
                    tevStage.colorInB = this.renderColorSelDropdown(`B Source`, tevStage.colorInB);
                    tevStage.colorInC = this.renderColorSelDropdown(`C Source`, tevStage.colorInC);
                    tevStage.colorInD = this.renderColorSelDropdown(`D Source`, tevStage.colorInD);
                    tevStage.colorDest = this.renderColorOutDropdown(`Dest`, tevStage.colorDest);
                    ImGui.TreePop();
                }

                if (ImGui.TreeNodeEx("Alpha Function", ImGui.TreeNodeFlags.DefaultOpen)) {
                    ImGui.Text("Dest = A × (1-C) + B × C + D");
                    tevStage.alphaInA = this.renderAlphaSelDropdown(`A Source`, tevStage.alphaInA);
                    tevStage.alphaInB = this.renderAlphaSelDropdown(`B Source`, tevStage.alphaInB);
                    tevStage.alphaInC = this.renderAlphaSelDropdown(`C Source`, tevStage.alphaInC);
                    tevStage.alphaInD = this.renderAlphaSelDropdown(`D Source`, tevStage.alphaInD);
                    tevStage.alphaDest = this.renderAlphaOutDropdown(`Dest`, tevStage.alphaDest);
                    ImGui.TreePop();
                }

                if (ImGui.Button("Delete TEV Stage")) {
                    tevStageToDelete = tevStageIdx;
                }
                ImGui.Spacing();

                // Rebuild material if any TEV params changed...
                // We may eventually have some params that don't require rebuilding.
                // Note: this still works even though cloned TevStages will have
                // different UUIDs, because uuid is a private field
                for (const key of Object.keys(tevStage) as Array<keyof typeof tevStage>) {
                    if (tevStage[key] !== prevTevStage[key]) {
                        material.rebuild();
                        break;
                    }
                }
            }

            ImGui.PopID();
        }

        if (tevStageToDelete !== null) {
            material.tevStages.splice(tevStageToDelete, 1)
            material.rebuild();
        }
    }

    private renderTextureSelDropdown(label: string, tevStage: TevStage) {
        this.texturePicker((texture) => { tevStage.texture = texture; });

        if (tevStage.texture !== null) {
            if (ImGui.ImageButton(
                "##textureButtonId",
                tevStage.texture.imguiTextureIds[0], 
                new ImVec2(80, 80),
            )) {
                ImGui.OpenPopup("Choose Texture");
            }
            showTextureTooltip(tevStage.texture);
        } else {
            if (ImGui.Button("<none>", getImageButtonSize(new ImVec2(80, 80)))) {
                ImGui.OpenPopup("Choose Texture");
            }
        }
        ImGui.SameLine();
        ImGui.Text(label);
    }

    private texturePicker(setFunc: (texture: Texture | null) => void) {
        if (ImGui.BeginPopup("Choose Texture", ImGui.WindowFlags.AlwaysAutoResize)) {
            ImGui.Text("Choose Texture");
            if (ImGui.Button("Cancel")) {
                ImGui.CloseCurrentPopup();
            }
            const maybeTextures = [null, ...this.textures];
            for (let i = 0; i < maybeTextures.length; i++) {
                const texture = maybeTextures[i];
                ImGui.PushID(i.toString());
                if (i % 2 !== 0) {
                    ImGui.SameLine();
                }

                if (texture === null) {
                    const buttonSize = getImageButtonSize(new ImVec2(120, 120));
                    if (ImGui.Button("<none>", buttonSize)) {
                        setFunc(null);
                        ImGui.CloseCurrentPopup();
                    }
                } else {
                    if (ImGui.ImageButton(
                        "",
                        texture.imguiTextureIds[0], 
                        new ImVec2(120, 120),
                    )) {
                        setFunc(texture);
                        ImGui.CloseCurrentPopup();
                    }
                    showTextureTooltip(texture);
                }

                ImGui.PopID();
            }
            ImGui.EndPopup();
        }
        return null;
    }

    private renderColorSelDropdown(label: string, cc: GX.CC): GX.CC {
        const currColorSel = COLOR_IN_MAP.get(cc)!;
        return renderCombo(label, COLOR_INS, currColorSel, (s) => s.label, (s) => s.help).id;
    }

    private renderAlphaSelDropdown(label: string, ca: GX.CA): GX.CA {
        const currAlphaSel = ALPHA_IN_MAP.get(ca)!;
        return renderCombo(label, ALPHA_INS, currAlphaSel, (s) => s.label, (s) => s.help).id;
    }

    private renderColorOutDropdown(label: string, cc: GX.Register): GX.Register {
        const currColorSel = COLOR_OUT_MAP.get(cc)!;
        return renderCombo(label, COLOR_OUTS, currColorSel, (s) => s.label, (s) => s.help).id;
    }

    private renderAlphaOutDropdown(label: string, ca: GX.Register): GX.Register {
        const currAlphaSel = ALPHA_OUT_MAP.get(ca)!;
        return renderCombo(label, ALPHA_OUTS, currAlphaSel, (s) => s.label, (s) => s.help).id;
    }
}

function getImageButtonSize(imageButtonSize: ImVec2): ImVec2 {
    const framePadding = ImGui.GetStyle().FramePadding;
    return new ImVec2(
        imageButtonSize.x + framePadding.x * 2,
        imageButtonSize.y + framePadding.y * 2,
    );
}

function showTextureTooltip(texture: Texture) {
    if (ImGui.BeginItemTooltip()) {
        const dims = `${texture.gxTexture.width}x${texture.gxTexture.height}`;
        const mips = `${texture.gxTexture.mipCount} mip level(s)`;
        ImGui.Text(texture.gxTexture.name);
        ImGui.Text(`${dims}, ${mips}`);
        ImGui.EndTooltip();
    }
}

function renderCombo<T>(label: string, items: T[], selectedItem: T, formatFunc: (v: T) => string, helpFunc?: (v: T) => string): T {
    let newSelectedItem = selectedItem;
    if (ImGui.BeginCombo(label, formatFunc(selectedItem), ImGui.ComboFlags.HeightLarge)) {
        for (let i = 0; i < items.length; i++) {
            let item = items[i];
            const isSelected = item === selectedItem;
            if (ImGui.Selectable(formatFunc(item), isSelected)) {
                newSelectedItem = item;
            }
            if (helpFunc !== undefined) {
                ImGui.SetItemTooltip(helpFunc(item));
            }
            if (isSelected) {
                ImGui.SetItemDefaultFocus();
            }
        }

        ImGui.EndCombo();
    }
    return newSelectedItem;
}
