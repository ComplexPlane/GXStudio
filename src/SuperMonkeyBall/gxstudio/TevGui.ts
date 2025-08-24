import { ImGui, ImVec2 } from "@mori2003/jsimgui";

import { GfxDevice } from "../../gfx/platform/GfxPlatform.js";
import { GfxRenderCache } from "../../gfx/render/GfxRenderCache.js";
import * as GX from "../../gx/gx_enum.js";
import { TextureCache } from "../ModelCache.js";
import { createIdMap } from "./GuiUtils.js";
import { MaterialListGui } from "./MaterialListGui.js";
import {
    Material,
    Model,
    newPassthroughTevStage,
    newWhiteTevStage,
    TevStage,
    Texture,
} from "./Scene.js";

type ColorConst = {
    id: GX.KonstColorSel;
    label: string;
    help: string;
};

const COLOR_CONSTS: ColorConst[] = [
    { id: GX.KonstColorSel.KCSEL_K0, label: "K0", help: "Color value from color constant 0" },
    { id: GX.KonstColorSel.KCSEL_K1, label: "K1", help: "Color value from color constant 1" },
    { id: GX.KonstColorSel.KCSEL_K2, label: "K2", help: "Color value from color constant 2" },
    { id: GX.KonstColorSel.KCSEL_K3, label: "K3", help: "Color value from color constant 3" },
];

const COLOR_CONST_MAP = createIdMap(COLOR_CONSTS);

// Going to ignore alpha constants for now, think we'll be alright w/o them

type ColorIn = {
    id: GX.CC;
    label: string;
    help: string;
};

const COLOR_INS: ColorIn[] = [
    { id: GX.CC.ZERO, label: "0.0", help: "Constant value 0.0" },
    { id: GX.CC.HALF, label: "0.5", help: "Constant value 0.5" },
    { id: GX.CC.ONE, label: "1.0", help: "Constant value 1.0" },
    { id: GX.CC.RASC, label: "Lighting Color", help: "Color value from rasterizer" },
    { id: GX.CC.TEXC, label: "Texture Color", help: "Color value from texture" },
    { id: GX.CC.TEXA, label: "Texture Alpha", help: "Alpha value from texture" },
    {
        id: GX.CC.CPREV,
        label: "Color Register PREV",
        help: "Color value from color register 'PREV'",
    },
    { id: GX.CC.C0, label: "Color Register 0", help: "Color value from color register 0" },
    { id: GX.CC.C1, label: "Color Register 1", help: "Color value from color register 1" },
    { id: GX.CC.C2, label: "Color Register 2", help: "Color value from color register 2" },
    {
        id: GX.CC.APREV,
        label: "Alpha Register PREV",
        help: "Alpha value from alpha register 'PREV'",
    },
    { id: GX.CC.A0, label: "Alpha Register 0", help: "Alpha value from alpha register 0" },
    { id: GX.CC.A1, label: "Alpha Register 1", help: "Alpha value from alpha register 1" },
    { id: GX.CC.A2, label: "Alpha Register 2", help: "Alpha value from alpha register 2" },
    { id: GX.CC.KONST, label: "Color Constant", help: "Color value from either K0, K1, K2, or K3" },
    // { id: GX.CC.RASA, label: "Lighting Alpha", help: "Alpha value from rasterizer" },
];

const COLOR_IN_MAP = createIdMap(COLOR_INS);

