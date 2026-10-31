import { useState, useCallback } from 'react';
import type { ObjectViewResult } from '../types';
import { getObjectDirect, getObjectViewDirect, whenStateReadsIdle } from './useIoBroker';

export interface DatapointEntry {
    id: string;
    name: string;
    type?: string;
    unit?: string;
    role?: string;
    write?: boolean; // false = read-only (common.write === false)
    // common.min / max / step. Only set when the datapoint declares them, so a
    // detector can pre-fill a widget's value range (e.g. an AV receiver's dB volume
    // scale of -80.5…16.5) instead of falling back to the 0…100 default.
    min?: number;
    max?: number;
    step?: number;
    rooms: string[]; // labels from enum.rooms.*
    funcs: string[]; // labels from enum.functions.*
    logging: string[]; // enabled logging adapter IDs, e.g. ['history.0', 'influxdb.0']
    // Value → label map from `common.states`, normalised from all three ioBroker
    // spellings (object, array, "0:a;1:b"). Only set when the datapoint has one, so
    // structural detectors can recognise multi-state datapoints (e.g. a rotary handle's
    // CLOSED/TILTED/OPEN enum) without a second object read.
    states?: Record<string, string>;
    // false = the state's adapter instance is not enabled (disabled adapter, or an
    // orphaned/manually-imported state with no matching instance). Hidden by default
    // in the picker, shown when the user opts into "also show inactive". Undefined
    // (e.g. synthetic entries) counts as active.
    active?: boolean;
}

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

/** Synchronous name lookup from the in-memory cache. Returns null if not loaded yet. */
export function lookupDatapointName(id: string): string | null {
    return lookupDatapointEntry(id)?.name ?? null;
}

/** Synchronous full-entry lookup from the in-memory cache. Returns null if not loaded yet. */
export function lookupDatapointEntry(id: string): DatapointEntry | null {
    if (!id) return null;
    return cacheById.get(id) ?? partialById.get(id) ?? null;
}

/**
 * Adapters that log datapoint values. ioBroker marks them with `common.type: 'storage'`
 * in their instance object, so the list below is only the fallback for instances that
 * were not read (e.g. a disabled one). Other adapters use `common.custom` as well –
 * iot for the Alexa smart names, for instance – and must not count as "history".
 */
const KNOWN_LOGGING_ADAPTERS = new Set(['history', 'influxdb', 'sql']);

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

function resolveName(name: string | Record<string, string> | undefined, fallback: string): string {
    if (!name) return fallback;
    if (typeof name === 'string') return name;
    return name.de ?? name.en ?? Object.values(name)[0] ?? fallback;
}

/**
 * Normalises `common.states` into a value → label map. ioBroker allows three
 * spellings: an object, an array (index = value) and the legacy "0:a;1:b" string.
 * Returns undefined when the datapoint has no enum, so the cache entry stays small.
 */
export function normalizeStates(raw: unknown): Record<string, string> | undefined {
    const out: Record<string, string> = {};
    if (Array.isArray(raw)) {
        raw.forEach((label, i) => {
            out[String(i)] = String(label);
        });
    } else if (typeof raw === 'string') {
        raw.split(';').forEach((pair) => {
            const sep = pair.indexOf(':');
            if (sep < 1) return;
            const key = pair.slice(0, sep).trim();
            if (key) out[key] = pair.slice(sep + 1).trim();
        });
    } else if (raw && typeof raw === 'object') {
        Object.entries(raw as Record<string, unknown>).forEach(([k, label]) => {
            out[k.trim()] = String(label);
        });
    }
    return Object.keys(out).length ? out : undefined;
}

