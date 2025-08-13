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
import { GuiScene, Material, Model, TevStage, Texture } from "./Scene.js";

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

export class Gui {
    private models: Model[] = [];
    private materials: Material[] = [];
    private textures: Texture[] = [];

    private canvasElem: HTMLCanvasElement;
    private imguiSize = new ImVec2();
    private imguiPos = new ImVec2(0, 0);
    private selMaterial: number = -1;
    private tmpName: string[] | null = null;
    private blue = new ImVec4(0, 0.9, 1, 1);
    private errorColor = new ImVec4(1, 0.2, 0.2, 1);

    constructor(
        private device: GfxDevice,
        private renderCache: GfxRenderCache, 
        private textureCache: TextureCache,
        gma: Gma,
    ) {
        this.canvasElem = document.getElementById("imguiCanvas") as HTMLCanvasElement;
        this.loadTextures(gma);

        for (let model of gma.idMap.values()) {
            this.models.push({
                name: model.name,
                meshes: model.shapes.map((_) => { return { material: null }; }),
                visible: true,
                hover: false,
            });
        }
    }

    public getGuiScene(): GuiScene {
        return { models: this.models, materials: this.materials };
    }

    private loadTextures(gma: Gma) {
        // Gather list of unique textures
        const uniqueTextures = new Map<string, TextureInputGX>();
        for (let modelData of gma.idMap.values()) {
            for (let layerData of modelData.tevLayers) {
                uniqueTextures.set(layerData.gxTexture.name, layerData.gxTexture);
            }
        }

        const texturePromises = [];

        for (let gxTexture of uniqueTextures.values()) {
            const mipChain = calcMipChain(gxTexture, gxTexture.mipCount);
            const mipPromises = [];
            for (let mipLevel of mipChain.mipLevels) {
                mipPromises.push(decodeTexture(mipLevel).then((decoded) => {
                    const array = new Uint8Array(
                        decoded.pixels.buffer, 
                        decoded.pixels.byteOffset, 
                        decoded.pixels.byteLength,
                    );
                    const id = ImGuiImplWeb.LoadTexture(array, {
                        width: mipLevel.width,
                        height: mipLevel.height,
                    });
                    return new ImTextureRef(id);
                }));
            }
            texturePromises.push(Promise.all(mipPromises).then((imguiTexIds) => {
                const texture: Texture = {
                    imguiTextureIds: imguiTexIds,
                    gxTexture: gxTexture,
                };
                return texture;
            }));
        }

        Promise.all(texturePromises).then((textures) => { 
            textures.sort((a, b) => a.gxTexture.name.localeCompare(b.gxTexture.name));
            this.textures = textures;
        });
    }

    public render() {
        ImGuiImplWeb.BeginRender();

        this.imguiSize.x = this.canvasElem.clientWidth;
        this.imguiSize.y = this.canvasElem.clientHeight;
        ImGui.SetNextWindowSize(this.imguiSize);
        ImGui.SetNextWindowPos(this.imguiPos);
        ImGui.Begin("Root", [], ImGui.WindowFlags.NoTitleBar | ImGui.WindowFlags.NoResize | ImGui.WindowFlags.MenuBar);

        this.renderMenuBar();

        if (ImGui.BeginTabBar("Tabs")) {
            if (ImGui.BeginTabItem("Models")) {
                this.renderModelsGui();
                ImGui.EndTabItem();
            }
            if (ImGui.BeginTabItem("Materials")) {
                this.renderMaterialsGui();
                ImGui.EndTabItem();
            }
            if (ImGui.BeginTabItem("Textures")) {
                this.renderTexturesTab();
                ImGui.EndTabItem();
            }
            ImGui.EndTabBar();
        }

        ImGui.End();
        ImGuiImplWeb.EndRender();
    }
    
    private renderMenuBar() {
        // TODO(complexplane): broken
        if (ImGui.BeginMenuBar()) {
            if (ImGui.BeginMenu("File")) {
                if (ImGui.BeginPopup("Import")) {
                    ImGui.Text("Not yet implemented");
                    if (ImGui.Button("OK")) {
                        ImGui.CloseCurrentPopup();
                    }
                    ImGui.EndPopup();
                }
                if (ImGui.BeginPopup("Export")) {
                    ImGui.Text("Not yet implemented");
                    if (ImGui.Button("OK")) {
                        ImGui.CloseCurrentPopup();
                    }
                    ImGui.EndPopup();
                }

                if (ImGui.MenuItem("Import...", "")) {
                    ImGui.OpenPopup("Import");
                }
                if (ImGui.MenuItem("Export...", "")) {
                    ImGui.OpenPopup("Export");
                }

                ImGui.EndMenu();
            }
            ImGui.EndMenuBar();
        }
    }

