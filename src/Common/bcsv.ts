// BCSV - Binary CSV format used by Nintendo games
// Shared across SuperMarioGalaxy and OcarinaOfTime3D

import ArrayBufferSlice from "../ArrayBufferSlice.js";
import { readString } from "../util.js";

export interface BcsvField {
    nameHash: number;
    bitmask: number;
    offset: number;
    shift: number;
    type: number;
}

export type BcsvRecord = (string | number)[];

export interface Bcsv {
    fields: BcsvField[];
    records: BcsvRecord[];
}

export function getFieldIndexFromHash(bcsv: Bcsv, hash: number): number {
    for (let i = 0; i < bcsv.fields.length; i++) {
        if (bcsv.fields[i].nameHash === hash)
            return i;
    }
    return -1;
}

export function parse(buffer: ArrayBufferSlice, littleEndian: boolean = false): Bcsv {
    const view = buffer.createDataView();
    const numEntries = view.getUint32(0x00, littleEndian);
    const numFields = view.getUint32(0x04, littleEndian);
    const dataOffs = view.getUint32(0x08, littleEndian);
    const entrySize = view.getUint32(0x0C, littleEndian);

    const fields: BcsvField[] = [];
    let fieldsTableIdx = 0x10;
    for (let i = 0; i < numFields; i++) {
        const nameHash = view.getUint32(fieldsTableIdx + 0x00, littleEndian);
        const bitmask = view.getUint32(fieldsTableIdx + 0x04, littleEndian);
        const offset = view.getUint16(fieldsTableIdx + 0x08, littleEndian);
        const shift = view.getUint8(fieldsTableIdx + 0x0A);
        const type = view.getUint8(fieldsTableIdx + 0x0B);
        fields.push({ nameHash, bitmask, offset, shift, type });
        fieldsTableIdx += 0x0C;
    }

    const records: BcsvRecord[] = [];
    let recordsTableIdx = dataOffs;
    for (let i = 0; i < numEntries; i++) {
        const record: BcsvRecord = [];
        for (let j = 0; j < numFields; j++) {
            const field = fields[j];
            let value: string | number;
            
            if (field.type === 0) {
                // Integer
                const rawValue = view.getUint32(recordsTableIdx + field.offset, littleEndian);
                value = (rawValue & field.bitmask) >>> field.shift;
            } else if (field.type === 1) {
                // Float
                value = view.getFloat32(recordsTableIdx + field.offset, littleEndian);
            } else if (field.type === 2) {
                // String
                const stringOffset = view.getUint32(recordsTableIdx + field.offset, littleEndian);
                const stringOffs = dataOffs + numEntries * entrySize + stringOffset;
                value = readString(buffer, stringOffs);
            } else {
                throw new Error(`Unknown BCSV field type: ${field.type}`);
            }
            
            record.push(value);
        }
        records.push(record);
        recordsTableIdx += entrySize;
    }

    return { fields, records };
}
