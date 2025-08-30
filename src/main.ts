
/* @preserve The source code to this website is under the MIT license and can be found at https://github.com/magcius/noclip.website */

import { ImGui, ImGuiImplWeb } from "@mori2003/jsimgui";

import { Viewer, SceneGfx, InitErrorCode, initializeViewer, makeErrorUI, resizeCanvas, ViewerUpdateInfo } from './viewer.js';

import * as Scenes_Test from './Scenes_Test.js';
import * as Scenes_SuperMonkeyBall from './SuperMonkeyBall/Scenes_SuperMonkeyBall.js';

import { DroppedFileSceneDesc, traverseFileSystemDataTransfer } from './Scenes_FileDrops.js';

import { UI, Panel } from './ui.js';
import { serializeCamera, deserializeCamera, FPSCameraController } from './Camera.js';
import { assertExists, assert } from './util.js';
import { loadRustLib } from './rustlib.js';
import { DataFetcher } from './DataFetcher.js';
import { atob, btoa } from './Ascii85.js';
import { mat4 } from 'gl-matrix';
import { GlobalSaveManager, SaveStateLocation } from './SaveManager.js';
import { RenderStatistics } from './RenderStatistics.js';
import { Color } from './Color.js';
import { standardFullClearRenderPassDescriptor } from './gfx/helpers/RenderGraphHelpers.js';

import { SceneDesc, SceneGroup, SceneContext, Destroyable } from './SceneBase.js';
import { prepareFrameDebugOverlayCanvas2D } from './DebugJunk.js';
import { downloadBlob } from './DownloadUtils.js';
import { DataShare } from './DataShare.js';
import InputManager from './InputManager.js';
import { WebXRContext } from './WebXR.js';
import { debugJunk } from './DebugJunk.js';
import { IS_DEVELOPMENT } from './BuildVersion.js';

const sceneGroups: (string | SceneGroup)[] = [
    "GameCube",
    Scenes_SuperMonkeyBall.sceneGroup,
    "Experimental",
    Scenes_Test.sceneGroup,

];

function convertCanvasToPNG(canvas: HTMLCanvasElement): Promise<Blob> {
    return new Promise((resolve) => canvas.toBlob((b) => resolve(assertExists(b)), 'image/png'));
}

const enum SaveStatesAction {
    Load,
    LoadDefault,
    Save,
    Delete
};

class AnimationLoop implements ViewerUpdateInfo {
    public time: number = 0;
    public webXRContext: WebXRContext | null = null;

    public onupdate: ((updateInfo: ViewerUpdateInfo) => void);

    // https://hackmd.io/lvtOckAtSrmIpZAwgtXptw#Use-requestPostAnimationFrame-not-requestAnimationFrame
    // https://github.com/WICG/requestPostAnimationFrame
    // https://github.com/gpuweb/gpuweb/issues/596#issuecomment-596769356

    // XXX(jstpierre): Disabled for now. https://bugs.chromium.org/p/chromium/issues/detail?id=1065012
    public useRequestPostAnimationFrame = false;

    private _timeoutCallback = (): void => {
        this.onupdate(this);
    };

    // Call this from within your requestAnimationFrame handler.
    public requestPostAnimationFrame = (): void => {
        this.time = window.performance.now();
        if (this.useRequestPostAnimationFrame)
            setTimeout(this._timeoutCallback, 0);
        else
            this.onupdate(this);
    };
}

class SceneDatabase {
    private sceneDescToGroup = new Map<SceneDesc, SceneGroup>();
    private sceneDescToId = new Map<SceneDesc, string>();
    private idToSceneDesc = new Map<string, SceneDesc>();

    public onchanged: (() => void) | null = null;

