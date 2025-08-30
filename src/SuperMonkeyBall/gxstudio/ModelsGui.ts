import { ImGui } from "@mori2003/jsimgui";

import { GfxDevice } from "../../gfx/platform/GfxPlatform.js";
import { GfxRenderCache } from "../../gfx/render/GfxRenderCache.js";
import { TextureCache } from "../ModelCache.js";
import { GuiShared, renderCombo } from "./GuiShared.js";

export class ModelsGui {
    constructor(
        private device: GfxDevice,
        private renderCache: GfxRenderCache,
        private textureCache: TextureCache,
        private s: GuiShared,
    ) {}

    public render() {
        ImGui.SeparatorText("Models List");
        if (ImGui.Button("Show All")) {
            for (let model of this.s.models.values()) {
                model.visible = true;
            }
        }
        ImGui.SameLine();
        if (ImGui.Button("Hide All")) {
            for (let model of this.s.models.values()) {
                model.visible = false;
            }
        }

        if (ImGui.BeginChild("Models List Child")) {
            const a = [false];
            const maybeMaterials = [null, ...this.s.materials];
            for (let model of this.s.models) {
                ImGui.PushID(model.name);
                if (ImGui.TreeNodeEx(model.name)) {
                    model.hover = ImGui.IsItemHovered();

                    a[0] = model.visible;
                    ImGui.Checkbox("Visible", a);
                    model.visible = a[0];

                    for (let meshIdx = 0; meshIdx < model.meshes.length; meshIdx++) {
                        const mesh = model.meshes[meshIdx];
                        if (ImGui.TreeNodeEx(`Mesh ${meshIdx}`, ImGui.TreeNodeFlags.DefaultOpen)) {
                            model.meshes[meshIdx].material = renderCombo(
                                "Material",
                                maybeMaterials,
                                mesh.material,
                                (m) => (m === null ? "<default>" : m.name),
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
}
