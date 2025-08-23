import { ImGui, ImVec2 } from "@mori2003/jsimgui";
import { GfxDevice } from "../../gfx/platform/GfxPlatform";
import { GfxRenderCache } from "../../gfx/render/GfxRenderCache";
import { TextureCache } from "../ModelCache";
import { Material, Model, Texture } from "./Scene";

export class AnimationsGui {
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
    }
}