import { ImGui, ImGuiImplWeb, ImVec2, ImVec4 } from "@mori2003/jsimgui";

import * as GX from '../gx/gx_enum.js';
import { LoadedTexture } from "../TextureHolder.js";

export class Gui {
    private canvasElem: HTMLCanvasElement;
    private imguiSize = new ImVec2();
    private imguiPos = new ImVec2(0, 0);

    private selMaterial: number = 0;
    private materials: Material[] = [];
    private tmpName: string[] | null = null;
    private blue = new ImVec4(0, 0.9, 1, 1);

    constructor(private guiState: GuiState) {
        this.canvasElem = document.getElementById("imguiCanvas") as HTMLCanvasElement;
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
                const isSelected = i == this.selMaterial;
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
        ImGui.SeparatorText(`Edit Material '${this.materials[this.selMaterial].name}'`);

        const material = this.materials[this.selMaterial];

        const stagesFull = material.tevStages.length >= 8;
        if (stagesFull) {
            ImGui.BeginDisabled();
        }
        if (ImGui.Button(`Add TEV Stage (${material.tevStages.length}/8)`)) {
            this.materials[this.selMaterial].tevStages.push({
                colorInA: GX.CC.C0,
                colorInB: GX.CC.C0,
                colorInC: GX.CC.C0,
                colorInD: GX.CC.C0,
                colorOp: GX.TevOp.ADD,

                alphaInA: GX.CA.A0,
                alphaInB: GX.CA.A0,
                alphaInC: GX.CA.A0,
                alphaInD: GX.CA.A0,
                alphaOp: GX.TevOp.ADD,

                // TODO
                texture: "TODO" as any as LoadedTexture,
            });
        }
        if (stagesFull) {
            ImGui.EndDisabled();
        }

        for (let tevStageIdx = 0; tevStageIdx < material.tevStages.length; tevStageIdx++) {
            const tevStage = material.tevStages[tevStageIdx];

            ImGui.Spacing();
            ImGui.Separator();
            ImGui.Spacing();
            ImGui.TextColored(this.blue, `TEV Stage ${tevStageIdx}:`);

            if (ImGui.BeginCombo("Color A Source " + tevStageIdx, tevStage.colorInA.toString())) {
                const sources = [
                    GX.CC.CPREV,
                    GX.CC.APREV,
                    GX.CC.C0,
                    GX.CC.A0,
                    GX.CC.C1,
                    GX.CC.A1,
                    GX.CC.C2,
                    GX.CC.A2,
                    GX.CC.TEXC,
                    GX.CC.TEXA,
                    GX.CC.RASC,
                    GX.CC.RASA,
                    GX.CC.ONE,
                    GX.CC.HALF,
                    GX.CC.KONST,
                    GX.CC.ZERO
                ];

                for (let source of sources) {
                    const isSelected = tevStage.colorInA == source;
                    if (ImGui.Selectable(source.toString(), isSelected)) {
                        tevStage.colorInA = source;
                    }
                    if (isSelected) {
                        ImGui.SetItemDefaultFocus();
                    }
                }

                ImGui.EndCombo();
            }
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
    colorOp: GX.TevOp;

    alphaInA: GX.CA;
    alphaInB: GX.CA;
    alphaInC: GX.CA;
    alphaInD: GX.CA;
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