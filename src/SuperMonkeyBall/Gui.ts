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
    private canvasElem: HTMLCanvasElement;
    private imguiSize = new ImVec2();
    private imguiPos = new ImVec2(0, 0);
    private textureDisplaySize = new ImVec2(200, 200);

    private selMaterial: number = 0;
    private materials: Material[] = [];
    private tmpName: string[] | null = null;
    private blue = new ImVec4(0, 0.9, 1, 1);

    private textures: Texture[] = [];

    constructor(private guiState: GuiState, gma: Gma, private textureCache: TextureCache) {
        this.canvasElem = document.getElementById("imguiCanvas") as HTMLCanvasElement;
        this.loadTextures(gma);
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

        const a = [false];
        for (let [name, model] of this.guiState.models.entries()) {
            a[0] = model.visible;
            ImGui.Checkbox(name, a);
            model.visible = a[0];
            model.hover = ImGui.IsItemHovered();
        }
    }

    private renderMaterialsGui() {
        this.renderMaterialsList();
        this.renderMaterialEditor();
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

        if (ImGui.BeginPopup("New Material")) {
            this.tmpName = this.tmpName ?? ["My New Material"];

            ImGui.Text("New Material:");
            ImGui.InputText("Name", this.tmpName, 256);
            if (ImGui.Button("OK")) {
                this.materials.push(newBasicMaterial(this.tmpName[0]));
                this.selMaterial = this.materials.length - 1;
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

        if (ImGui.BeginPopup("Rename Material")) {
            this.tmpName = this.tmpName ?? [this.materials[this.selMaterial].name];

            ImGui.InputText("Name", this.tmpName, 256);
            if (ImGui.Button("OK")) {
                this.materials[this.selMaterial].name = this.tmpName[0];
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

        if (ImGui.BeginPopup("Duplicate Material")) {
            this.tmpName = this.tmpName ?? [this.materials[this.selMaterial].name];

            ImGui.Text(`Duplicate material '${this.materials[this.selMaterial]}':`);
            ImGui.InputText("New Name", this.tmpName, 256);
            if (ImGui.Button("OK")) {
                const copy = copyMaterial(this.materials[this.selMaterial]);
                copy.name = this.tmpName[0];
                this.materials.splice(this.selMaterial + 1, 0, copy);
                this.selMaterial++;
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

        if (ImGui.BeginPopup("Delete Material")) {
            ImGui.Text(`Delete material '${this.materials[this.selMaterial]}'?`);
            if (ImGui.Button("OK")) {
                this.materials.splice(this.selMaterial, 1);
                if (this.selMaterial >= this.materials.length) {
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

                // TODO
                texture: "TODO" as any as LoadedTexture,
            });
        }
        if (stagesFull) {
            ImGui.EndDisabled();
        }

        let tevStageToDelete: number | null = null;
        for (let tevStageIdx = 0; tevStageIdx < material.tevStages.length; tevStageIdx++) {
            const tevStage = material.tevStages[tevStageIdx];

            ImGui.Spacing();
            ImGui.Separator();
            ImGui.Spacing();
            ImGui.TextColored(this.blue, `TEV Stage ${tevStageIdx}`);

            tevStage.colorInA = this.renderColorSelDropdown(`${tevStageIdx}: Color A Source`, tevStage.colorInA);
            tevStage.colorInB = this.renderColorSelDropdown(`${tevStageIdx}: Color B Source`, tevStage.colorInB);
            tevStage.colorInC = this.renderColorSelDropdown(`${tevStageIdx}: Color C Source`, tevStage.colorInC);
            tevStage.colorInD = this.renderColorSelDropdown(`${tevStageIdx}: Color D Source`, tevStage.colorInD);
            tevStage.colorDest = this.renderColorSelDropdown(`${tevStageIdx}: Color Dest`, tevStage.colorDest);
            ImGui.Spacing();
            tevStage.alphaInA = this.renderAlphaSelDropdown(`${tevStageIdx}: Alpha A Source`, tevStage.alphaInA);
            tevStage.alphaInB = this.renderAlphaSelDropdown(`${tevStageIdx}: Alpha B Source`, tevStage.alphaInB);
            tevStage.alphaInC = this.renderAlphaSelDropdown(`${tevStageIdx}: Alpha C Source`, tevStage.alphaInC);
            tevStage.alphaInD = this.renderAlphaSelDropdown(`${tevStageIdx}: Alpha D Source`, tevStage.alphaInD);
            tevStage.alphaDest = this.renderAlphaSelDropdown(`${tevStageIdx}: Alpha Dest`, tevStage.alphaDest);
            ImGui.Spacing();

            if (ImGui.Button("Delete TEV Stage " + tevStageIdx)) {
                tevStageToDelete = tevStageIdx;
            }
        }

        if (tevStageToDelete !== null) {
            material.tevStages.splice(tevStageToDelete, 1)
        }
    }

    private renderColorSelDropdown(label: string, cc: GX.CC) {
        const currColorSel = COLOR_SEL_MAP.get(cc)!;

        if (ImGui.BeginCombo(label, currColorSel.label)) {
            for (let colorSelIdx = 0; colorSelIdx < COLOR_SELS.length; colorSelIdx++) {
                let colorSel = COLOR_SELS[colorSelIdx];
                const isSelected = cc == colorSel.id;
                if (ImGui.Selectable(colorSel.label, isSelected)) {
                    cc = colorSel.id;
                }
                ImGui.SetItemTooltip(colorSel.help);
                if (isSelected) {
                    ImGui.SetItemDefaultFocus();
                }
            }

            ImGui.EndCombo();
        }

        return cc;
    }

    private renderAlphaSelDropdown(label: string, ca: GX.CA) {
        const currColorSel = ALPHA_SEL_MAP.get(ca)!;

        if (ImGui.BeginCombo(label, currColorSel.label)) {
            for (let alphaSelIdx = 0; alphaSelIdx < ALPHA_SELS.length; alphaSelIdx++) {
                let alphaSel = ALPHA_SELS[alphaSelIdx];
                const isSelected = ca == alphaSel.id;
                if (ImGui.Selectable(alphaSel.label, isSelected)) {
                    ca = alphaSel.id;
                }
                ImGui.SetItemTooltip(alphaSel.help);
                if (isSelected) {
                    ImGui.SetItemDefaultFocus();
                }
            }

            ImGui.EndCombo();
        }

        return ca;
    }

    private renderTexturesTab() {
        for (let texture of this.textures) {
            const name = texture.gxTexture.name;
            const dims = `${texture.gxTexture.width}x${texture.gxTexture.height}`;
            const mips = `${texture.gxTexture.mipCount} mip level(s)`;
            ImGui.Text(`${name}: ${dims}, ${mips}`);
            ImGui.ImageWithBg(texture.imguiTextureIds[0], new ImVec2(200, 200 / (texture.gxTexture.width / texture.gxTexture.height));
            ImGui.Spacing();
        }
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

    texture: LoadedTexture,
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

function copyMaterial(orig: Material): Material {
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