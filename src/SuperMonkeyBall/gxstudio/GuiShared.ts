import { ImGui } from "@mori2003/jsimgui";
import { Material, Model, Texture } from "./Scene";

export type GuiShared = {
    models: Model[];
    materials: Material[];
    currMaterial: Material | null;
    textures: Texture[];
};

export function renderCombo<T>(
    label: string,
    items: T[],
    selectedItem: T,
    formatFunc: (v: T) => string,
    helpFunc?: (v: T) => string,
): T {
    let newSelectedItem = selectedItem;
    if (ImGui.BeginCombo(label, formatFunc(selectedItem), ImGui.ComboFlags.HeightLarge)) {
        for (let i = 0; i < items.length; i++) {
            let item = items[i];
            const isSelected = item === selectedItem;
            if (ImGui.Selectable(formatFunc(item), isSelected)) {
                newSelectedItem = item;
            }
            if (helpFunc !== undefined) {
                ImGui.SetItemTooltip(helpFunc(item));
            }
            if (isSelected) {
                ImGui.SetItemDefaultFocus();
            }
        }

        ImGui.EndCombo();
    }
    return newSelectedItem;
}

export function createIdMap<T extends { id: K }, K = T["id"]>(items: T[]): Map<K, T> {
    return new Map(items.map((item) => [item.id, item]));
}
