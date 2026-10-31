/**
 * The pure half of the battery-type lookup (batteryLibrary.ts): matching a device model
 * against the library, reading models from device objects, the battery gate. No socket,
 * no store — the adapter runs the same code for the Statusübersicht discovery (#882)
 * through lib/shared/auraShared.js.
 */
import type { ioBrokerObject } from '../types';

export interface BatteryLibEntry {
    manufacturer: string;
    model: string;
    modelId?: string;
    matchMethod?: 'startswith' | 'endswith' | 'contains';
    batteryType: string;
    quantity?: number; // default 1
}

/** Extracted, normalized model info for one device/channel object. */
export interface DeviceModel {
    id: string;
    name: string;
    kind: 'device' | 'channel';
    manufacturer?: string;
    model?: string;
    modelId?: string;
}

export interface BatteryLibIndex {
    entries: BatteryLibEntry[];
    byMfrModel: Map<string, BatteryLibEntry>; // exact, keyed by mfrModelKey()
    byModelId: Map<string, BatteryLibEntry>;
    fuzzy: BatteryLibEntry[]; // entries carrying matchMethod
    snapshotDate: string;
    sourceVersion: number;
}

export type BatteryTypeOverride = { type: string; quantity?: number };

export interface BatteryResolution {
    deviceId: string;
    type: string | null;
    quantity: number;
    source: 'manual' | 'auto' | null;
}

/** Common battery types offered in the manual-assignment dropdown. */
export const BATTERY_TYPES = [
    'Akku', // built-in rechargeable (e.g. eufy cameras) — specific cell unknown/irrelevant
    'AA',
    'AAA',
    'AAAA',
    'C',
    'D',
    '9V',
    'CR2032',
    'CR2430',
    'CR2450',
    'CR2477',
    'CR2',
    'CR123A',
    'CR1632',
    'CR1620',
    'CR1220',
    'LR44',
    'A23',
    'A27',
    '18650',
] as const;

export const norm = (s?: string): string => (s ?? '').trim().toLowerCase();

/**
 * Adapters whose battery devices carry a built-in rechargeable pack — the specific cell
 * is unknown/irrelevant, so they auto-resolve to a generic type. Extend as needed.
 */
const ADAPTER_BATTERY_DEFAULTS: Record<string, { type: string; quantity?: number }> = {
    eusec: { type: 'Akku' }, // eufy security cameras / doorbells
    worx: { type: 'Akku' }, // Worx Landroid robotic mowers
};

function fuzzyMatch(entryModel: string, deviceModel: string, method: BatteryLibEntry['matchMethod']): boolean {
    if (!entryModel || !deviceModel) return false;
    if (method === 'startswith') return deviceModel.startsWith(entryModel);
    if (method === 'endswith') return deviceModel.endsWith(entryModel);
    if (method === 'contains') return deviceModel.includes(entryModel);
    return false;
}

/** Key of byMfrModel: normalised manufacturer and model. */
const mfrModelKey = (mfr: string, model: string): string => `${mfr}|${model}`;

/** Auto-match a device's model against the library. Returns null when nothing matches. */
export function matchBatteryType(
    dm: DeviceModel,
    idx: BatteryLibIndex,
): { batteryType: string; quantity: number } | null {
    const mfr = norm(dm.manufacturer);
    const model = norm(dm.model);
    const modelId = norm(dm.modelId);

    let hit: BatteryLibEntry | undefined;
    if (mfr && model) hit = idx.byMfrModel.get(mfrModelKey(mfr, model));
    if (!hit && modelId) hit = idx.byModelId.get(modelId);
    if (!hit && mfr && model)
        hit = idx.fuzzy.find((e) => norm(e.manufacturer) === mfr && fuzzyMatch(norm(e.model), model, e.matchMethod));
    if (!hit) return null;
    return { batteryType: hit.batteryType, quantity: hit.quantity ?? 1 };
}

export function resolveName(name: string | Record<string, string> | undefined, fallback: string): string {
    if (!name) return fallback;
    if (typeof name === 'string') return name;
    return name.de ?? name.en ?? Object.values(name)[0] ?? fallback;
}

