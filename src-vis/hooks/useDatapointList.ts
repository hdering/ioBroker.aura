import { useState, useCallback } from 'react';
import {
    buildDatapointEntries,
    buildEntry,
    buildEnumMap,
    KNOWN_LOGGING_ADAPTERS,
    resolveName,
    type DatapointEntry,
    type StateCommon,
} from '../utils/datapointEntry';
import { getObjectDirect, getObjectViewDirect, whenStateReadsIdle } from './useIoBroker';

export type { DatapointEntry } from '../utils/datapointEntry';
export { normalizeStates } from '../utils/datapointEntry';

// Module-level cache – survives component mount/unmount
let cache: DatapointEntry[] | null = null;
let cacheById: Map<string, DatapointEntry> = new Map();
let cacheTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Entries resolved one by one (fetchDatapointEntries) while the full list is not
// loaded – the display side only needs the datapoints it shows (#882).
let partialById: Map<string, DatapointEntry> = new Map();

function setCache(entries: DatapointEntry[]): void {
    cache = entries;
    cacheById = new Map(entries.map((e) => [e.id, e]));
    cacheTime = Date.now();
}

// Names of the channel/device objects above the states. loadAll() reads these rows
// anyway (to compose the "Kanal › State" display name) – keeping them lets structural
// detectors label a find with its real device name without a second object read.
let objectNames: Map<string, string> = new Map();
let deviceIds: Set<string> = new Set();

export function invalidateDatapointCache() {
    cache = null;
    cacheById = new Map();
    partialById = new Map();
    cacheTime = 0;
    objectNames = new Map();
    deviceIds = new Set();
}

/** Name of the channel or device object with exactly this id, or null. */
export function lookupObjectName(id: string): string | null {
    return objectNames.get(id) ?? null;
}

/**
 * Name of the nearest `device` object above (or at) `id` – e.g. the receiver
 * "Wohnzimmer" for a state inside its `player.netPlayer` channel. Channels are
 * skipped on the way up, so the result is the physical device, not its subtree.
 */
export function lookupDeviceName(id: string): string | null {
    const parts = id.split('.');
    for (let i = parts.length; i >= 2; i--) {
        const candidate = parts.slice(0, i).join('.');
        if (deviceIds.has(candidate)) return objectNames.get(candidate) ?? null;
    }
    return null;
}

let loadInProgress: Promise<DatapointEntry[]> | null = null;

export interface EnsureDatapointCacheOptions {
    /**
     * Display-side caller (a widget in the dashboard, not the editor): waits until the
     * visible values are in before the load starts, so they don't queue behind tens of
     * MB of objects, and takes an older list instead of reloading it after the TTL (#882).
     */
    background?: boolean;
}

/** Ensures the cache is populated. Returns the entries (from cache or fresh load). */
export async function ensureDatapointCache(opts?: EnsureDatapointCacheOptions): Promise<DatapointEntry[]> {
    if (cache && (opts?.background || !isCacheStale())) return cache;
    if (loadInProgress) return loadInProgress;
    // Callers arriving during the wait join this promise, so the load still runs once.
    loadInProgress = (opts?.background ? whenStateReadsIdle() : Promise.resolve())
        .then(() => loadAll())
        .then((entries) => {
            setCache(entries);
            loadInProgress = null;
            return entries;
        })
        .catch((err) => {
            loadInProgress = null;
            throw err;
        });
    return loadInProgress;
}

export function isCacheStale(): boolean {
    return cache === null || Date.now() - cacheTime > CACHE_TTL_MS;
}

/**
 * Entries someone else resolved (the adapter's Statusübersicht discovery, #882) —
 * kept for lookupDatapointEntry like the ones fetchDatapointEntries reads.
 */
export function rememberDatapointEntries(entries: DatapointEntry[]): void {
    for (const e of entries) partialById.set(e.id, e);
}

/** Synchronous name lookup from the in-memory cache. Returns null if not loaded yet. */
export function lookupDatapointName(id: string): string | null {
    return lookupDatapointEntry(id)?.name ?? null;
}

/** Synchronous full-entry lookup from the in-memory cache. Returns null if not loaded yet. */
export function lookupDatapointEntry(id: string): DatapointEntry | null {
    if (!id) return null;
    return cacheById.get(id) ?? partialById.get(id) ?? null;
}

