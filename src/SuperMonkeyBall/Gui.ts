import { ImGui, ImGuiImplWeb, ImVec2 } from "@mori2003/jsimgui";

export class Gui {
    private imguiSize: ImVec2;
    private imguiPos: ImVec2;

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
        ImGui.Begin("Test Window", [], ImGui.WindowFlags.NoTitleBar | ImGui.WindowFlags.NoResize);

        for (let [name, viz] of this.guiState.models.entries()) {
            let currViz = viz;
            if (ImGui.BeginCombo(name, viz)) {
                for (const possibleViz of Object.values(ModelViz)) {
                    const selected = viz == possibleViz;
                    if (ImGui.Selectable(possibleViz, selected)) {
                        currViz = possibleViz;
                    }
                    if (selected) {
                        ImGui.SetItemDefaultFocus();
                    }
                }
                ImGui.EndCombo();
            }
            this.guiState.models.set(name, currViz);
        }

        ImGui.End();
        ImGuiImplWeb.EndRender();
    }
}

export class GuiState {
    public models: Map<string, ModelViz>;

    constructor() {
        this.models = new Map();
    }
}

export enum ModelViz {
    Visible = "Visible",
    Invisible = "Invisible",
    Wireframe = "Wireframe",
};