    constructor(public sceneGroups: (SceneGroup | string)[]) {
        for (const sceneGroup of sceneGroups) {
            if (typeof sceneGroup !== "object")
                continue;

            for (const sceneDesc of sceneGroup.sceneDescs)
                if (typeof sceneDesc === "object")
                    this.addSceneDesc(sceneGroup, sceneDesc);

            if (sceneGroup.sceneIdMap !== undefined) {
                for (const [altSceneId, sceneId] of sceneGroup.sceneIdMap) {
                    const altSceneDescId = `${sceneGroup.id}/${altSceneId}`;
                    const sceneDescId = `${sceneGroup.id}/${sceneId}`;
                    const sceneDesc = assertExists(this.idToSceneDesc.get(sceneDescId));
                    this.idToSceneDesc.set(altSceneDescId, sceneDesc);
                }
            }
        }
    }

    private _makeSceneDescId(sceneGroup: SceneGroup, sceneDesc: SceneDesc): string {
        return `${sceneGroup.id}/${sceneDesc.id}`;
    }

    public getSceneDescId(sceneDesc: SceneDesc): string {
        return this.sceneDescToId.get(sceneDesc)!;
    }

    public getSceneDescGroup(sceneDesc: SceneDesc): SceneGroup {
        return this.sceneDescToGroup.get(sceneDesc)!;
    }

    public getSceneDescForId(sceneDescId: string): SceneDesc | null {
        return this.idToSceneDesc.get(sceneDescId) ?? null;
    }

    public addSceneDesc(sceneGroup: SceneGroup, sceneDesc: SceneDesc): void {
        assert(sceneGroup.sceneDescs.includes(sceneDesc));
        const id = this._makeSceneDescId(sceneGroup, sceneDesc);
        this.sceneDescToGroup.set(sceneDesc, sceneGroup);
        this.sceneDescToId.set(sceneDesc, id);
        this.idToSceneDesc.set(id, sceneDesc);

        if (this.onchanged !== null)
            this.onchanged();
    }
}

type TimeState = { isPlaying: boolean, sceneTimeScale: number, sceneTime: number };

class Main {
    public toplevel: HTMLElement;
    private canvasContainer: HTMLElement;
    public canvas: HTMLCanvasElement;
    private imguiContainer: HTMLElement;
    private imguiCanvas: HTMLCanvasElement;
    public viewer: Viewer;
    public ui: UI;
    public saveManager = GlobalSaveManager;

    private droppedFileGroup: SceneGroup;
    private sceneDatabase = new SceneDatabase(sceneGroups);

    private currentSceneDesc: SceneDesc | null = null;

    private loadingSceneDesc: SceneDesc | null = null;
    private destroyablePool: Destroyable[] = [];
    private dataShare = new DataShare();
    private dataFetcher: DataFetcher;
    private lastUpdatedURLTimeSeconds: number = -1;

    private postAnimFrameCanvas = new AnimationLoop();
    private postAnimFrameWebXR = new AnimationLoop();
    private webXRContext: WebXRContext;

    public sceneTimeScale = 1.0;
    private isPlaying = false;
    private isFrameStep = false;

    public isEmbedMode = false;
    private pixelSize = 1;

    // Link to debugJunk so we can reference it from the DevTools.
    private debugJunk = debugJunk;

    constructor() {
        this.init();
    }