async function loadAll(): Promise<DatapointEntry[]> {
    const [stateResult, aliasStateResult, channelResult, deviceResult, enumResult, instanceResult] = await Promise.all([
        getObjectViewDirect('state'),
        getObjectViewDirect('state', 'alias.', 'alias.\u9999'),
        getObjectViewDirect('channel'),
        getObjectViewDirect('device'),
        getObjectViewDirect('enum', 'enum.', 'enum.\u9999'),
        getObjectViewDirect('instance', 'system.adapter.', 'system.adapter.\u9999'),
    ]);

    // Merge alias states into stateResult (deduplicate by id)
    const seenIds = new Set(stateResult.rows.map((r) => r.id));
    for (const row of aliasStateResult.rows) {
        if (!seenIds.has(row.id)) stateResult.rows.push(row);
    }

    // Build set of enabled instance prefixes: "hm-rpc.0", "history.0", …
    const enabledPrefixes = new Set<string>();
    // …and of every instance that stores values (history, influxdb, sql, …), so the
    // picker's history column and filter cover all of them, disabled ones included.
    const loggingInstances = new Set<string>();
    for (const { id, value: obj } of instanceResult.rows) {
        // id is "system.adapter.hm-rpc.0" → strip prefix
        const instanceId = id.slice('system.adapter.'.length);
        if (obj?.common?.enabled === true) enabledPrefixes.add(instanceId);
        // An instance's common.type is the adapter category ("storage", "logic", …),
        // not the state type the row typing assumes.
        if ((obj?.common as { type?: string } | undefined)?.type === 'storage') loggingInstances.add(instanceId);
    }
    const isLoggingInstance = (instanceId: string) =>
        loggingInstances.has(instanceId) || KNOWN_LOGGING_ADAPTERS.has(instanceId.replace(/\.\d+$/, ''));
    // 0_userdata.0 and alias.0 are built-in ioBroker namespaces, not adapter instances
    enabledPrefixes.add('0_userdata.0');
    enabledPrefixes.add('alias.0');

    // Build parent name map: id → resolved name (devices first, then channels so channels win)
    const parentNames = new Map<string, string>();
    for (const { id, value: obj } of [...deviceResult.rows, ...channelResult.rows]) {
        if (!obj?.common?.name) continue;
        const n = resolveName(obj.common.name, '');
        if (n) parentNames.set(id, n);
    }
    objectNames = parentNames;
    deviceIds = new Set(deviceResult.rows.map((r) => r.id));

    const enumMap = buildEnumMap(enumResult.rows);

    return stateResult.rows
        .filter((row) => {
            // Some user DBs contain malformed state rows where row.value or
            // row.value.common is missing — filter them out here so the .map below
            // can dereference common safely.
            return !!row?.value?.common;
        })
        .map((row) => {
            // e.g. "hm-rpc.0.ABC.STATE" → prefix "hm-rpc.0". A state belongs to an
            // "active" instance when that prefix is an enabled adapter (or a built-in
            // namespace). Inactive states (disabled adapters, orphaned/imported
            // states with no instance) are kept but flagged so the picker can hide
            // them by default.
            const dot2 = row.id.indexOf('.', row.id.indexOf('.') + 1);
            const prefix = dot2 !== -1 ? row.id.slice(0, dot2) : row.id;
            // Scenes live under the "scene.<n>" namespace but the adapter is named
            // "scenes", so there is no matching "system.adapter.scene.<n>" instance and
            // the prefix check above would always mark them inactive. Treat the scene
            // namespace as active so scene DPs are selectable and shown by default.
            const active = enabledPrefixes.has(prefix) || prefix.startsWith('scene.');
            return buildEntry(row.id, row.value.common, parentNames, enumMap, isLoggingInstance, active);
        });
}

type StateCommon = ObjectViewResult['rows'][number]['value']['common'];
type EnumMap = Map<string, { rooms: string[]; funcs: string[] }>;

/** memberId → { rooms, funcs } from the enum rows (rooms and functions only). */
function buildEnumMap(rows: ObjectViewResult['rows']): EnumMap {
    const enumMap: EnumMap = new Map();
    for (const { value: obj } of rows) {
        if (!obj?.common?.members?.length) continue;
        const isRoom = obj._id.startsWith('enum.rooms.');
        const isFunc = obj._id.startsWith('enum.functions.');
        if (!isRoom && !isFunc) continue;
        const label = resolveName(obj.common.name, obj._id.split('.').pop() ?? obj._id);
        for (const memberId of obj.common.members) {
            if (!enumMap.has(memberId)) enumMap.set(memberId, { rooms: [], funcs: [] });
            const e = enumMap.get(memberId)!;
            if (isRoom) e.rooms.push(label);
            else e.funcs.push(label);
        }
    }
    return enumMap;
}

function buildEntry(
    id: string,
    common: StateCommon,
    parentNames: Map<string, string>,
    enumMap: EnumMap,
    isLoggingInstance: (instanceId: string) => boolean,
    active: boolean | undefined,
): DatapointEntry {
    // Check state ID and all parent paths (channel, device) – enum members
    // can reference any level of the object hierarchy, not just states directly.
    const parts = id.split('.');
    const roomsSet = new Set<string>();
    const funcsSet = new Set<string>();
    for (let i = parts.length; i >= 2; i--) {
        const e = enumMap.get(parts.slice(0, i).join('.'));
        if (e) {
            e.rooms.forEach((r) => roomsSet.add(r));
            e.funcs.forEach((f) => funcsSet.add(f));
        }
    }

    // Compose name: closest parent (channel preferred over device) › state name
    const stateName = resolveName(common.name, '');
    let parentName = '';
    for (let i = parts.length - 1; i >= 2; i--) {
        const pName = parentNames.get(parts.slice(0, i).join('.'));
        if (pName) {
            parentName = pName;
            break;
        }
    }
    let name: string;
    if (parentName && stateName && parentName !== stateName) {
        name = `${parentName} › ${stateName}`;
    } else if (stateName) {
        name = stateName;
    } else if (parentName) {
        name = `${parentName} › ${parts[parts.length - 1]}`;
    } else {
        name = parts[parts.length - 1] ?? id;
    }

    const custom = common.custom ?? {};
    const logging = Object.entries(custom)
        .filter(([instanceId, cfg]) => cfg?.enabled === true && isLoggingInstance(instanceId))
        .map(([instanceId]) => instanceId);

    return {
        id,
        name,
        type: common.type,
        unit: common.unit,
        role: common.role,
        states: normalizeStates(common.states),
        write: common.write !== false ? undefined : false,
        min: typeof common.min === 'number' ? common.min : undefined,
        max: typeof common.max === 'number' ? common.max : undefined,
        step: typeof common.step === 'number' ? common.step : undefined,
        rooms: [...roomsSet],
        funcs: [...funcsSet],
        logging,
        active,
    };
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
