import { ImGui, ImVec2 } from "@mori2003/jsimgui";
import { GfxDevice } from "../../gfx/platform/GfxPlatform";
import { GfxRenderCache } from "../../gfx/render/GfxRenderCache";
import { TextureCache } from "../ModelCache";
import { Material, Model, Texture } from "./Scene";
import { MaterialListGui } from "./MaterialListGui";

export class AnimationsGui {
    constructor(
        private device: GfxDevice,
        private renderCache: GfxRenderCache, 
        private textureCache: TextureCache,
        private models: Model[],
        private materials: Material[],
        private textures: Texture[],
        private materialListGui: MaterialListGui,
    ) {
    }

    public render() {
        const selMaterial = this.materialListGui.getSelectedMaterialIdx();
        const material = this.materials[selMaterial];
        if (ImGui.Button("Add Scalar Anim")) {

        }
        ImGui.SameLine();
        if (ImGui.Button("Add Color Anim")) {

        }
    }
}