    public async init() {
        this.isEmbedMode = window.location.pathname === '/embed.html';

        this.toplevel = document.createElement('div');
        this.toplevel.style.display = 'flex';
        this.toplevel.style.width = '100%';
        this.toplevel.style.height = '100vh';
        document.body.appendChild(this.toplevel);

        // Create container for main canvas
        this.canvasContainer = document.createElement('div');
        this.canvasContainer.style.flex = '1';
        this.canvasContainer.style.overflow = 'hidden';

        this.canvas = document.createElement('canvas');
        this.canvas.style.imageRendering = 'pixelated';
        this.canvas.style.outline = 'none';
        this.canvas.style.touchAction = 'none';

        this.canvasContainer.appendChild(this.canvas);
        this.toplevel.appendChild(this.canvasContainer);

        // Create container and canvas for ImGui
        this.imguiContainer = document.createElement('div');
        this.imguiContainer.style.width = '400px';
        this.imguiContainer.style.height = '100vh';
        this.imguiContainer.style.overflow = 'hidden';
        this.imguiContainer.style.backgroundColor = '#2d2d2d';
        this.imguiContainer.style.borderLeft = '1px solid #555';

        this.imguiCanvas = document.createElement('canvas');
        this.imguiCanvas.id = "imguiCanvas";
        this.imguiCanvas.style.width = '100%';
        this.imguiCanvas.style.height = '100%';
        this.imguiCanvas.style.outline = 'none';

        this.imguiContainer.appendChild(this.imguiCanvas);
        this.toplevel.appendChild(this.imguiContainer);
        window.onresize = this._onResize.bind(this);
        this._onResize();

        await ImGuiImplWeb.Init({
            canvas: this.imguiCanvas,
            backend: "webgl2",
            // Use relative path as expected by jsimgui
            loaderPath: "./jsimgui-webgl2-tt.js",
        });

        await loadRustLib();

        const errorCode = await initializeViewer(this, this.canvas);
        if (errorCode !== InitErrorCode.SUCCESS) {
            this.toplevel.appendChild(makeErrorUI(errorCode));
            return;
        }

        this.webXRContext = new WebXRContext(this.viewer.gfxSwapChain);
        this.webXRContext.onframe = this.postAnimFrameWebXR.requestPostAnimationFrame;

        this.postAnimFrameCanvas.onupdate = this._onPostAnimFrameUpdate;

        // requestPostAnimationFrame breaks WebXR.
        this.postAnimFrameWebXR.webXRContext = this.webXRContext;
        this.postAnimFrameWebXR.useRequestPostAnimationFrame = false;
        this.postAnimFrameWebXR.onupdate = this._onPostAnimFrameUpdate;

        this.toplevel.ondragover = (e) => {
            if (!e.dataTransfer || !e.dataTransfer.types.includes('Files'))
                return;
            this.ui.dragHighlight.style.display = 'block';
            e.preventDefault();
        };
        this.toplevel.ondragleave = (e) => {
            this.ui.dragHighlight.style.display = 'none';
            e.preventDefault();
        };
        this.toplevel.ondrop = this._onDrop.bind(this);

        this.viewer.onstatistics = (statistics: RenderStatistics): void => {
            this.ui.statisticsPanel.addRenderStatistics(statistics);
        };
        this.viewer.oncamerachanged = (force: boolean) => {
            this._autoSaveState(force);
        };
        this.viewer.inputManager.ondraggingmodechanged = () => {
            this.ui.setDraggingMode(this.viewer.inputManager.getDraggingMode());
        };

        this._makeUI();

        this.dataFetcher = new DataFetcher(this.ui.sceneSelect);
        await this.dataFetcher.init();

        this.droppedFileGroup = { id: "drops", name: "Dropped Files", sceneDescs: [] };
        sceneGroups.push('Other');
        sceneGroups.push(this.droppedFileGroup);

        this.ui.sceneSelect.setSceneDatabase(this.sceneDatabase);

        window.onhashchange = this._onHashChange.bind(this);

        if (this.currentSceneDesc === null)
            this._loadInitialStateFromHash();

        // if (this.currentSceneDesc === null) {
        //     // Make the user choose a scene if there's nothing loaded by default...
        //     this.ui.sceneSelect.setExpanded(true);
        // }

        this._onRequestAnimationFrameCanvas();
    }

    private setIsPlaying(v: boolean): void {
        if (this.isPlaying === v)
            return;

        this.isPlaying = v;
        // this.ui.playPauseButton.setIsPlaying(v);

        if (IS_DEVELOPMENT)
            this._saveCurrentTimeState(this._getCurrentSceneDescId()!);
    }

    private _decodeHashString(hashString: string): [string, string] {
        let sceneDescId: string = '', sceneSaveState: string = '';
        const firstSemicolon = hashString.indexOf(';');
        if (firstSemicolon >= 0) {
            sceneDescId = hashString.slice(0, firstSemicolon);
            sceneSaveState = hashString.slice(firstSemicolon + 1);
        } else {
            sceneDescId = hashString;
        }

        return [sceneDescId, sceneSaveState];
    }