    private renderModelsGui() {
        ImGui.SeparatorText("Models List");
        if (ImGui.Button("Show All")) {
            for (let model of this.models.values()) {
                model.visible = true;
            }
        }
        ImGui.SameLine();
        if (ImGui.Button("Hide All")) {
            for (let model of this.models.values()) {
                model.visible = false;
            }
        }

        if (ImGui.BeginChild("Models List Child")) {
            const a = [false];
            const maybeMaterials = [null, ...this.materials];
            for (let model of this.models) {
                ImGui.PushID(model.name);
                if (ImGui.TreeNodeEx(model.name)) {
                    model.hover = ImGui.IsItemHovered();

                    a[0] = model.visible;
                    ImGui.Checkbox("Visible", a);
                    model.visible = a[0];

                    for (let meshIdx = 0; meshIdx < model.meshes.length; meshIdx++) {
                        const mesh = model.meshes[meshIdx];
                        if (ImGui.TreeNodeEx(`Mesh ${meshIdx}`, ImGui.TreeNodeFlags.DefaultOpen)) {
                            model.meshes[meshIdx].material = renderCombo("Material", maybeMaterials, mesh.material, (m) => 
                                m === null ? "<default>" : m.name,
                            );
                            ImGui.TreePop();
                        }
                    }

                    ImGui.TreePop();
                }
                ImGui.PopID();
            }
            ImGui.EndChild();
        }
    }

    private renderMaterialsGui() {
        if (ImGui.BeginChild("Materials Child")) {
            this.renderMaterialsList();
            this.renderMaterialEditor();
            ImGui.EndChild();
        }
    }

    private renderMaterialsList() {
        ImGui.SeparatorText("Materials List");
        if (ImGui.BeginListBox("Materials")) {
            for (let i = 0; i < this.materials.length; i++) {
                const isSelected = i == this.selMaterial
                if (ImGui.Selectable(this.materials[i].name, isSelected)) {
                    this.selMaterial = i;
                }
                if (isSelected) {
                    ImGui.SetItemDefaultFocus();
                }
            }
            ImGui.EndListBox();
        }
        if (ImGui.Button("New")) {
            ImGui.OpenPopup("New Material");
        }

        if (this.materials.length === 0) {
            ImGui.BeginDisabled();
        }
        {
            ImGui.SameLine();
            if (ImGui.Button("Rename")) {
                ImGui.OpenPopup("Rename Material");
            }
            ImGui.SameLine();
            if (ImGui.Button("Duplicate")) {
                ImGui.OpenPopup("Duplicate Material");
            }
            ImGui.SameLine();
            if (ImGui.Button("Delete")) {
                ImGui.OpenPopup("Delete Material");
            }
            ImGui.SameLine();
            if (ImGui.ArrowButton("Move Down", ImGui.Dir._Down)) {
                this.selMaterial = swap(this.materials, this.selMaterial, this.selMaterial + 1);
            }
            ImGui.SameLine();
            if (ImGui.ArrowButton("Move Up", ImGui.Dir._Up)) {
                this.selMaterial = swap(this.materials, this.selMaterial, this.selMaterial - 1);
            }
        }
        if (this.materials.length === 0) {
            ImGui.EndDisabled();
        }

        // New material
        const materialName = this.nameSomethingPopup(
            "New Material",
            "My New Material",
            this.materials.map((m) => m.name),
        );
        if (materialName !== null) {
            const material = new Material(this.device, this.renderCache, this.textureCache, materialName);
            this.selMaterial++;
            this.materials.splice(this.selMaterial, 0, material);
        }

        // Rename material
        if (this.materials.length > 0) {
            const newName = this.nameSomethingPopup(
                "Rename Material",
                this.materials[this.selMaterial].name,
                this.materials.filter((_, i) => i !== this.selMaterial).map((m) => m.name),
            );
            if (newName !== null) {
                this.materials[this.selMaterial].name = newName;
            }
        }

        // Duplicate material
        if (this.materials.length > 0) {
            const newName = this.nameSomethingPopup(
                "Duplicate Material",
                this.materials[this.selMaterial].name,
                this.materials.map((m) => m.name),
            )
            if (newName !== null) {
                const clone = this.materials[this.selMaterial].clone(newName);
                this.selMaterial++;
                this.materials.splice(this.selMaterial, 0, clone);
            }
        }

        if (ImGui.BeginPopup("Delete Material")) {
            ImGui.Text(`Delete material '${this.materials[this.selMaterial].name}'?`);
            if (ImGui.Button("OK")) {
                // Remove any mesh references to this material
                const materialToDelete = this.materials[this.selMaterial];
                for (let model of this.models.values()) {
                    for (let mesh of model.meshes) {
                        if (mesh.material === materialToDelete) {
                            mesh.material = null;
                        }
                    }
                }

                // Delete material
                this.materials.splice(this.selMaterial, 1);
                if (this.selMaterial === this.materials.length) {
                    this.selMaterial--;
                }

                ImGui.CloseCurrentPopup();
            }
            ImGui.SameLine();
            if (ImGui.Button("Cancel")) {
                ImGui.CloseCurrentPopup();
            }
            ImGui.EndPopup();
        }
    }

