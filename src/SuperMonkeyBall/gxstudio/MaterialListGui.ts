import {
    ImGui,
    ImVec2,
    ImVec4
} from "@mori2003/jsimgui";

import { GfxDevice } from "../../gfx/platform/GfxPlatform.js";
import { GfxRenderCache } from "../../gfx/render/GfxRenderCache.js";
import { TextureCache } from "../ModelCache.js";
import { Material, Model, Texture } from "./Scene.js";

export class MaterialListGui {
    private selMaterial: number = -1;
    private tmpName: string[] | null = null;
    private errorColor = new ImVec4(1, 0.2, 0.2, 1);
    private size = new ImVec2(0, 100);

    constructor(
        private device: GfxDevice,
        private renderCache: GfxRenderCache,
        private textureCache: TextureCache,
        private models: Model[],
        private materials: Material[],
        private textures: Texture[]
    ) {}

    public getSelectedMaterialIdx(): number {
        return this.selMaterial;
    }

    public setSelectedMaterialIdx(idx: number) {
        this.selMaterial = idx;
    }

    public render() {
        ImGui.SeparatorText("Materials List");
        if (ImGui.BeginListBox("Materials", this.size)) {
            for (let i = 0; i < this.materials.length; i++) {
                const isSelected = i === this.selMaterial;
                if (ImGui.Selectable(this.materials[i].name, isSelected)) {
                    this.selMaterial = i;
                }
                if (isSelected) {
                    ImGui.SetItemDefaultFocus();
                }
            }
            ImGui.EndListBox();
        }
        if (ImGui.Button("New")) {
            ImGui.OpenPopup("New Material");
        }

        if (this.materials.length === 0) {
            ImGui.BeginDisabled();
        }
        {
            ImGui.SameLine();
            if (ImGui.Button("Rename")) {
                ImGui.OpenPopup("Rename Material");
            }
            ImGui.SameLine();
            if (ImGui.Button("Duplicate")) {
                ImGui.OpenPopup("Duplicate Material");
            }
            ImGui.SameLine();
            if (ImGui.Button("Delete")) {
                ImGui.OpenPopup("Delete Material");
            }
            ImGui.SameLine();
            if (ImGui.ArrowButton("Move Down", ImGui.Dir._Down)) {
                this.selMaterial = swap(this.materials, this.selMaterial, this.selMaterial + 1);
            }
            ImGui.SameLine();
            if (ImGui.ArrowButton("Move Up", ImGui.Dir._Up)) {
                this.selMaterial = swap(this.materials, this.selMaterial, this.selMaterial - 1);
            }
        }
        if (this.materials.length === 0) {
            ImGui.EndDisabled();
        }

        // New material
        const materialName = this.nameSomethingPopup(
            "New Material",
            "My New Material",
            this.materials.map((m) => m.name)
        );
        if (materialName !== null) {
            const material = new Material(
                this.device,
                this.renderCache,
                this.textureCache,
                materialName
            );
            this.selMaterial++;
            this.materials.splice(this.selMaterial, 0, material);
        }

        // Rename material
        if (this.materials.length > 0) {
            const newName = this.nameSomethingPopup(
                "Rename Material",
                this.materials[this.selMaterial].name,
                this.materials.filter((_, i) => i !== this.selMaterial).map((m) => m.name)
            );
            if (newName !== null) {
                this.materials[this.selMaterial].name = newName;
            }
        }

        // Duplicate material
        if (this.materials.length > 0) {
            const newName = this.nameSomethingPopup(
                "Duplicate Material",
                this.materials[this.selMaterial].name,
                this.materials.map((m) => m.name)
            );
            if (newName !== null) {
                const clone = this.materials[this.selMaterial].clone(newName);
                this.selMaterial++;
                this.materials.splice(this.selMaterial, 0, clone);
            }
        }

        if (ImGui.BeginPopup("Delete Material")) {
            ImGui.Text(`Delete material '${this.materials[this.selMaterial].name}'?`);
            if (ImGui.Button("OK")) {
                // Remove any mesh references to this material
                const materialToDelete = this.materials[this.selMaterial];
                for (let model of this.models.values()) {
                    for (let mesh of model.meshes) {
                        if (mesh.material === materialToDelete) {
                            mesh.material = null;
                        }
                    }
                }

                // Delete material
                this.materials.splice(this.selMaterial, 1);
                if (this.selMaterial === this.materials.length) {
                    this.selMaterial--;
                }

                ImGui.CloseCurrentPopup();
            }
            ImGui.SameLine();
            if (ImGui.Button("Cancel")) {
                ImGui.CloseCurrentPopup();
            }
            ImGui.EndPopup();
        }
    }

    private nameSomethingPopup(
        label: string,
        defaultName: string,
        existingNames: string[]
    ): string | null {
        let ret = null;
        if (ImGui.BeginPopup(label)) {
            ImGui.Text(label);

            this.tmpName = this.tmpName ?? [defaultName];
            ImGui.InputText("Name", this.tmpName, 256);

            const trimmedName = this.tmpName[0].trim();

            const nameEmpty = trimmedName.length === 0;
            const nameConflict = existingNames.includes(trimmedName);
            const disabled = nameEmpty || nameConflict;

            if (nameEmpty) {
                ImGui.TextColored(this.errorColor, "Error: Empty Name");
            }
            if (nameConflict) {
                ImGui.TextColored(this.errorColor, "Error: Duplicate Name");
            }

            if (disabled) {
                ImGui.BeginDisabled();
            }
            if (ImGui.Button("OK")) {
                ret = trimmedName;
                this.tmpName = null;
                ImGui.CloseCurrentPopup();
            }
            if (disabled) {
                ImGui.EndDisabled();
            }

            ImGui.SameLine();
            if (ImGui.Button("Cancel")) {
                this.tmpName = null;
                ImGui.CloseCurrentPopup();
            }
            ImGui.EndPopup();
        }
        return ret;
    }
}

// Returns the new index of the current item
function swap<T>(arr: T[], currIdx: number, targetIdx: number): number {
    if (currIdx < 0 || currIdx >= arr.length) {
        return currIdx;
    }
    if (targetIdx < 0 || targetIdx >= arr.length) {
        return currIdx;
    }
    const tmp = arr[targetIdx];
    arr[targetIdx] = arr[currIdx];
    arr[currIdx] = tmp;
    return targetIdx;
}