    private _decodeHash(): [string, string] {
        const hash = window.location.hash;
        if (hash.startsWith('#')) {
            return this._decodeHashString(decodeURIComponent(hash.slice(1)));
        } else {
            return ['', ''];
        }
    }

    private _onHashChange(): void {
        const [sceneDescId, sceneSaveState] = this._decodeHash();
        const sceneDesc = this.sceneDatabase.getSceneDescForId(sceneDescId);
        if (sceneDesc !== null)
            this._loadSceneDesc(sceneDesc, sceneSaveState);
    }

    private _loadInitialStateFromHash(): void {
        const [sceneDescId, sceneSaveState] = this._decodeHash();
        const sceneDesc = this.sceneDatabase.getSceneDescForId(sceneDescId);
        if (sceneDesc !== null) {
            // Load save slot 0 from session storage.
            const key = this.saveManager.getSaveStateSlotKey(sceneDescId, 0);
            const sceneState = this.saveManager.loadState(key) ?? sceneSaveState;
            this._loadSceneDesc(sceneDesc, sceneState);
        }
    }

    private _exportSaveData() {
        const saveData = this.saveManager.export();
        const date = new Date();
        downloadBlob(`noclip_export_${date.toISOString()}.nclsp`, new Blob([saveData]));
    }

    private _pickSaveStatesAction(inputManager: InputManager): SaveStatesAction {
        if (inputManager.isKeyDown('ShiftLeft'))
            return SaveStatesAction.Save;
        else if (inputManager.isKeyDown('AltLeft'))
            return SaveStatesAction.Delete;
        else
            return SaveStatesAction.Load;
    }

    private _checkKeyShortcuts() {
        const inputManager = this.viewer.inputManager;
        if (inputManager.isKeyDownEventTriggered('KeyZ'))
            this._toggleUI();
        if (inputManager.isKeyDownEventTriggered('KeyT'))
            this.ui.sceneSelect.expandAndFocus();
        for (let i = 1; i <= 9; i++) {
            if (inputManager.isKeyDownEventTriggered('Digit'+i)) {
                if (this.currentSceneDesc) {
                    const key = this._getSaveStateSlotKey(i);
                    const action = this._pickSaveStatesAction(inputManager);
                    this.doSaveStatesAction(action, key);
                }
            }
        }

        if (inputManager.isKeyDownEventTriggered('Numpad3'))
            this._exportSaveData();
        if (inputManager.isKeyDownEventTriggered('Period'))
            this.setIsPlaying(!this.isPlaying);
        if (inputManager.isKeyDown('Comma')) {
            this.setIsPlaying(false);
            this.isFrameStep = true;
        }
        if (inputManager.isKeyDownEventTriggered('F9'))
            this._loadSceneDesc(this.currentSceneDesc!, this._getSceneSaveState(), true);
    }

    private async _onWebXRStateRequested(state: boolean) {
        if (!this.webXRContext)
            return;

        if (state) {
            try {
                await this.webXRContext.start();
                if (!this.webXRContext.xrSession) {
                    return;
                }
                mat4.getTranslation(this.viewer.xrCameraController.offset, this.viewer.camera.worldMatrix);
                this.webXRContext.xrSession.addEventListener('end', () => {
                    this.ui.toggleWebXRCheckbox(false);
                });
            } catch(e) {
                console.error("Failed to start XR");
                this.ui.toggleWebXRCheckbox(false);
            }
        } else {
            this.webXRContext.end();
        }
    }

    private _onPostAnimFrameUpdate = (updateInfo: ViewerUpdateInfo): void => {
        this._checkKeyShortcuts();

        prepareFrameDebugOverlayCanvas2D();

        // Needs to be called before this.viewer.update()
        const shouldTakeScreenshot = this.viewer.inputManager.isKeyDownEventTriggered('Numpad7') || this.viewer.inputManager.isKeyDownEventTriggered('BracketRight');

        let sceneTimeScale = this.sceneTimeScale;
        if (this.isFrameStep) {
            sceneTimeScale /= 4.0;
            this.isFrameStep = false;
        } else if (!this.isPlaying) {
            sceneTimeScale = 0.0;
        }

        if (!this.viewer.externalControl) {
            this.viewer.sceneTimeScale = sceneTimeScale;
            this.viewer.update(updateInfo);
        }

        if (shouldTakeScreenshot)
            this._takeScreenshot();

        this.ui.update();
    };

