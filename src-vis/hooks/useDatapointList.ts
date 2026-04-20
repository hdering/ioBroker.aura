import { useState, useCallback } from 'react';
import { getObjectViewDirect } from './useIoBroker';

export interface DatapointEntry {
  id: string;
  name: string;
  type?: string;
  unit?: string;
  role?: string;
  rooms: string[];   // labels from enum.rooms.*
  funcs: string[];   // labels from enum.functions.*
  logging: string[]; // enabled logging adapter IDs, e.g. ['history.0', 'influxdb.0']
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
  loadInProgress = loadAll().then((entries) => {
    cache = entries;
    cacheTime = Date.now();
    loadInProgress = null;
    return entries;
  }).catch((err) => {
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
  const [stateResult, channelResult, deviceResult, enumResult] = await Promise.all([
    getObjectViewDirect('state'),
    getObjectViewDirect('channel'),
    getObjectViewDirect('device'),
    getObjectViewDirect('enum', 'enum.', 'enum.\u9999'),
  ]);

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

  return stateResult.rows.map((row) => {
    // Check state ID and all parent paths (channel, device) – enum members
    // can reference any level of the object hierarchy, not just states directly.
    const parts = row.id.split('.');
    const roomsSet = new Set<string>();
    const funcsSet = new Set<string>();
    for (let i = parts.length; i >= 2; i--) {
      const e = enumMap.get(parts.slice(0, i).join('.'));
      if (e) { e.rooms.forEach((r) => roomsSet.add(r)); e.funcs.forEach((f) => funcsSet.add(f)); }
    }

    // Compose name: closest parent (channel preferred over device) › state name
    const stateName = resolveName(row.value.common.name, '');
    let parentName = '';
    for (let i = parts.length - 1; i >= 2; i--) {
      const pName = parentNames.get(parts.slice(0, i).join('.'));
      if (pName) { parentName = pName; break; }
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

    const custom = row.value.common.custom ?? {};
    const logging = Object.entries(custom)
      .filter(([, cfg]) => cfg?.enabled === true)
      .map(([id]) => id);

    return {
      id: row.id,
      name,
      type: row.value.common.type,
      unit: row.value.common.unit,
      role: row.value.common.role,
      rooms: [...roomsSet],
      funcs: [...funcsSet],
      logging,
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
