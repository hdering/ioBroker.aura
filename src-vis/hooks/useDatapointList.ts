import { useState, useCallback } from 'react';
import { getObjectViewDirect } from './useIoBroker';

export interface DatapointEntry {
    id: string;
    name: string;
    type?: string;
    unit?: string;
    role?: string;
    write?: boolean; // false = read-only (common.write === false)
    rooms: string[]; // labels from enum.rooms.*
    funcs: string[]; // labels from enum.functions.*
    logging: string[]; // enabled logging adapter IDs, e.g. ['history.0', 'influxdb.0']
    // false = the state's adapter instance is not enabled (disabled adapter, or an
    // orphaned/manually-imported state with no matching instance). Hidden by default
    // in the picker, shown when the user opts into "also show inactive". Undefined
    // (e.g. synthetic entries) counts as active.
    active?: boolean;
}

// Module-level cache – survives component mount/unmount
let cache: DatapointEntry[] | null = null;
let cacheTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function invalidateDatapointCache() {
    cache = null;
    cacheTime = 0;
}

let loadInProgress: Promise<DatapointEntry[]> | null = null;

/** Ensures the cache is populated. Returns the entries (from cache or fresh load). */
export async function ensureDatapointCache(): Promise<DatapointEntry[]> {
    if (cache && !isCacheStale()) return cache;
    if (loadInProgress) return loadInProgress;
    loadInProgress = loadAll()
        .then((entries) => {
            cache = entries;
            cacheTime = Date.now();
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
    if (!cache || !id) return null;
    return cache.find((e) => e.id === id)?.name ?? null;
}

/** Synchronous full-entry lookup from the in-memory cache. Returns null if not loaded yet. */
export function lookupDatapointEntry(id: string): DatapointEntry | null {
    if (!cache || !id) return null;
    return cache.find((e) => e.id === id) ?? null;
}

function resolveName(name: string | Record<string, string> | undefined, fallback: string): string {
    if (!name) return fallback;
    if (typeof name === 'string') return name;
    return name.de ?? name.en ?? Object.values(name)[0] ?? fallback;
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
    for (const { id, value: obj } of instanceResult.rows) {
        if (obj?.common?.enabled === true) {
            // id is "system.adapter.hm-rpc.0" → strip prefix
            enabledPrefixes.add(id.slice('system.adapter.'.length));
        }
    }
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

    // Build memberId → { rooms, funcs } map from enums
    const enumMap = new Map<string, { rooms: string[]; funcs: string[] }>();
    for (const { value: obj } of enumResult.rows) {
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
            const active = enabledPrefixes.has(prefix);
            // Check state ID and all parent paths (channel, device) – enum members
            // can reference any level of the object hierarchy, not just states directly.
            const parts = row.id.split('.');
            const roomsSet = new Set<string>();
            const funcsSet = new Set<string>();
            for (let i = parts.length; i >= 2; i--) {
                const e = enumMap.get(parts.slice(0, i).join('.'));
                if (e) {
                    e.rooms.forEach((r) => roomsSet.add(r));
                    e.funcs.forEach((f) => funcsSet.add(f));
                }
            }

            const common = row.value.common;
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
                name = parts[parts.length - 1] ?? row.id;
            }

            const custom = common.custom ?? {};
            const logging = Object.entries(custom)
                .filter(([, cfg]) => cfg?.enabled === true)
                .map(([id]) => id);

            return {
                id: row.id,
                name,
                type: common.type,
                unit: common.unit,
                role: common.role,
                write: common.write !== false ? undefined : false,
                rooms: [...roomsSet],
                funcs: [...funcsSet],
                logging,
                active,
            };
        });
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
            cache = entries;
            cacheTime = Date.now();
            setDatapoints(entries);
        } finally {
            setLoading(false);
        }
    }, []);

    return { datapoints, loading, loaded: cache !== null, load };
}
