import {
    ImGui,
    ImGuiImplWeb,
    ImTextureRef,
    ImVec2
} from "@mori2003/jsimgui";

import { GfxDevice } from "../../gfx/platform/GfxPlatform.js";
import { GfxRenderCache } from "../../gfx/render/GfxRenderCache.js";
import { calcMipChain, decodeTexture, TextureInputGX } from "../../gx/gx_texture.js";
import { Gma } from "../Gma.js";
import { TextureCache } from "../ModelCache.js";
import { AnimationsGui } from "./AnimationsGui.js";
import { MaterialListGui } from "./MaterialListGui.js";
import { ModelsGui } from "./ModelsGui.js";
import { GuiScene, Material, Model, Texture } from "./Scene.js";
import { GuiShared } from "./GuiShared.js";
import { TevGui } from "./TevGui.js";
import { TexturesGui } from "./TexturesGui.js";
import { encodeRoot, decodeRoot } from "./ImportExport.js";
import { AutoSave } from "./AutoSave.js";

export class Gui {
    private modelsGui: ModelsGui;
    private materialListGui: MaterialListGui;
    private tevGui: TevGui;
    private animationsGui: AnimationsGui;
    private texturesGui: TexturesGui;

    private device: GfxDevice;
    private renderCache: GfxRenderCache;
    private textureCache: TextureCache;

    private shared: GuiShared;
    private autoSave: AutoSave;

    private canvasElem: HTMLCanvasElement;
    private imguiSize = new ImVec2();
    private imguiPos = new ImVec2(0, 0);

    private importError = "";

    constructor(
        device: GfxDevice,
        renderCache: GfxRenderCache,
        textureCache: TextureCache,
        gma: Gma
    ) {
        this.device = device;
        this.renderCache = renderCache;
        this.textureCache = textureCache;

        this.shared = {
            models: [],
            materials: [],
            currMaterial: null,
            textures: []
        };

        this.canvasElem = document.getElementById("imguiCanvas") as HTMLCanvasElement;
        this.loadTextures(gma);

        for (let model of gma.idMap.values()) {
            this.shared.models.push({
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
            this.shared
        );
        this.materialListGui = new MaterialListGui(
            device,
            renderCache,
            textureCache,
            this.shared
        );
        this.tevGui = new TevGui(
            device,
            renderCache,
            textureCache,
            this.shared
        );
        this.animationsGui = new AnimationsGui(
            device,
            renderCache,
            textureCache,
            this.shared
        );
        this.texturesGui = new TexturesGui(
            device,
            renderCache,
            textureCache,
            this.shared
        );

        // Initialize AutoSave (but don't load/start yet - wait for textures)
        this.autoSave = new AutoSave(
            () => this.getGuiScene(),
            () => this.shared.textures,
            (name: string) => this.createNewMaterial(name)
        );
    }

    public getGuiScene(): GuiScene {
        return { models: this.shared.models, materials: this.shared.materials };
    }

    private createNewMaterial(name: string): Material {
        return new Material(this.device, this.renderCache, this.textureCache, name);
    }

    private initializeAutosave(): void {
        // Load autosaved state if available (now that textures are ready)
        if (this.autoSave.hasAutosavedState()) {
            const error = this.autoSave.loadAutosavedState();
            if (error) {
                console.warn("Failed to load autosaved state:", error);
            }
        }

        // Start autosaving
        this.autoSave.start();
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

        let gxTextureIdx = 0;
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
                        idx: gxTextureIdx,
                        imguiTextureIds: imguiTexIds,
                        gxTexture: gxTexture,
                    };
                    return texture;
                })
            );
            gxTextureIdx++;
        }

        Promise.all(texturePromises).then((textures) => {
            textures.sort((a, b) => a.gxTexture.name.localeCompare(b.gxTexture.name));
            this.shared.textures.push(...textures);
            
            // Now that textures are loaded, initialize autosave
            this.initializeAutosave();
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
        const material = this.shared.currMaterial;
        if (material === null) {
            return;
        }

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

                if (ImGui.MenuItem("Import Materials...", "")) {
                    this.importMaterials();
                }
                if (ImGui.MenuItem("Export Materials...", "")) {
                    this.exportMaterials();
                }

                ImGui.EndMenu();
            }
            ImGui.EndMenuBar();
        }
    }

    private importMaterials() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json,.json';

        input.onchange = (event) => {
            const file = (event.target as HTMLInputElement).files?.[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (e) => {
                let jsonData;
                try {
                    jsonData = JSON.parse(e.target?.result as string);
                } catch (error) {
                    this.importError = `Invalid JSON: ${error}`;
                    ImGui.OpenPopup("Import Material Failed");
                    return;
                }

                const error = decodeRoot(
                    jsonData, 
                    this.shared.textures, 
                    this.getGuiScene(),
                    (name: string) => new Material(this.device, this.renderCache, this.textureCache, name)
                );

                if (error) {
                    this.importError = error;
                    ImGui.OpenPopup("Import Material Failed");
                    return;
                }

                // Keep current material selection if it still exists
                if (this.shared.currMaterial === null && this.shared.materials.length > 0) {
                    this.shared.currMaterial = this.shared.materials[0];
                }
            };
            reader.readAsText(file);
        };

        document.body.appendChild(input);
        input.click();
        document.body.removeChild(input);

        if (ImGui.BeginPopupModal("Import Material")) {
            ImGui.Text("Materials imported.");
            if (ImGui.Button("OK")) {
                ImGui.CloseCurrentPopup();
            }
            ImGui.EndPopup();
        }

        if (ImGui.BeginPopupModal("Import Material Failed")) {
            ImGui.Text("Importing materials failed:");
            ImGui.Text(this.importError);
            if (ImGui.Button("OK")) {
                ImGui.CloseCurrentPopup();
            }
            ImGui.EndPopup();
        }
    }

    private exportMaterials() {
        const exportedJson = encodeRoot(this.shared.materials);
        const jsonString = JSON.stringify(exportedJson, null, 2);

        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = 'gxstudio-materials.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        URL.revokeObjectURL(url);
    }

    public destroy(): void {
        // Stop autosaving when the GUI is destroyed
        this.autoSave.destroy();
    }
}