// Enum rows for fetchDatapointEntries – one small read (enum.*), shared by every caller.
let enumRowsPromise: Promise<EnumRow[]> | null = null;
type EnumRow = Awaited<ReturnType<typeof getObjectViewDirect>>['rows'][number];

/**
 * Entries for just these datapoints, without loading the whole object DB (#882).
 * Reads each datapoint and its parents with getObject (cached per session) and, with
 * `rooms`, the enums. From the full list when that is loaded anyway. `active` stays
 * unset and `logging` only knows the history adapters by name – both are picker
 * matters. Ids without an object are left out.
 */
export async function fetchDatapointEntries(
    ids: string[],
    opts?: { rooms?: boolean },
): Promise<Map<string, DatapointEntry>> {
    const out = new Map<string, DatapointEntry>();
    const unique = [...new Set(ids.filter(Boolean))];
    const missing: string[] = [];
    for (const id of unique) {
        const hit = cacheById.get(id) ?? (opts?.rooms ? undefined : partialById.get(id));
        if (hit) out.set(id, hit);
        else missing.push(id);
    }
    if (missing.length === 0) return out;

    const parentIds = new Set<string>();
    for (const id of missing) {
        const parts = id.split('.');
        for (let i = parts.length - 1; i >= 2; i--) parentIds.add(parts.slice(0, i).join('.'));
    }
    if (opts?.rooms && !enumRowsPromise) {
        enumRowsPromise = getObjectViewDirect('enum', 'enum.', 'enum.香').then(
            (r) => r.rows,
            () => {
                enumRowsPromise = null;
                return [];
            },
        );
    }
    const [objs, parents, enumRows] = await Promise.all([
        Promise.all(missing.map((id) => getObjectDirect(id))),
        Promise.all([...parentIds].map(async (id) => [id, await getObjectDirect(id)] as const)),
        opts?.rooms ? enumRowsPromise! : Promise.resolve([] as EnumRow[]),
    ]);

    // Same rule as loadAll: only device and channel objects name a datapoint.
    const parentNames = new Map<string, string>();
    for (const [id, obj] of parents) {
        if (!obj || (obj.type !== 'device' && obj.type !== 'channel')) continue;
        const n = resolveName(obj.common?.name, '');
        if (n) parentNames.set(id, n);
    }
    const enumMap = buildEnumMap(enumRows);
    missing.forEach((id, i) => {
        const obj = objs[i];
        if (!obj?.common) return;
        const entry = buildEntry(
            id,
            obj.common as StateCommon,
            parentNames,
            enumMap,
            (instanceId) => KNOWN_LOGGING_ADAPTERS.has(instanceId.replace(/\.\d+$/, '')),
            undefined,
        );
        partialById.set(id, entry);
        out.set(id, entry);
    });
    return out;
}

async function loadAll(): Promise<DatapointEntry[]> {
    const [states, aliasStates, channels, devices, enums, instances] = await Promise.all([
        getObjectViewDirect('state'),
        getObjectViewDirect('state', 'alias.', 'alias.\u9999'),
        getObjectViewDirect('channel'),
        getObjectViewDirect('device'),
        getObjectViewDirect('enum', 'enum.', 'enum.\u9999'),
        getObjectViewDirect('instance', 'system.adapter.', 'system.adapter.\u9999'),
    ]);
    const built = buildDatapointEntries({
        states: states.rows,
        aliasStates: aliasStates.rows,
        channels: channels.rows,
        devices: devices.rows,
        enums: enums.rows,
        instances: instances.rows,
    });
    objectNames = built.parentNames;
    deviceIds = built.deviceIds;
    return built.entries;
}

export function useDatapointList() {
    const [datapoints, setDatapoints] = useState<DatapointEntry[]>(cache ?? []);
    const [loading, setLoading] = useState(false);

    const load = useCallback(async (force = false) => {
        if (cache && !force) {
            setDatapoints(cache);
            return;
        }
        setLoading(true);
        try {
            const entries = await loadAll();
            setCache(entries);
            setDatapoints(entries);
        } finally {
            setLoading(false);
        }
    }, []);

    return { datapoints, loading, loaded: cache !== null, load };
}