type AlphaIn = {
    id: GX.CA;
    label: string;
    help: string;
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

const ALPHA_IN_MAP = createIdMap(ALPHA_INS);

type OutReg = {
    id: GX.Register;
    label: string;
    help: string;
};

const COLOR_OUTS: OutReg[] = [
    { id: GX.Register.PREV, label: "Color PREV", help: "Color register 'PREV' (most common)" },
    { id: GX.Register.REG0, label: "Color 0", help: "Color register 0" },
    { id: GX.Register.REG1, label: "Color 1", help: "Color register 1" },
    { id: GX.Register.REG2, label: "Color 2", help: "Color register 2" },
];

const COLOR_OUT_MAP = createIdMap(COLOR_OUTS);

const ALPHA_OUTS: OutReg[] = [
    { id: GX.Register.PREV, label: "Alpha PREV", help: "Alpha register 'PREV' (most common)" },
    { id: GX.Register.REG0, label: "Alpha 0", help: "Alpha register 0" },
    { id: GX.Register.REG1, label: "Alpha 1", help: "Alpha register 1" },
    { id: GX.Register.REG2, label: "Alpha 2", help: "Alpha register 2" },
];

const ALPHA_OUT_MAP = createIdMap(ALPHA_OUTS);

type WrapMode = {
    id: GX.WrapMode;
    label: string;
};

const WRAP_MODES: WrapMode[] = [
    { id: GX.WrapMode.REPEAT, label: "Repeat" },
    { id: GX.WrapMode.MIRROR, label: "Mirror" },
    { id: GX.WrapMode.CLAMP, label: "Clamp" },
];

const WRAP_MODE_MAP = createIdMap(WRAP_MODES);

const scratchTevStagea = newWhiteTevStage();

function objEqual<T extends object>(a: T, b: T): boolean {
    return Object.keys(a).every((key) => a[key as keyof T] === b[key as keyof T]);
}

export class TevGui {
    private smallImageButtonSize = new ImVec2(80, 80);
    private largeImageButtonSize = new ImVec2(120, 120);
    private scratchImVec2a = new ImVec2();

    constructor(
        private device: GfxDevice,
        private renderCache: GfxRenderCache,
        private textureCache: TextureCache,
        private models: Model[],
        private materials: Material[],
        private textures: Texture[],
        private materialListGui: MaterialListGui
    ) {}

    public render() {
        const selMaterial = this.materialListGui.getSelectedMaterialIdx();
        const material = this.materials[selMaterial];

        const stagesFull = material.tevStages.length >= 8;
        if (stagesFull) {
            ImGui.BeginDisabled();
        }

        if (ImGui.Button(`Add TEV Stage (${material.tevStages.length}/8)`)) {
            const tevStage =
                material.tevStages.length === 0
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
            const prevTevStage = scratchTevStagea;
            Object.assign(prevTevStage, tevStage);

            ImGui.PushID(tevStage.uuid);

            if (
                ImGui.CollapsingHeader(
                    `TEV Stage ${tevStageIdx}###${tevStage.uuid}`,
                    ImGui.TreeNodeFlags.DefaultOpen
                )
            ) {
                if (ImGui.TreeNodeEx("Texture", ImGui.TreeNodeFlags.DefaultOpen)) {
                    this.renderTextureSelDropdown("Input Texture", tevStage);
                    ImGui.PushItemWidth(100);
                    tevStage.textureWrapU = renderCombo(
                        "U Wrap",
                        WRAP_MODES,
                        WRAP_MODE_MAP.get(tevStage.textureWrapU)!,
                        (w) => w.label
                    ).id;
                    ImGui.SameLine();
                    tevStage.textureWrapV = renderCombo(
                        "V Wrap",
                        WRAP_MODES,
                        WRAP_MODE_MAP.get(tevStage.textureWrapV)!,
                        (w) => w.label
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
                    if (
                        tevStage.colorInA === GX.CC.KONST ||
                        tevStage.colorInB === GX.CC.KONST ||
                        tevStage.colorInC === GX.CC.KONST ||
                        tevStage.colorInD === GX.CC.KONST
                    ) {
                        tevStage.kcsel = renderCombo(
                            "Color Const",
                            COLOR_CONSTS,
                            COLOR_CONST_MAP.get(tevStage.kcsel)!,
                            (c) => c.label,
                            (c) => c.help
                        ).id;
                    }
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

                if (!objEqual(tevStage, prevTevStage)) {
                    material.rebuild();
                }
            }

            ImGui.PopID();
        }

        if (tevStageToDelete !== null) {
            material.tevStages.splice(tevStageToDelete, 1);
            material.rebuild();
        }
    }

    private renderTextureSelDropdown(label: string, tevStage: TevStage) {
        this.texturePicker((texture) => {
            tevStage.texture = texture;
        });

        if (tevStage.texture !== null) {
            if (
                ImGui.ImageButton(
                    "##textureButtonId",
                    tevStage.texture.imguiTextureIds[0],
                    this.smallImageButtonSize
                )
            ) {
                ImGui.OpenPopup("Choose Texture");
            }
            showTextureTooltip(tevStage.texture);
        } else {
            const buttonSize = this.scratchImVec2a;
            getImageButtonSize(buttonSize, this.smallImageButtonSize);
            if (ImGui.Button("<none>", buttonSize)) {
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
                    const buttonSize = this.scratchImVec2a;
                    getImageButtonSize(buttonSize, this.largeImageButtonSize);
                    if (ImGui.Button("<none>", buttonSize)) {
                        setFunc(null);
                        ImGui.CloseCurrentPopup();
                    }
                } else {
                    if (
                        ImGui.ImageButton("", texture.imguiTextureIds[0], this.largeImageButtonSize)
                    ) {
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
        return renderCombo(
            label,
            COLOR_INS,
            currColorSel,
            (s) => s.label,
            (s) => s.help
        ).id;
    }

    private renderAlphaSelDropdown(label: string, ca: GX.CA): GX.CA {
        const currAlphaSel = ALPHA_IN_MAP.get(ca)!;
        return renderCombo(
            label,
            ALPHA_INS,
            currAlphaSel,
            (s) => s.label,
            (s) => s.help
        ).id;
    }

    private renderColorOutDropdown(label: string, cc: GX.Register): GX.Register {
        const currColorSel = COLOR_OUT_MAP.get(cc)!;
        return renderCombo(
            label,
            COLOR_OUTS,
            currColorSel,
            (s) => s.label,
            (s) => s.help
        ).id;
    }

    private renderAlphaOutDropdown(label: string, ca: GX.Register): GX.Register {
        const currAlphaSel = ALPHA_OUT_MAP.get(ca)!;
        return renderCombo(
            label,
            ALPHA_OUTS,
            currAlphaSel,
            (s) => s.label,
            (s) => s.help
        ).id;
    }
}

function getImageButtonSize(out: ImVec2, imageButtonSize: ImVec2) {
    const framePadding = ImGui.GetStyle().FramePadding;
    out.x = imageButtonSize.x + framePadding.x * 2;
    out.y = imageButtonSize.y + framePadding.y * 2;
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

function renderCombo<T>(
    label: string,
    items: T[],
    selectedItem: T,
    formatFunc: (v: T) => string,
    helpFunc?: (v: T) => string
): T {
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
