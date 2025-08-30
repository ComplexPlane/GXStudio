import ArrayBufferSlice from "./ArrayBufferSlice.js";
import { SceneDesc } from "./SceneBase.js";
import { SceneGfx } from "./viewer.js";

import * as Yaz0 from './Common/Compression/Yaz0.js';
import * as CX from './Common/Compression/CX.js';

import * as SuperMonkeyBall from './SuperMonkeyBall/Scenes_SuperMonkeyBall.js';
import { SceneContext } from "./SceneBase.js";
import { DataFetcher, NamedArrayBufferSlice } from "./DataFetcher.js";

async function loadArbitraryFile(context: SceneContext, buffer: NamedArrayBufferSlice): Promise<SceneGfx> {
    if (buffer.name.endsWith('.szs') || buffer.name.endsWith('.carc')) {
        const decompressed = await Yaz0.decompress(buffer);
        buffer = Object.assign(decompressed, { name: buffer.name });
    }

    if (buffer.name.endsWith('.arc') || buffer.name.endsWith('.carc') || buffer.name.endsWith('.szs')) {
        // Try to extract any files and recursively parse them
        try {
            // For now, just try SuperMonkeyBall directly
            const superMonkeyBallRenderer = SuperMonkeyBall.createSceneFromNamedBuffers(context, [buffer]);
            if (superMonkeyBallRenderer !== null) {
                return superMonkeyBallRenderer;
            }
        } catch (e) {
            // Ignore parsing errors and continue
        }
    }

    throw new Error("Unsupported file format - only Super Monkey Ball files are supported");
}

export async function createSceneFromFiles(context: SceneContext, buffers: NamedArrayBufferSlice[]): Promise<SceneGfx> {
    buffers.sort((a, b) => a.name.localeCompare(b.name));

    // Try archive files first
    for (const buffer of buffers) {
        if (buffer.name.endsWith('.arc') || buffer.name.endsWith('.carc') || buffer.name.endsWith('.szs')) {
            try {
                return await loadArbitraryFile(context, buffer);
            } catch (e) {
                // Continue trying other files
            }
        }
    }

    // Try Super Monkey Ball directly
    const superMonkeyBallRenderer = SuperMonkeyBall.createSceneFromNamedBuffers(context, buffers);
    if (superMonkeyBallRenderer !== null) {
        return superMonkeyBallRenderer;
    } 

    throw new Error("Only Super Monkey Ball files are supported");
}

export class DroppedFileSceneDesc implements SceneDesc {
    public id: string;
    public name: string;

    constructor(public files: File[]) {
        // Pick some file as the ID.
        const file = files[0];
        this.id = file.name;
        this.name = `Dropped Files: ${files.map((f) => f.name).join(', ')}`;
    }

    public async createScene(device: any, context: SceneContext): Promise<SceneGfx> {
        const dataFetcher = context.dataFetcher;

        const buffers: NamedArrayBufferSlice[] = [];
        for (let i = 0; i < this.files.length; i++) {
            const file = this.files[i];
            const buffer: ArrayBuffer = await file.arrayBuffer();
            const slice = new ArrayBufferSlice(buffer);
            buffers.push(Object.assign(slice, { name: file.name }));
        }

        return createSceneFromFiles(context, buffers);
    }
}

export async function traverseFileSystemDataTransfer(dataTransfer: DataTransfer): Promise<File[]> {
    const files: File[] = [];

    if (dataTransfer.items) {
        for (let i = 0; i < dataTransfer.items.length; i++) {
            const item = dataTransfer.items[i];
            if (item.kind === 'file') {
                const file = item.getAsFile();
                if (file !== null)
                    files.push(file);
            }
        }
    } else {
        for (let i = 0; i < dataTransfer.files.length; i++)
            files.push(dataTransfer.files[i]);
    }

    return files;
}
