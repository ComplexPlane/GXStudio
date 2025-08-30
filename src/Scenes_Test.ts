
import * as Viewer from "./viewer.js";
import { GfxDevice } from "./gfx/platform/GfxPlatform.js";
import { SceneContext } from "./SceneBase.js";

// Removed RRES import since rres was deleted

import { makeBackbufferDescSimple, standardFullClearRenderPassDescriptor } from "./gfx/helpers/RenderGraphHelpers.js";
import { GfxRenderHelper } from "./gfx/render/GfxRenderHelper.js";
import { GfxrAttachmentSlot } from "./gfx/render/GfxRenderGraph.js";

const id = 'test';
const name = "Test Scenes";

export class EmptyScene implements Viewer.SceneGfx {
    public render(device: GfxDevice, viewerInput: Viewer.ViewerRenderInput) {
    }

    public destroy(device: GfxDevice): void {
    }
}

class EmptyClearScene implements Viewer.SceneGfx {
    private renderHelper: GfxRenderHelper;

    constructor(device: GfxDevice) {
        this.renderHelper = new GfxRenderHelper(device);
    }

    public render(device: GfxDevice, viewerInput: Viewer.ViewerRenderInput) {
        const desc = makeBackbufferDescSimple(GfxrAttachmentSlot.Color0, viewerInput, standardFullClearRenderPassDescriptor);

        const builder = this.renderHelper.renderGraph.newGraphBuilder();
        const mainColorID = builder.createRenderTargetID(desc, "Main Color");

        builder.pushPass((pass) => {
            pass.attachRenderTargetID(GfxrAttachmentSlot.Color0, mainColorID);
        });

        builder.resolveRenderTargetToExternalTexture(mainColorID, viewerInput.onscreenTexture);

        this.renderHelper.renderGraph.execute(builder);
    }

    public destroy(device: GfxDevice): void {
        this.renderHelper.destroy();
    }
}

class EmptyClearSceneDesc implements Viewer.SceneDesc {
    constructor(public id: string, public name = id) {}

    public async createScene(device: GfxDevice, context: SceneContext): Promise<Viewer.SceneGfx> {
        return new EmptyClearScene(device);
    }
}

const sceneDescs = [
    new EmptyClearSceneDesc('EmptyClearScene'),
];

export const sceneGroup: Viewer.SceneGroup = {
    id, name, sceneDescs, hidden: true,
};