    private _onRequestAnimationFrameCanvas = (): void => {
        if (this.webXRContext.xrSession !== null) {
            // Currently presenting to XR. Skip the canvas render.
        } else {
            this.postAnimFrameCanvas.requestPostAnimationFrame();
        }

        window.requestAnimationFrame(this._onRequestAnimationFrameCanvas);
    };

    private async _onDrop(e: DragEvent) {
        this.ui.dragHighlight.style.display = 'none';

        if (!e.dataTransfer || e.dataTransfer.files.length === 0)
            return;

        e.preventDefault();
        const transfer = e.dataTransfer;
        const files = await traverseFileSystemDataTransfer(transfer);
        const sceneDesc = new DroppedFileSceneDesc(files);
        this.droppedFileGroup.sceneDescs.push(sceneDesc);
        this.sceneDatabase.addSceneDesc(this.droppedFileGroup, sceneDesc);
        this._loadSceneDesc(sceneDesc);
    }

    private _onResize() {
        const mainCanvasWidth = window.innerWidth - 400; // Subtract ImGui panel width
        resizeCanvas(this.canvas, mainCanvasWidth, window.innerHeight, window.devicePixelRatio / this.pixelSize);

        // Resize ImGui canvas
        this.imguiCanvas.width = 400 * window.devicePixelRatio;
        this.imguiCanvas.height = window.innerHeight * window.devicePixelRatio;
        this.imguiCanvas.style.width = '400px';
        this.imguiCanvas.style.height = `${window.innerHeight}px`;
    }

    private _saveStateTmp = new Uint8Array(512);
    private _saveStateView = new DataView(this._saveStateTmp.buffer);
    // TODO(jstpierre): Save this in main instead of having this called 8 bajillion times...
    private _getSceneSaveState() {
        let byteOffs = 0;

        const optionsBits = 0;
        this._saveStateView.setUint8(byteOffs, optionsBits);
        byteOffs++;

        byteOffs += serializeCamera(this._saveStateView, byteOffs, this.viewer.camera);

        // TODO(jstpierre): Pass DataView into serializeSaveState
        if (this.viewer.scene !== null && this.viewer.scene.serializeSaveState)
            byteOffs = this.viewer.scene.serializeSaveState(this._saveStateTmp.buffer as ArrayBuffer, byteOffs);

        const s = btoa(this._saveStateTmp, byteOffs);
        return `ShareData=${s}`;
    }

    private _loadSceneSaveStateVersion2(state: string): boolean {
        const byteLength = atob(this._saveStateTmp, 0, state);

        let byteOffs = 0;
        this.viewer.sceneTime = this._saveStateView.getFloat32(byteOffs + 0x00, true);
        byteOffs += 0x04;
        byteOffs += deserializeCamera(this.viewer.camera, this._saveStateView, byteOffs);
        if (this.viewer.scene !== null && this.viewer.scene.deserializeSaveState)
            byteOffs = this.viewer.scene.deserializeSaveState(this._saveStateTmp.buffer as ArrayBuffer, byteOffs, byteLength);

        if (this.viewer.cameraController !== null)
            this.viewer.cameraController.cameraUpdateForced();

        return true;
    }

    private _loadSceneSaveStateVersion3(state: string): boolean {
        const byteLength = atob(this._saveStateTmp, 0, state);

        let byteOffs = 0;
        const optionsBits = this._saveStateView.getUint8(byteOffs + 0x00);
        assert(optionsBits === 0);
        byteOffs++;

        byteOffs += deserializeCamera(this.viewer.camera, this._saveStateView, byteOffs);
        if (this.viewer.scene !== null && this.viewer.scene.deserializeSaveState)
            byteOffs = this.viewer.scene.deserializeSaveState(this._saveStateTmp.buffer as ArrayBuffer, byteOffs, byteLength);

        if (this.viewer.cameraController !== null)
            this.viewer.cameraController.cameraUpdateForced();

        return true;
    }

