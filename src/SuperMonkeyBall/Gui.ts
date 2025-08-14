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

        if (ImGui.BeginPopup("Rename Material")) {
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

        if (ImGui.BeginPopup("Duplicate Material")) {
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
        ImGui.SeparatorText(`Edit Material '${this.materials[this.selMaterial]}'`);
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