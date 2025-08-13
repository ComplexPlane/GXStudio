import { ImGui, ImGuiImplWeb, ImVec2 } from "@mori2003/jsimgui";

export class Gui {
    private guiState: GuiState;
    private imguiSize: ImVec2;
    private imguiPos: ImVec2;

    constructor() {
        // TODO build GuiState

        const imguiCanvas = document.getElementById("imguiCanvas") as HTMLCanvasElement;
        this.imguiSize = new ImVec2(imguiCanvas.width, imguiCanvas.height);
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
        ImGui.Text("I'm loving it");
        ImGui.Button("Okay then");
        ImGui.End();

        ImGuiImplWeb.EndRender();
    }
}

// Shared state the GUI and rest of the world collaborate on
export type GuiState = {
    
}