    private _tryLoadSceneSaveState(state: string): boolean {
        // Version 2 starts with ZNCA8, which is Ascii85 for 'NC\0\0'
        if (state.startsWith('ZNCA8') && state.endsWith('='))
            return this._loadSceneSaveStateVersion2(state.slice(5, -1));

        // Version 3 starts with 'A' and has no '=' at the end.
        if (state.startsWith('A'))
            return this._loadSceneSaveStateVersion3(state.slice(1));

        if (state.startsWith('ShareData='))
            return this._loadSceneSaveStateVersion3(state.slice(10));

        return false;
    }

    private _loadSceneSaveState(state: string | null): boolean {
        if (state === '' || state === null)
            return false;

        if (this._tryLoadSceneSaveState(state)) {
            // Force an update of the URL whenever we successfully load state...
            this._saveStateAndUpdateURL();
            return true;
        } else {
            return false;
        }
    }

    private _getCurrentSceneDescId() {
        if (this.currentSceneDesc === null)
            return null;

        return this.sceneDatabase.getSceneDescId(this.currentSceneDesc);
    }

    private _applyTimeState(timeState: TimeState): void {
        this.setIsPlaying(timeState.isPlaying);
        this.sceneTimeScale = timeState.sceneTimeScale;
        this.viewer.sceneTime = timeState.sceneTime;
    }

    private _loadTimeState(sceneDescId: string): TimeState | null {
        const timeStateKey = `TimeState/${sceneDescId}`;
        const timeStateStr = this.saveManager.loadStateFromLocation(timeStateKey, SaveStateLocation.SessionStorage);
        if (!timeStateStr)
            return null;

        const timeState = JSON.parse(timeStateStr) as TimeState;
        return timeState;
    }

    private _saveCurrentTimeState(sceneDescId: string): void {
        const timeState: TimeState = { isPlaying: this.isPlaying, sceneTimeScale: this.sceneTimeScale, sceneTime: this.viewer.sceneTime };
        const timeStateStr = JSON.stringify(timeState);
        const timeStateKey = `TimeState/${sceneDescId}`;
        this.saveManager.saveTemporaryState(timeStateKey, timeStateStr);
    }

    private _autoSaveState(forceUpdateURL: boolean = false) {
        if (this.currentSceneDesc === null)
            return;

        const sceneStateStr = this._getSceneSaveState();
        const currentSceneDescId = this._getCurrentSceneDescId()!;
        const key = this.saveManager.getSaveStateSlotKey(currentSceneDescId, 0);
        this.saveManager.saveTemporaryState(key, sceneStateStr);

        if (IS_DEVELOPMENT)
            this._saveCurrentTimeState(currentSceneDescId);

        const saveState = `${currentSceneDescId};${sceneStateStr}`;
        // this.ui.setShareSaveState(saveState);

        let shouldUpdateURL = forceUpdateURL;
        if (!shouldUpdateURL) {
            const timeSeconds = window.performance.now() / 1000;
            const secondsElapsedSinceLastUpdatedURL = timeSeconds - this.lastUpdatedURLTimeSeconds;

            if (secondsElapsedSinceLastUpdatedURL >= 2)
                shouldUpdateURL = true;
        }

        if (shouldUpdateURL) {
            window.history.replaceState('', document.title, `#${saveState}`);

            const timeSeconds = window.performance.now() / 1000;
            this.lastUpdatedURLTimeSeconds = timeSeconds;
        }
    }

    private _saveStateAndUpdateURL(): void {
        this._autoSaveState(true);
    }

    private _getSaveStateSlotKey(slotIndex: number): string {
        return this.saveManager.getSaveStateSlotKey(assertExists(this._getCurrentSceneDescId()), slotIndex);
    }

