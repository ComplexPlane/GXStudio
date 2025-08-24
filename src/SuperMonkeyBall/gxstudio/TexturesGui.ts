import { ImGui, ImVec2 } from "@mori2003/jsimgui";
import { GfxDevice } from "../../gfx/platform/GfxPlatform";
import { GfxRenderCache } from "../../gfx/render/GfxRenderCache";
import { TextureCache } from "../ModelCache";
import { Material, Model, Texture } from "./Scene";

export class TexturesGui {
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
        if (ImGui.BeginChild("Textures Child")) {
            ImGui.SeparatorText("Textures List");
            for (let texture of this.textures) {
                const name = texture.gxTexture.name;
                const dims = `${texture.gxTexture.width}x${texture.gxTexture.height}`;
                const mips = `${texture.gxTexture.mipCount} mip level(s)`;
                ImGui.Text(`${name}: ${dims}, ${mips}`);
                ImGui.ImageWithBg(texture.imguiTextureIds[0], new ImVec2(200, 200 / (texture.gxTexture.width / texture.gxTexture.height)));
                ImGui.Spacing();
            }
            ImGui.EndChild();
        }
    }
}