import { LoadedTexture, TextureMapping } from "../../TextureHolder.js";
import {
    GfxDevice,
    GfxMipFilterMode,
    GfxSampler,
    GfxTexFilterMode,
} from "../../gfx/platform/GfxPlatform.js";
import { GfxRenderCache } from "../../gfx/render/GfxRenderCache.js";
import * as GX from "../../gx/gx_enum.js";
import {
    translateWrapModeGfx
} from "../../gx/gx_render.js";
import { TextureInputGX } from "../../gx/gx_texture.js";
import { TextureCache } from "../ModelCache.js";

export class TextureInst {
    private loadedTex: LoadedTexture;
    private gfxSampler: GfxSampler;

    constructor(
        device: GfxDevice,
        renderCache: GfxRenderCache,
        textureCache: TextureCache,
        texture: TextureInputGX,
        wrapModeU: GX.WrapMode,
        wrapModeV: GX.WrapMode
    ) {
        this.loadedTex = textureCache.getTexture(device, texture);

        const width = texture.width;
        const height = texture.height;
        let maxLod = 15; // TODO: configure?
        if (width !== height) {
            maxLod = 0;
        } else if (maxLod === 15) {
            // Use 16x16 as the max LOD
            const minDim = Math.min(width, height);
            maxLod = Math.max(0, Math.log2(minDim) - 4);
        }

        this.gfxSampler = renderCache.createSampler({
            wrapS: translateWrapModeGfx(wrapModeU),
            wrapT: translateWrapModeGfx(wrapModeV),
            minFilter: GfxTexFilterMode.Bilinear,
            magFilter: GfxTexFilterMode.Bilinear,
            mipFilter: maxLod === 0 ? GfxMipFilterMode.Nearest : GfxMipFilterMode.Linear,
            minLOD: 0,
            maxLOD: maxLod,
        });
    }

    public fillTextureMapping(mapping: TextureMapping): void {
        mapping.gfxTexture = this.loadedTex.gfxTexture;
        mapping.gfxSampler = this.gfxSampler;
    }
}

