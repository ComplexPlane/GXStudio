import { ImGui, ImGuiImplWeb, ImVec2 } from "@mori2003/jsimgui";

export class Gui {
    private imguiSize: ImVec2;
    private imguiPos: ImVec2;

    private selMaterial: number = 0;
    private materials = ["Material 1", "Material 2", "Material 3", "Material 4", "Material 5"];
    private tmpName: string[] | null = null;

    constructor(private guiState: GuiState) {
        const imguiCanvas = document.getElementById("imguiCanvas") as HTMLCanvasElement;
        this.imguiSize = new ImVec2(imguiCanvas.clientWidth, imguiCanvas.clientHeight);
        this.imguiPos = new ImVec2(0, 0);
    }

    public getGuiState(): GuiState {
        return this.guiState;
    }

    public render() {
        ImGuiImplWeb.BeginRender();
        ImGui.SetNextWindowSize(this.imguiSize);
        ImGui.SetNextWindowPos(this.imguiPos);
        ImGui.Begin("Root", [], ImGui.WindowFlags.NoTitleBar | ImGui.WindowFlags.NoResize);

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

    private renderModelsGui() {
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
    }

    private renderMaterialsList() {
        if (ImGui.BeginListBox("Materials List")) {
            for (let i = 0; i < this.materials.length; i++) {
                const selected = i == this.selMaterial;
                if (ImGui.Selectable(this.materials[i], selected)) {
                    this.selMaterial = i;
                }
                if (selected) {
                    ImGui.SetItemDefaultFocus();
                }
            }
            ImGui.EndListBox();
        }
        if (ImGui.Button("New")) {
            ImGui.OpenPopup("New Material");
        }
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

        if (ImGui.BeginPopup("New Material", undefined)) {
            this.tmpName = this.tmpName ?? ["My New Material"];

            ImGui.Text("New Material:");
            ImGui.InputText("Name", this.tmpName, 256);
            if (ImGui.Button("OK")) {
                this.materials.push(this.tmpName[0]);
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

        if (ImGui.BeginPopup("Rename Material", undefined)) {
            this.tmpName = this.tmpName ?? [this.materials[this.selMaterial]];

            ImGui.InputText("Name", this.tmpName, 256);
            if (ImGui.Button("OK")) {
                this.materials[this.selMaterial] = this.tmpName[0];
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

        if (ImGui.BeginPopup("Duplicate Material", undefined)) {
            this.tmpName = this.tmpName ?? [this.materials[this.selMaterial]];

            ImGui.Text(`Duplicate material '${this.materials[this.selMaterial]}':`);
            ImGui.InputText("New Name", this.tmpName, 256);
            if (ImGui.Button("OK")) {
                this.materials.splice(this.selMaterial + 1, 0, this.tmpName[0]);
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

        if (ImGui.BeginPopup("Delete Material", undefined)) {
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