    private _onSceneChanged(scene: SceneGfx, sceneStateStr: string | null, timeState: TimeState | null): void {
        scene.onstatechanged = () => {
            this._saveStateAndUpdateURL();
        };

        let scenePanels: Panel[] = [];
        if (scene.createPanels)
            scenePanels = scene.createPanels();
        this.ui.setScenePanels(scenePanels);

        // Force time to play when loading a map.
        this.setIsPlaying(true);

        const sceneDescId = this._getCurrentSceneDescId()!;
        this.saveManager.setCurrentSceneDescId(sceneDescId);

        if (scene.createCameraController !== undefined)
            this.viewer.setCameraController(scene.createCameraController());
        if (this.viewer.cameraController === null)
            this.viewer.setCameraController(new FPSCameraController());

        if (timeState !== null)
            this._applyTimeState(timeState);

        if (!this._loadSceneSaveState(sceneStateStr)) {
            const camera = this.viewer.camera;

            const key = this.saveManager.getSaveStateSlotKey(sceneDescId, 1);
            const didLoadCameraState = this._loadSceneSaveState(this.saveManager.loadState(key));

            if (!didLoadCameraState) {
                if (scene.getDefaultWorldMatrix !== undefined)
                    scene.getDefaultWorldMatrix(camera.worldMatrix);
                else
                    mat4.identity(camera.worldMatrix);
            }

            mat4.getTranslation(this.viewer.xrCameraController.offset, camera.worldMatrix);
        }

        this._saveStateAndUpdateURL();
        this.ui.sceneChanged();
    }

    private _onSceneDescSelected(sceneDesc: SceneDesc) {
        this._loadSceneDesc(sceneDesc);
    }

    private doSaveStatesAction(action: SaveStatesAction, key: string): void {
        if (action === SaveStatesAction.Save) {
            this.saveManager.saveState(key, this._getSceneSaveState());
        } else if (action === SaveStatesAction.Delete) {
            this.saveManager.deleteState(key);
        } else if (action === SaveStatesAction.Load) {
            const state = this.saveManager.loadState(key);
            this._loadSceneSaveState(state);
        } else if (action === SaveStatesAction.LoadDefault) {
            const state = this.saveManager.loadStateFromLocation(key, SaveStateLocation.Defaults);
            this._loadSceneSaveState(state);
        }
    }

    // How many previous scenes of data share contents to keep? Set it to 0 for leak checking.
    private get loadSceneDelta(): number {
        return this.saveManager.loadSetting("LoadSceneDelta", 1);
    }

    private set loadSceneDelta(v: number) {
        this.saveManager.saveSetting("LoadSceneDelta", v);
    }

