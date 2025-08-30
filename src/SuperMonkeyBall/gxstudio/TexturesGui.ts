import { ImGui, ImVec2 } from "@mori2003/jsimgui";
import { GfxDevice } from "../../gfx/platform/GfxPlatform";
import { GfxRenderCache } from "../../gfx/render/GfxRenderCache";
import { TextureCache } from "../ModelCache";
import { GuiShared } from "./GuiShared";


export class TexturesGui {
    private scratchImVec2a = new ImVec2();

    constructor(
        private device: GfxDevice,
        private renderCache: GfxRenderCache,
        private textureCache: TextureCache,
        private s: GuiShared
    ) {}

    public render() {
        if (ImGui.BeginChild("Textures Child")) {
            ImGui.SeparatorText("Textures List");
            for (let texture of this.s.textures) {
                const name = texture.gxTexture.name;
                const dims = `${texture.gxTexture.width}x${texture.gxTexture.height}`;
                const mips = `${texture.gxTexture.mipCount} mip level(s)`;
                ImGui.Text(`${name}: ${dims}, ${mips}`);

                const displaySize = this.scratchImVec2a;
                displaySize.x = 200;
                displaySize.y = 200 / (texture.gxTexture.width / texture.gxTexture.height);
                ImGui.ImageWithBg(texture.imguiTextureIds[0], displaySize);

                ImGui.Spacing();
            }
            ImGui.EndChild();
        }
    }
}
