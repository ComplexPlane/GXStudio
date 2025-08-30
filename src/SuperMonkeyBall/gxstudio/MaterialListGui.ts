import {
    ImGui,
    ImVec2,
    ImVec4
} from "@mori2003/jsimgui";

import { GfxDevice } from "../../gfx/platform/GfxPlatform.js";
import { GfxRenderCache } from "../../gfx/render/GfxRenderCache.js";
import { TextureCache } from "../ModelCache.js";
import { GuiShared } from "./GuiShared.js";
import { Material } from "./Scene.js";

export class MaterialListGui {
    private tmpName: string[] | null = null;
    private errorColor = new ImVec4(1, 0.2, 0.2, 1);
    private size = new ImVec2(0, 100);

    constructor(
        private device: GfxDevice,
        private renderCache: GfxRenderCache,
        private textureCache: TextureCache,
        private s: GuiShared
    ) {}


    public render() {
        ImGui.SeparatorText("Materials List");
        if (ImGui.BeginListBox("Materials", this.size)) {
            for (let i = 0; i < this.s.materials.length; i++) {
                const isSelected = this.s.materials[i] === this.s.currMaterial;
                if (ImGui.Selectable(this.s.materials[i].name, isSelected)) {
                    this.s.currMaterial = this.s.materials[i];
                }
                if (isSelected) {
                    ImGui.SetItemDefaultFocus();
                }
            }
            ImGui.EndListBox();
        }
        if (ImGui.Button("New")) {
            this.createNewMaterial();
        }

        if (this.s.currMaterial === null) {
            ImGui.BeginDisabled();
        }
        {
            ImGui.SameLine();
            if (ImGui.Button("Rename")) {
                ImGui.OpenPopup("Rename Material");
            }
            ImGui.SameLine();
            if (ImGui.Button("Duplicate")) {
                this.duplicateMaterial();
            }
            ImGui.SameLine();
            if (ImGui.Button("Delete")) {
                ImGui.OpenPopup("Delete Material");
            }
            ImGui.SameLine();
            if (ImGui.ArrowButton("Move Down", ImGui.Dir._Down)) {
                const currIdx = this.s.materials.indexOf(this.s.currMaterial!);
                if (currIdx >= 0) {
                    const newIdx = swap(this.s.materials, currIdx, currIdx + 1);
                    this.s.currMaterial = this.s.materials[newIdx];
                }
            }
            ImGui.SameLine();
            if (ImGui.ArrowButton("Move Up", ImGui.Dir._Up)) {
                const currIdx = this.s.materials.indexOf(this.s.currMaterial!);
                if (currIdx >= 0) {
                    const newIdx = swap(this.s.materials, currIdx, currIdx - 1);
                    this.s.currMaterial = this.s.materials[newIdx];
                }
            }
        }
        if (this.s.currMaterial === null) {
            ImGui.EndDisabled();
        }


        // Rename material
        if (this.s.currMaterial !== null) {
            const newName = this.nameSomethingPopup(
                "Rename Material",
                this.s.currMaterial.name
            );
            if (newName !== null) {
                this.s.currMaterial.name = newName;
            }
        }

        if (ImGui.BeginPopup("Delete Material")) {
            ImGui.Text(`Delete material '${this.s.currMaterial!.name}'?`);
            if (ImGui.Button("OK")) {
                this.deleteMaterial();
                ImGui.CloseCurrentPopup();
            }
            ImGui.SameLine();
            if (ImGui.Button("Cancel")) {
                ImGui.CloseCurrentPopup();
            }
            ImGui.EndPopup();
        }
    }

    private createNewMaterial() {
        const materialName = this.generateNextMaterialName(this.s.materials.map((m) => m.name));
        const material = new Material(
            this.device,
            this.renderCache,
            this.textureCache,
            materialName
        );
        const currIdx = this.s.currMaterial ? this.s.materials.indexOf(this.s.currMaterial) : -1;
        const newIdx = currIdx + 1;
        this.s.materials.splice(newIdx, 0, material);
        this.s.currMaterial = material;
    }

    private duplicateMaterial() {
        if (this.s.currMaterial === null) return;
        
        const newName = this.generateNextMaterialName(this.s.materials.map((m) => m.name));
        const clone = this.s.currMaterial.clone(newName);
        const currIdx = this.s.materials.indexOf(this.s.currMaterial);
        const newIdx = currIdx + 1;
        this.s.materials.splice(newIdx, 0, clone);
        this.s.currMaterial = clone;
    }

    private deleteMaterial() {
        if (this.s.currMaterial === null) return;

        // Remove any mesh references to this material
        const materialToDelete = this.s.currMaterial;
        for (let model of this.s.models.values()) {
            for (let mesh of model.meshes) {
                if (mesh.material === materialToDelete) {
                    mesh.material = null;
                }
            }
        }

        // Delete material
        const currIdx = this.s.materials.indexOf(materialToDelete);
        this.s.materials.splice(currIdx, 1);
        const newIdx = currIdx === this.s.materials.length ? currIdx - 1 : currIdx;
        this.s.currMaterial = newIdx >= 0 && newIdx < this.s.materials.length ? this.s.materials[newIdx] : null;
    }

    private nameSomethingPopup(
        label: string,
        defaultName: string
    ): string | null {
        let ret = null;
        if (ImGui.BeginPopup(label)) {
            ImGui.Text(label);

            this.tmpName = this.tmpName ?? [defaultName];
            ImGui.InputText("Name", this.tmpName, 256);

            const trimmedName = this.tmpName[0].trim();

            const nameEmpty = trimmedName.length === 0;
            const disabled = nameEmpty;

            if (nameEmpty) {
                ImGui.TextColored(this.errorColor, "Error: Empty Name");
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

    private generateNextMaterialName(existingNames: string[]): string {
        const baseName = "Material";
        
        // If no materials exist, start with "Material 1"
        if (existingNames.length === 0) {
            return `${baseName} 1`;
        }
        
        // Find the highest number used with the base name
        let highestNumber = 0;
        const regex = new RegExp(`^${baseName}\\s+(\\d+)$`);
        
        for (const name of existingNames) {
            const match = name.match(regex);
            if (match) {
                const number = parseInt(match[1], 10);
                highestNumber = Math.max(highestNumber, number);
            }
        }
        
        // Return the next number in sequence
        return `${baseName} ${highestNumber + 1}`;
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