    private renderMaterialEditor() {
        if (this.materials.length === 0) {
            return;
        }
        const material = this.materials[this.selMaterial];

        ImGui.Spacing();
        ImGui.SeparatorText(`Edit Material '${material.name}'`);

        const stagesFull = material.tevStages.length >= 8;
        if (stagesFull) {
            ImGui.BeginDisabled();
        }

        if (ImGui.Button(`Add TEV Stage (${material.tevStages.length}/8)`)) {
            const tevStage = new TevStage();
            if (material.tevStages.length > 0) {
                // Passthrough

                const prevTevStage = material.tevStages[material.tevStages.length - 1];

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
            }
            material.tevStages.push(tevStage);
            material.rebuild();
        }
        if (stagesFull) {
            ImGui.EndDisabled();
        }

        let tevStageToDelete: number | null = null;
        for (let tevStageIdx = 0; tevStageIdx < material.tevStages.length; tevStageIdx++) {
            const tevStage = material.tevStages[tevStageIdx];
            const prevTevStage = tevStage.clone();

            ImGui.PushID(tevStage.getUuid());

            if (ImGui.CollapsingHeader(`TEV Stage ${tevStageIdx}###${tevStage.getUuid()}`, ImGui.TreeNodeFlags.DefaultOpen)) {
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

    private renderTexturesTab() {
        if (ImGui.BeginChild("Textures Child")) {
            for (let texture of this.textures) {
                const name = texture.gxTexture.name;
                const dims = `${texture.gxTexture.width}x${texture.gxTexture.height}`;
                const mips = `${texture.gxTexture.mipCount} mip level(s)`;
                ImGui.Text(`${name}: ${dims}, ${mips}`);
                ImGui.ImageWithBg(texture.imguiTextureIds[0], new ImVec2(200, 200 / (texture.gxTexture.width / texture.gxTexture.height)));
                ImGui.Spacing();
            }
            ImGui.EndChild();
        }
    }

    private nameSomethingPopup(label: string, defaultName: string, existingNames: string[]): string | null {
        let ret = null;
        if (ImGui.BeginPopup(label)) {
            ImGui.Text(label);

            this.tmpName = this.tmpName ?? [defaultName];
            ImGui.InputText("Name", this.tmpName, 256);

            const nameConflict = existingNames.includes(this.tmpName[0]);
            if (nameConflict) {
                ImGui.TextColored(this.errorColor, "Error: Duplicate Name");
                ImGui.BeginDisabled();
            }
            if (ImGui.Button("OK")) {
                ret = this.tmpName[0];
                this.tmpName = null;
                ImGui.CloseCurrentPopup();
            }
            if (nameConflict) {
                ImGui.EndDisabled();
            }

            ImGui.SameLine();
            if (ImGui.Button("Cancel")) {
                this.tmpName = null;
                ImGui.CloseCurrentPopup();
            }
            ImGui.EndPopup();
        }
        return ret;
    }
}

// Returns the new index of the current item
function swap<T>(arr: T[], currIdx: number, targetIdx: number): number {
    if (currIdx < 0 || currIdx >= arr.length) {
        return currIdx;
    }
    if (targetIdx < 0 || targetIdx >= arr.length) {
        return currIdx;
    }
    const tmp = arr[targetIdx];
    arr[targetIdx] = arr[currIdx];
    arr[currIdx] = tmp;
    return targetIdx;
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
