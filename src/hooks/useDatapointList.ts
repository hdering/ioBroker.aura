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
}

// Module-level cache – survives component mount/unmount
let cache: DatapointEntry[] | null = null;
let cacheTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function invalidateDatapointCache() {
  cache = null;
  cacheTime = 0;
}

export function isCacheStale(): boolean {
  return cache === null || Date.now() - cacheTime > CACHE_TTL_MS;
}

/** Synchronous name lookup from the in-memory cache. Returns null if not loaded yet. */
export function lookupDatapointName(id: string): string | null {
  if (!cache || !id) return null;
  return cache.find((e) => e.id === id)?.name ?? null;
}

function resolveName(name: string | Record<string, string> | undefined, fallback: string): string {
  if (!name) return fallback;
  if (typeof name === 'string') return name;
  return name.de ?? name.en ?? Object.values(name)[0] ?? fallback;
}

async function loadAll(): Promise<DatapointEntry[]> {
  const [stateResult, enumResult] = await Promise.all([
    getObjectViewDirect('state'),
    getObjectViewDirect('enum', 'enum.', 'enum.\u9999'),
  ]);

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
    const e = enumMap.get(row.id) ?? { rooms: [], funcs: [] };
    return {
      id: row.id,
      name: resolveName(row.value.common.name, row.id.split('.').pop() ?? row.id),
      type: row.value.common.type,
      unit: row.value.common.unit,
      role: row.value.common.role,
      rooms: e.rooms,
      funcs: e.funcs,
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