function str(v: unknown): string | undefined {
    return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/** Read manufacturer/model/modelId from a device object's `native`, per adapter. */
export function extractDeviceModel(obj: ioBrokerObject, adapter: string): Omit<DeviceModel, 'id' | 'name' | 'kind'> {
    const native = ((obj as { native?: Record<string, unknown> }).native ?? {}) as Record<string, unknown>;
    const commonName = resolveName(obj.common?.name, '');

    if (adapter === 'zigbee' || adapter === 'zigbee2mqtt' || adapter === 'deconz' || adapter === 'zigbee-herdsman') {
        return {
            manufacturer: str(native.manufacturerName) ?? str(native.manufacturer) ?? str(native.vendor),
            model: str(native.modelId) ?? str(native.model) ?? (commonName || undefined),
            modelId: str(native.modelId),
        };
    }
    if (adapter === 'hm-rpc' || adapter === 'hmip' || adapter === 'homematic') {
        // Device objects carry the model in native.TYPE; channel objects carry the channel
        // type in native.TYPE but the DEVICE model in native.PARENT_TYPE.
        const type = str(native.PARENT_TYPE) ?? str(native.TYPE) ?? str(native.type);
        return { manufacturer: 'eQ-3', model: type, modelId: type };
    }
    if (adapter === 'eusec') {
        // eufy security: device `native` is empty; the model is encoded in the serial
        // (last id segment, e.g. "T8123…"). Manufacturer is fixed; type comes from the
        // adapter default below (built-in rechargeable).
        const serial = obj._id.split('.').pop();
        return { manufacturer: 'eufy', model: undefined, modelId: serial };
    }
    // generic
    return {
        manufacturer: str(native.manufacturer) ?? str(native.vendor) ?? str(native.manufacturerName),
        model: str(native.model) ?? str(native.modelId) ?? str(native.productName) ?? (commonName || undefined),
        modelId: str(native.modelId) ?? str(native.productId),
    };
}

type ObjectRow = { id: string; value: ioBrokerObject };

/** id → DeviceModel from the device and channel object rows (with `native`). */
export function buildDeviceModelIndex(
    devices: readonly ObjectRow[],
    channels: readonly ObjectRow[],
): Map<string, DeviceModel> {
    const map = new Map<string, DeviceModel>();
    const add = (rows: readonly ObjectRow[], kind: 'device' | 'channel') => {
        for (const row of rows) {
            const obj = row?.value;
            if (!obj) continue;
            const adapter = row.id.split('.')[0] ?? '';
            const model = extractDeviceModel(obj, adapter);
            map.set(row.id, {
                id: row.id,
                name: resolveName(obj.common?.name, row.id.split('.').pop() ?? row.id),
                kind,
                ...model,
            });
        }
    };
    add(devices, 'device');
    add(channels, 'channel');
    return map;
}

/** Lookup tables over the library entries. */
export function buildBatteryLibIndex(
    entries: BatteryLibEntry[],
    snapshotDate: string,
    sourceVersion: number,
): BatteryLibIndex {
    const byMfrModel = new Map<string, BatteryLibEntry>();
    const byModelId = new Map<string, BatteryLibEntry>();
    const fuzzy: BatteryLibEntry[] = [];
    for (const e of entries) {
        if (e.matchMethod) {
            fuzzy.push(e);
        } else {
            byMfrModel.set(mfrModelKey(norm(e.manufacturer), norm(e.model)), e);
        }
        if (e.modelId) byModelId.set(norm(e.modelId), e);
    }
    return { entries, byMfrModel, byModelId, fuzzy, snapshotDate, sourceVersion };
}

/**
 * The device and channel entries above these datapoints — all that
 * resolveDeviceIdForDp / resolveBatteryType look at for them.
 */
export function deviceModelsAbove(dpIds: Iterable<string>, index: Map<string, DeviceModel>): DeviceModel[] {
    const out = new Map<string, DeviceModel>();
    for (const id of dpIds) {
        const parts = id.split('.');
        for (let i = parts.length - 1; i >= 2; i--) {
            const key = parts.slice(0, i).join('.');
            const e = index.get(key);
            if (e) out.set(key, e);
        }
    }
    return [...out.values()];
}

/**
 * Resolve a datapoint to its owning device id. Prefers the nearest `device` object
 * (which carries the real model, e.g. HomeMatic `native.TYPE`) over an intermediate
 * `channel` object (whose model/TYPE is the channel type, not the device model).
 */
export function resolveDeviceIdForDp(dpId: string, index: Map<string, DeviceModel>): string {
    const parts = dpId.split('.');
    let nearestChannel: string | null = null;
    for (let i = parts.length - 1; i >= 2; i--) {
        const id = parts.slice(0, i).join('.');
        const e = index.get(id);
        if (!e) continue;
        if (e.kind === 'device') return id; // device wins
        if (!nearestChannel) nearestChannel = id;
    }
    if (nearestChannel) return nearestChannel;
    // Fallback: immediate parent — keeps a stable override key even without a device object.
    return parts.slice(0, Math.max(2, parts.length - 1)).join('.');
}

/**
 * Auto-detect a battery type for a device: library match first, then an adapter-level
 * default (e.g. eufy built-in rechargeable). Shared by the widget and the admin page so
 * both show the same "auto" result. Returns null when nothing is known.
 */
export function autoBatteryType(
    deviceId: string,
    dm: DeviceModel | undefined,
    lib: BatteryLibIndex,
): { batteryType: string; quantity: number } | null {
    const m = dm ? matchBatteryType(dm, lib) : null;
    if (m) return m;
    const def = ADAPTER_BATTERY_DEFAULTS[deviceId.split('.')[0] ?? ''];
    if (def) return { batteryType: def.type, quantity: def.quantity ?? 1 };
    return null;
}

/**
 * "Is this device battery-powered?" for the HomeMatic LOWBAT gate (collectHmBatterySerials):
 * a battery type assigned by hand, or a model the library knows as a battery device.
 * Mains actuators are not in the library, so their LOWBAT flag stays out.
 */
export function batteryDeviceTest(
    index: Map<string, DeviceModel>,
    lib: BatteryLibIndex,
    overrides?: Record<string, BatteryTypeOverride>,
): (deviceId: string) => boolean {
    return (deviceId) => {
        if (overrides?.[deviceId]?.type) return true;
        const dm = index.get(deviceId);
        return !!dm && matchBatteryType(dm, lib) !== null;
    };
}

/**
 * Resolve a battery datapoint to a battery type: manual override first, then auto-detect.
 */
export function resolveBatteryType(
    dpId: string,
    index: Map<string, DeviceModel>,
    lib: BatteryLibIndex,
    overrides: Record<string, BatteryTypeOverride> | undefined,
): BatteryResolution {
    const deviceId = resolveDeviceIdForDp(dpId, index);

    const ov = overrides?.[deviceId];
    if (ov?.type) return { deviceId, type: ov.type, quantity: ov.quantity ?? 1, source: 'manual' };

    const auto = autoBatteryType(deviceId, index.get(deviceId), lib);
    if (auto) return { deviceId, type: auto.batteryType, quantity: auto.quantity, source: 'auto' };

    return { deviceId, type: null, quantity: 1, source: null };
}