    private _loadSceneDesc(sceneDesc: SceneDesc, sceneStateStr: string | null = null, force: boolean = false): void {
        if (this.currentSceneDesc === sceneDesc && !force) {
            this._loadSceneSaveState(sceneStateStr);
            return;
        }

        const device = this.viewer.gfxDevice;

        // Tear down old scene.
        if (this.dataFetcher !== null)
            this.dataFetcher.abort();
        this.ui.destroyScene();
        if (this.viewer.scene && !this.destroyablePool.includes(this.viewer.scene))
            this.destroyablePool.push(this.viewer.scene);
        this.viewer.setScene(null);
        for (let i = 0; i < this.destroyablePool.length; i++)
            this.destroyablePool[i].destroy(device);
        this.destroyablePool.length = 0;

        const sceneGroup = this.sceneDatabase.getSceneDescGroup(sceneDesc);

        // Unhide any hidden scene groups upon being loaded.
        if (sceneGroup.hidden)
            sceneGroup.hidden = false;

        this.currentSceneDesc = sceneDesc;
        this.ui.sceneSelect.setCurrentDesc(sceneGroup, this.currentSceneDesc);

        this.ui.sceneSelect.setProgress(0);

        const dataShare = this.dataShare;
        const dataFetcher = this.dataFetcher;
        dataFetcher.reset();
        const uiContainer: HTMLElement = document.createElement('div');
        this.ui.sceneUIContainer.appendChild(uiContainer);
        const destroyablePool: Destroyable[] = this.destroyablePool;
        const inputManager = this.viewer.inputManager;
        inputManager.reset();
        const viewerInput = this.viewer.viewerRenderInput;

        const timeState = IS_DEVELOPMENT ? this._loadTimeState(this.sceneDatabase.getSceneDescId(sceneDesc)) : null;
        const initialSceneTime = timeState !== null ? timeState.sceneTime : 0;

        const context: SceneContext = {
            device, dataFetcher, dataShare, uiContainer, destroyablePool, inputManager, viewerInput, initialSceneTime,
        };

        // We save loadSceneDelta's worth of old objects -- the idea being that if you're navigating between similar
        // scenes, we want to keep stuff in the data share (e.g. going between two Mario Kart tracks, you want to
        // keep the models for the same objects so we don't need to redownload them). Any objects that haven't been
        // touched since then will get eliminated eventually.
        this.dataShare.pruneOldObjects(device, this.loadSceneDelta);

        if (this.loadSceneDelta === 0)
            this.viewer.gfxDevice.checkForLeaks();

        this.dataShare.loadNewScene();
        window.dispatchEvent(new Event('loadNewScene'));

        this.loadingSceneDesc = sceneDesc;
        const promise = sceneDesc.createScene(device, context);

        if (promise === null) {
            console.error(`Cannot load ${sceneDesc.id}. Probably an unsupported file extension.`);
            throw "whoops";
        }

        promise.then((scene: SceneGfx) => {
            if (this.loadingSceneDesc === sceneDesc) {
                dataFetcher.setProgress();
                this.loadingSceneDesc = null;
                this.viewer.setScene(scene);
                this._onSceneChanged(scene, sceneStateStr, timeState);
            }
        });

        // Set window title.
        document.title = `${sceneDesc.name} - ${sceneGroup.name} - GX Studio`;
    }

    private _makeUI() {
        this.ui = new UI(this.viewer);
        this.ui.setEmbedMode(this.isEmbedMode);
        this.toplevel.appendChild(this.ui.elem);
        this.ui.sceneSelect.onscenedescselected = this._onSceneDescSelected.bind(this);
        this.ui.xrSettings.onWebXRStateRequested = this._onWebXRStateRequested.bind(this);
        // this.ui.playPauseButton.onplaypause = this.setIsPlaying.bind(this);

        this.webXRContext.onsupportedchanged = () => {
            this._syncWebXRSettingsVisible();
        };
        this._syncWebXRSettingsVisible();
    }

    private _syncWebXRSettingsVisible(): void {
        this.ui.xrSettings.setVisible(this.webXRContext.isSupported);
    }

    private _toggleUI(visible?: boolean) {
        this.ui.toggleUI(visible);
    }

    private _getSceneDownloadPrefix() {
        const sceneGroup = this.sceneDatabase.getSceneDescGroup(this.currentSceneDesc!);
        const sceneId = this.currentSceneDesc!.id;
        const date = new Date();
        return `${sceneGroup.id}_${sceneId}_${date.toISOString()}`;
    }

    private _takeScreenshot(opaque: boolean = true) {
        const canvas = this.viewer.takeScreenshotToCanvas(opaque);
        const filename = `${this._getSceneDownloadPrefix()}.png`;
        convertCanvasToPNG(canvas).then((blob) => downloadBlob(filename, blob));
    }

    // Hooks for people who want to mess with stuff.
    public getStandardClearColor(): Color {
        return standardFullClearRenderPassDescriptor.clearColor as Color;
    }

    public get scene() {
        return this.viewer.scene;
    }
}

// Declare a "main" object for easy access.
declare global {
    interface Window {
        main: Main;
    }
}

window.main = new Main();

// Debug utilities.
declare global {
    interface Window {
        debug: any;
        debugObj: any;
        gl: any;
    }
}
