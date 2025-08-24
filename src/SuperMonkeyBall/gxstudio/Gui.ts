import {
    ImGui,
    ImGuiID,
    ImGuiImplWeb,
    ImTextureID,
    ImTextureRef,
    ImVec2,
    ImVec4,
} from "@mori2003/jsimgui";

import * as GX from "../../gx/gx_enum.js";
import { LoadedTexture } from "../../TextureHolder.js";
import { TextureCache } from "../ModelCache.js";
import { Gma } from "../Gma.js";
import { calcMipChain, decodeTexture, TextureInputGX } from "../../gx/gx_texture.js";
import * as gui_material from "./MaterialInst.js";
import { GfxDevice } from "../../gfx/platform/GfxPlatform.js";
import { GfxRenderCache } from "../../gfx/render/GfxRenderCache.js";
import { assertExists } from "../../util.js";
import { GuiScene, Material, Model, TevStage, Texture } from "./Scene.js";
import { ModelsGui } from "./ModelsGui.js";
import { MaterialListGui } from "./MaterialListGui.js";
import { TevGui } from "./TevGui.js";
import { TexturesGui } from "./TexturesGui.js";
import { AnimationsGui } from "./AnimationsGui.js";

export class Gui {
    private modelsGui: ModelsGui;
    private materialListGui: MaterialListGui;
    private tevGui: TevGui;
    private animationsGui: AnimationsGui;
    private texturesGui: TexturesGui;

    private models: Model[] = [];
    private materials: Material[] = [];
    private textures: Texture[] = [];

    private canvasElem: HTMLCanvasElement;
    private imguiSize = new ImVec2();
    private imguiPos = new ImVec2(0, 0);

    constructor(
        device: GfxDevice,
        renderCache: GfxRenderCache,
        textureCache: TextureCache,
        gma: Gma
    ) {
        this.canvasElem = document.getElementById("imguiCanvas") as HTMLCanvasElement;
        this.loadTextures(gma);

        for (let model of gma.idMap.values()) {
            this.models.push({
                name: model.name,
                meshes: model.shapes.map((_) => {
                    return { material: null };
                }),
                visible: true,
                hover: false,
            });
        }

        this.modelsGui = new ModelsGui(
            device,
            renderCache,
            textureCache,
            this.models,
            this.materials,
            this.textures
        );
        this.materialListGui = new MaterialListGui(
            device,
            renderCache,
            textureCache,
            this.models,
            this.materials,
            this.textures
        );
        this.tevGui = new TevGui(
            device,
            renderCache,
            textureCache,
            this.models,
            this.materials,
            this.textures,
            this.materialListGui
        );
        this.animationsGui = new AnimationsGui(
            device,
            renderCache,
            textureCache,
            this.models,
            this.materials,
            this.textures,
            this.materialListGui
        );
        this.texturesGui = new TexturesGui(
            device,
            renderCache,
            textureCache,
            this.models,
            this.materials,
            this.textures
        );
    }

    public getGuiScene(): GuiScene {
        return { models: this.models, materials: this.materials };
    }

    private loadTextures(gma: Gma) {
        // Gather list of unique textures
        const uniqueTextures = new Map<string, TextureInputGX>();
        for (let modelData of gma.idMap.values()) {
            for (let layerData of modelData.tevLayers) {
                uniqueTextures.set(layerData.gxTexture.name, layerData.gxTexture);
            }
        }

        const texturePromises = [];

        for (let gxTexture of uniqueTextures.values()) {
            const mipChain = calcMipChain(gxTexture, gxTexture.mipCount);
            const mipPromises = [];
            for (let mipLevel of mipChain.mipLevels) {
                mipPromises.push(
                    decodeTexture(mipLevel).then((decoded) => {
                        const array = new Uint8Array(
                            decoded.pixels.buffer,
                            decoded.pixels.byteOffset,
                            decoded.pixels.byteLength
                        );
                        const id = ImGuiImplWeb.LoadTexture(array, {
                            width: mipLevel.width,
                            height: mipLevel.height,
                        });
                        return new ImTextureRef(id);
                    })
                );
            }
            texturePromises.push(
                Promise.all(mipPromises).then((imguiTexIds) => {
                    const texture: Texture = {
                        imguiTextureIds: imguiTexIds,
                        gxTexture: gxTexture,
                    };
                    return texture;
                })
            );
        }

        Promise.all(texturePromises).then((textures) => {
            textures.sort((a, b) => a.gxTexture.name.localeCompare(b.gxTexture.name));
            this.textures.push(...textures);
        });
    }

    public render() {
        ImGuiImplWeb.BeginRender();

        this.imguiSize.x = this.canvasElem.clientWidth;
        this.imguiSize.y = this.canvasElem.clientHeight;
        ImGui.SetNextWindowSize(this.imguiSize);
        ImGui.SetNextWindowPos(this.imguiPos);
        ImGui.Begin(
            "Root",
            [],
            ImGui.WindowFlags.NoTitleBar | ImGui.WindowFlags.NoResize | ImGui.WindowFlags.MenuBar
        );

        this.renderMenuBar();

        if (ImGui.BeginTabBar("Tabs")) {
            if (ImGui.BeginTabItem("Models")) {
                this.modelsGui.render();
                ImGui.EndTabItem();
            }
            if (ImGui.BeginTabItem("Materials")) {
                this.materialListGui.render();
                this.renderMaterialEditorGui();
                ImGui.EndTabItem();
            }
            if (ImGui.BeginTabItem("Textures")) {
                this.texturesGui.render();
                ImGui.EndTabItem();
            }
            ImGui.EndTabBar();
        }

        ImGui.End();
        ImGuiImplWeb.EndRender();
    }

    private renderMaterialEditorGui() {
        const selMaterial = this.materialListGui.getSelectedMaterialIdx();
        if (selMaterial < 0) {
            return;
        }
        const material = this.materials[selMaterial];

        ImGui.SeparatorText(`Edit Material '${material.name}'`);

        if (ImGui.BeginTabBar("Material Tabs")) {
            if (ImGui.BeginTabItem("TEV Configuration")) {
                ImGui.Spacing();
                this.tevGui.render();
                ImGui.EndTabItem();
            }
            if (ImGui.BeginTabItem("Animations")) {
                ImGui.Spacing();
                this.animationsGui.render();
                ImGui.EndTabItem();
            }
            ImGui.EndTabBar();
        }
    }

    private renderMenuBar() {
        // TODO(complexplane): broken
        if (ImGui.BeginMenuBar()) {
            if (ImGui.BeginMenu("File")) {
                if (ImGui.BeginPopup("Import")) {
                    ImGui.Text("Not yet implemented");
                    if (ImGui.Button("OK")) {
                        ImGui.CloseCurrentPopup();
                    }
                    ImGui.EndPopup();
                }
                if (ImGui.BeginPopup("Export")) {
                    ImGui.Text("Not yet implemented");
                    if (ImGui.Button("OK")) {
                        ImGui.CloseCurrentPopup();
                    }
                    ImGui.EndPopup();
                }

                if (ImGui.MenuItem("Import...", "")) {
                    ImGui.OpenPopup("Import");
                }
                if (ImGui.MenuItem("Export...", "")) {
                    ImGui.OpenPopup("Export");
                }

                ImGui.EndMenu();
            }
            ImGui.EndMenuBar();
        }
    }
}
