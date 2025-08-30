import { encodeRoot, decodeRoot } from "./ImportExport.js";
import { Texture, Material } from "./Scene.js";
import { GuiShared } from "./GuiShared.js";

export class AutoSave {
    private intervalId: number | null = null;
    private lastSavedStateJson: string | null = null;
    private readonly STORAGE_KEY = "gxstudio-autosave";
    private readonly AUTOSAVE_INTERVAL_MS = 500;
    private isDestroyed = false;

    private getGuiShared: () => GuiShared;
    private getTextures: () => Texture[];
    private newMaterialFunc: (name: string) => Material;

    constructor(
        getGuiShared: () => GuiShared,
        getTextures: () => Texture[],
        newMaterialFunc: (name: string) => Material
    ) {
        this.getGuiShared = getGuiShared;
        this.getTextures = getTextures;
        this.newMaterialFunc = newMaterialFunc;
    }

    /**
     * Start the autosave timer that checks for changes every 0.5 seconds
     */
    public start(): void {
        if (this.intervalId !== null || this.isDestroyed) {
            return; // Already running or destroyed
        }

        this.intervalId = window.setInterval(() => {
            if (!this.isDestroyed) {
                this.checkAndSave();
            }
        }, this.AUTOSAVE_INTERVAL_MS);
    }

    /**
     * Stop the autosave timer
     */
    public stop(): void {
        if (this.intervalId !== null) {
            window.clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    public destroy(): void {
        this.stop();
        this.isDestroyed = true;
    }

    /**
     * Load autosaved state from localStorage on initialization
     */
    public loadAutosavedState(): string | null {
        try {
            const savedData = localStorage.getItem(this.STORAGE_KEY);
            if (!savedData) {
                return null;
            }

            const parsedData = JSON.parse(savedData);
            const scene = this.getGuiShared();
            const textures = this.getTextures();
            
            const error = decodeRoot(parsedData, textures, scene, this.newMaterialFunc);
            if (error) {
                console.warn("Failed to load autosaved state:", error);
                return error;
            }

            // Update our cached state to match what was actually loaded
            const updatedScene = this.getGuiShared();
            const currentState = encodeRoot(updatedScene.materials);
            this.lastSavedStateJson = JSON.stringify(currentState);
            return null; // Success
        } catch (e) {
            console.warn("Failed to parse autosaved state:", e);
            return "Failed to parse autosaved state";
        }
    }

    /**
     * Clear the autosaved state from localStorage
     */
    public clearAutosavedState(): void {
        localStorage.removeItem(this.STORAGE_KEY);
        this.lastSavedStateJson = null;
    }

    /**
     * Check if the current state differs from the last saved state, and save if needed
     */
    private checkAndSave(): void {
        try {
            const scene = this.getGuiShared();
            const currentState = encodeRoot(scene.materials);
            const currentStateJson = JSON.stringify(currentState);

            // Compare with last saved state
            if (currentStateJson !== this.lastSavedStateJson) {
                localStorage.setItem(this.STORAGE_KEY, currentStateJson);
                this.lastSavedStateJson = currentStateJson;
            }
        } catch (e) {
            console.error("AUTOSAVE FAILED:", e);
            // Stop autosaving to prevent repeated failures
            this.stop();
            // Could emit an event here to notify UI of autosave failure
        }
    }

    /**
     * Check if there is an autosaved state available
     */
    public hasAutosavedState(): boolean {
        return localStorage.getItem(this.STORAGE_KEY) !== null;
    }
}