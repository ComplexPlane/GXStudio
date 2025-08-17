import { ImGui, ImGuiID, ImGuiImplWeb, ImTextureID, ImTextureRef, ImVec2, ImVec4 } from "@mori2003/jsimgui";

import * as GX from '../gx/gx_enum.js';
import { LoadedTexture } from "../TextureHolder.js";
import { TextureCache } from "./ModelCache.js";
import { Gma } from "./Gma.js";
import { calcMipChain, decodeTexture, TextureInputGX } from "../gx/gx_texture.js";

type ColorSel = {
    id: GX.CC,
    label: string,
    help: string,
};

const COLOR_SELS: ColorSel[] = [
    { id: GX.CC.CPREV, label: "Prev Color", help: "Color output from previous TEV stage" },
    { id: GX.CC.APREV, label: "Prev Alpha", help: "Alpha output from previous TEV stage" },
    { id: GX.CC.C0, label: "Color 0", help: "Color value from the color/output register 0" },
    { id: GX.CC.A0, label: "Alpha 0", help: "Alpha value from the color/output register 0" },
    { id: GX.CC.C1, label: "Color 1", help: "Color value from the color/output register 1" },
    { id: GX.CC.A1, label: "Alpha 1", help: "Alpha value from the color/output register 1" },
    { id: GX.CC.C2, label: "Color 2", help: "Color value from the color/output register 2" },
    { id: GX.CC.A2, label: "Alpha 2", help: "Alpha value from the color/output register 2" },
    { id: GX.CC.TEXC, label: "Texture Color", help: "Color value from texture" },
    { id: GX.CC.TEXA, label: "Texture Alpha", help: "Alpha value from texture" },
    { id: GX.CC.RASC, label: "Lighting Color", help: "Color value from rasterizer" },
    { id: GX.CC.RASA, label: "Lighting Alpha", help: "Alpha value from rasterizer" },
    { id: GX.CC.KONST, label: "Constant", help: "Constant color" },
    { id: GX.CC.ZERO, label: "0.0", help: "Constant value 0.0" },
    { id: GX.CC.HALF, label: "0.5", help: "Constant value 0.5" },
    { id: GX.CC.ONE, label: "1.0", help: "Constant value 1.0" },
];

const COLOR_SEL_MAP = new Map<GX.CC, ColorSel>(
    COLOR_SELS.map(sel => [sel.id, sel])
);

type AlphaSel = {
    id: GX.CA,
    label: string,
    help: string,
};

const ALPHA_SELS: AlphaSel[] = [
    { id: GX.CA.APREV, label: "Prev Alpha", help: "Alpha value from previous TEV stage" },
    { id: GX.CA.A0, label: "Alpha 0", help: "Alpha value from the color/output register 0" },
    { id: GX.CA.A1, label: "Alpha 1", help: "Alpha value from the color/output register 1" },
    { id: GX.CA.A2, label: "Alpha 2", help: "Alpha value from the color/output register 2" },
    { id: GX.CA.TEXA, label: "Texture Alpha", help: "Alpha value from texture" },
    { id: GX.CA.RASA, label: "Lighting Alpha", help: "Alpha value from rasterizer" },
    { id: GX.CA.KONST, label: "Constant", help: "Constant alpha value" },
    { id: GX.CA.ZERO, label: "0.0", help: "Constant value 0.0" }
];

const ALPHA_SEL_MAP = new Map<GX.CA, AlphaSel>(
    ALPHA_SELS.map(sel => [sel.id, sel])
);

type Texture = {
    imguiTextureIds: ImTextureRef[], // Loaded imgui textures, one per mip level
    gxTexture: TextureInputGX, // Original GX texture for passing to TextureCache
}

export class Gui {
    private guiState: GuiState;

    private canvasElem: HTMLCanvasElement;
    private imguiSize = new ImVec2();
    private imguiPos = new ImVec2(0, 0);

    private selMaterial: number = 0;
    private materials: Material[] = [];
    private tmpName: string[] | null = null;
    private blue = new ImVec4(0, 0.9, 1, 1);

    private textures: Texture[] = [];

