import { useEffect, useState } from 'react';
import { getObjectDirect } from './useIoBroker';

export interface SystemConfig {
  city: string;
  latitude: number | null;
  longitude: number | null;
}

interface RawSystemConfig {
  common?: {
    city?: string;
    latitude?: number | string;
    longitude?: number | string;
  };
}

const EMPTY: SystemConfig = { city: '', latitude: null, longitude: null };

let cached: SystemConfig | null = null;
let inflight: Promise<SystemConfig> | null = null;

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

async function fetchSystemConfig(): Promise<SystemConfig> {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    const obj = (await getObjectDirect('system.config')) as RawSystemConfig | null;
    const c = obj?.common ?? {};
    const result: SystemConfig = {
      city: c.city ?? '',
      latitude: toNum(c.latitude),
      longitude: toNum(c.longitude),
    };
    cached = result;
    inflight = null;
    return result;
  })();
  return inflight;
}

export function useSystemConfig(): SystemConfig {
  const [cfg, setCfg] = useState<SystemConfig>(cached ?? EMPTY);
  useEffect(() => {
    if (cached) return;
    let cancelled = false;
    fetchSystemConfig().then((c) => { if (!cancelled) setCfg(c); });
    return () => { cancelled = true; };
  }, []);
  return cfg;
}
