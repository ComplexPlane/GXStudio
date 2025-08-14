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

        ImGui.SameLine();
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

        ImGui.End();
        ImGuiImplWeb.EndRender();
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