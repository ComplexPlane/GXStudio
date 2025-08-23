
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
import { renderCombo } from "./GuiUtils.js";

export class ModelsGui {
    constructor(
        private device: GfxDevice,
        private renderCache: GfxRenderCache, 
        private textureCache: TextureCache,
        private models: Model[],
        private materials: Material[],
        private textures: Texture[],
    ) {
    }

    public render() {
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
}