    constructor(gma: Gma, private textureCache: TextureCache) {
        this.canvasElem = document.getElementById("imguiCanvas") as HTMLCanvasElement;
        this.loadTextures(gma);

        const guiModels = new Map<string, GuiModel>();
        for (let model of gma.idMap.values()) {
            const guiMeshes: GuiMesh[] = [];
            for (let mesh of model.shapes) {
                guiMeshes.push({
                    material: null,
                });
            }
            guiModels.set(model.name, {
                name: model.name,
                visible: true,
                hover: false,
                meshes: guiMeshes,
            });
        }
        this.guiState = {
            models: guiModels,
        };
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

    public getGuiState(): GuiState {
        return this.guiState;
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
            for (let model of this.guiState.models.values()) {
                model.visible = true;
            }
        }
        ImGui.SameLine();
        if (ImGui.Button("Hide All")) {
            for (let model of this.guiState.models.values()) {
                model.visible = false;
            }
        }

        if (ImGui.BeginChild("Models List Child")) {
            const a = [false];
            const maybeMaterials = [null, ...this.materials];
            for (let [name, model] of this.guiState.models.entries()) {
                ImGui.PushID(name);
                if (ImGui.TreeNodeEx(name)) {
                    model.hover = ImGui.IsItemHovered();

                    a[0] = model.visible;
                    ImGui.Checkbox("Visible", a);
                    model.visible = a[0];

                    for (let meshIdx = 0; meshIdx < model.meshes.length; meshIdx++) {
                        const mesh = model.meshes[meshIdx];
                        if (ImGui.TreeNodeEx(`Mesh ${meshIdx}`, ImGui.TreeNodeFlags.DefaultOpen)) {
                            mesh.material = renderCombo("Material", maybeMaterials, mesh.material, (m) => 
                                m === null ? "<default>" : m.name
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
        const materialName = this.nameSomethingPopup("New Material", "My New Material")
        if (materialName !== null) {
            this.materials.push(newBasicMaterial(materialName));
            this.selMaterial = this.materials.length - 1;
        }

        // Rename material
        if (this.materials.length > 0) {
            const materialName = this.nameSomethingPopup("Rename Material", this.materials[this.selMaterial].name);
            if (materialName !== null) {
                this.materials[this.selMaterial].name = materialName;
            }
        }

        // Duplicate material
        if (this.materials.length > 0) {
            const dupMaterialName = this.nameSomethingPopup("Duplicate Material", this.materials[this.selMaterial].name)
            if (dupMaterialName !== null) {
                const clone = cloneMaterial(this.materials[this.selMaterial]);
                clone.name = dupMaterialName
                this.materials.splice(this.selMaterial + 1, 0, clone);
                this.selMaterial++;
            }
        }

        if (ImGui.BeginPopup("Delete Material")) {
            ImGui.Text(`Delete material '${this.materials[this.selMaterial].name}'?`);
            if (ImGui.Button("OK")) {
                for (let model of this.guiState.models.values()) {
                    for (let mesh of model.meshes) {
                        if (mesh.material === this.materials[this.selMaterial]) {
                            mesh.material = null;
                        }
                    }
                }

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
        ImGui.Spacing();
        ImGui.SeparatorText(`Edit Material '${this.materials[this.selMaterial].name}'`);

        const material = this.materials[this.selMaterial];

        const stagesFull = material.tevStages.length >= 8;
        if (stagesFull) {
            ImGui.BeginDisabled();
        }
        if (ImGui.Button(`Add TEV Stage (${material.tevStages.length}/8)`)) {
            this.materials[this.selMaterial].tevStages.push({
                colorInA: GX.CC.CPREV,
                colorInB: GX.CC.CPREV,
                colorInC: GX.CC.CPREV,
                colorInD: GX.CC.CPREV,
                colorDest: GX.CC.CPREV,
                colorOp: GX.TevOp.ADD,

                alphaInA: GX.CA.APREV,
                alphaInB: GX.CA.APREV,
                alphaInC: GX.CA.APREV,
                alphaInD: GX.CA.APREV,
                alphaDest: GX.CA.APREV,
                alphaOp: GX.TevOp.ADD,

                texture: null,
            });
        }
        if (stagesFull) {
            ImGui.EndDisabled();
        }

        let tevStageToDelete: number | null = null;
        for (let tevStageIdx = 0; tevStageIdx < material.tevStages.length; tevStageIdx++) {
            ImGui.PushID(tevStageIdx.toString());

            const tevStage = material.tevStages[tevStageIdx];

            ImGui.Spacing();
            ImGui.Separator();
            ImGui.Spacing();
            ImGui.TextColored(this.blue, `TEV Stage ${tevStageIdx}`);

            this.renderTextureSelDropdown("Texture", tevStage);
            ImGui.Spacing();

            tevStage.colorInA = this.renderColorSelDropdown(`Color A Source`, tevStage.colorInA);
            tevStage.colorInB = this.renderColorSelDropdown(`Color B Source`, tevStage.colorInB);
            tevStage.colorInC = this.renderColorSelDropdown(`Color C Source`, tevStage.colorInC);
            tevStage.colorInD = this.renderColorSelDropdown(`Color D Source`, tevStage.colorInD);
            tevStage.colorDest = this.renderColorSelDropdown(`Color Dest`, tevStage.colorDest);
            ImGui.Spacing();
            tevStage.alphaInA = this.renderAlphaSelDropdown(`Alpha A Source`, tevStage.alphaInA);
            tevStage.alphaInB = this.renderAlphaSelDropdown(`Alpha B Source`, tevStage.alphaInB);
            tevStage.alphaInC = this.renderAlphaSelDropdown(`Alpha C Source`, tevStage.alphaInC);
            tevStage.alphaInD = this.renderAlphaSelDropdown(`Alpha D Source`, tevStage.alphaInD);
            tevStage.alphaDest = this.renderAlphaSelDropdown(`Alpha Dest`, tevStage.alphaDest);
            ImGui.Spacing();

            if (ImGui.Button("Delete TEV Stage " + tevStageIdx)) {
                tevStageToDelete = tevStageIdx;
            }

            ImGui.PopID();
        }

        if (tevStageToDelete !== null) {
            material.tevStages.splice(tevStageToDelete, 1)
        }
    }

    private renderTextureSelDropdown(label: string, tevStage: TevStage) {
        this.texturePicker((texture) => { tevStage.texture = texture; });

        if (tevStage.texture !== null) {
            if (ImGui.ImageButton(
                "",
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
        ImGui.Text("Input Texture");
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
        const currColorSel = COLOR_SEL_MAP.get(cc)!;
        return renderCombo(label, COLOR_SELS, currColorSel, (s) => s.label, (s) => s.help).id;
    }

    private renderAlphaSelDropdown(label: string, ca: GX.CA): GX.CA {
        const currAlphaSel = ALPHA_SEL_MAP.get(ca)!;
        return renderCombo(label, ALPHA_SELS, currAlphaSel, (s) => s.label, (s) => s.help).id;
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

    private nameSomethingPopup(label: string, defaultName: string): string | null {
        let ret = null;
        if (ImGui.BeginPopup(label)) {
            ImGui.Text(label);
            this.tmpName = this.tmpName ?? [defaultName];
            ImGui.InputText("Name", this.tmpName, 256);
            if (ImGui.Button("OK")) {
                ret = this.tmpName[0];
                this.tmpName = null;
                ImGui.CloseCurrentPopup();
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

export class GuiState {
    public models: Map<string, GuiModel>;

    constructor() {
        this.models = new Map();
    }
}

export type GuiModel = {
    name: string,
    visible: boolean,
    hover: boolean,
    meshes: GuiMesh[],
}

export type GuiMesh = {
    material: Material | null, // Null is default SMB material built from GMA
}

type TevStage = {
    colorInA: GX.CC;
    colorInB: GX.CC;
    colorInC: GX.CC;
    colorInD: GX.CC;
    colorDest: GX.CC;
    colorOp: GX.TevOp;

    alphaInA: GX.CA;
    alphaInB: GX.CA;
    alphaInC: GX.CA;
    alphaInD: GX.CA;
    alphaDest: GX.CA;
    alphaOp: GX.TevOp;

    // SetTevOrder
    // The hope is we provide these at a higher level, then build the GXMaterial
    // with the specifics?
    // texCoordId: GX.TexCoordID;
    // texMap: GX.TexMapID;

    texture: Texture | null,
}

type Material = {
    name: string,
    tevStages: TevStage[],
}

function newBasicMaterial(name: string): Material {
    return {
        name: name,
        tevStages: [],
    };
}

function cloneMaterial(orig: Material): Material {
    return {
        name: orig.name,
        tevStages: orig.tevStages.map((stage) => { return {...stage} }),
    };
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
    if (ImGui.BeginCombo(label, formatFunc(selectedItem))) {
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
