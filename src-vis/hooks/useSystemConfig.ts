import { useEffect, useState } from 'react';
import { getObjectDirect, useIoBroker } from './useIoBroker';

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

// Only a successful read is cached. A read issued before the socket is up (slow
// link, VPN, first load) comes back empty or never answers — caching that left
// the timer without a location for the whole session, so astro rows showed the
// bare ☀↑/☀↓ symbol instead of the time (#498).
let cached: SystemConfig | null = null;
let inflight: Promise<SystemConfig | null> | null = null;

const FETCH_TIMEOUT_MS = 8000;
// Mounted hooks, told when a read lands — also one that answers after the timeout.
const listeners = new Set<(c: SystemConfig) => void>();

function toNum(v: unknown): number | null {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : null;
}

function fetchSystemConfig(): Promise<SystemConfig | null> {
    if (cached) return Promise.resolve(cached);
    if (inflight) return inflight;
    const p = new Promise<SystemConfig | null>((resolve) => {
        const timer = setTimeout(() => resolve(null), FETCH_TIMEOUT_MS);
        // skipCache: the object cache also keeps a null from a failed read.
        getObjectDirect('system.config', { skipCache: true }).then((obj) => {
            clearTimeout(timer);
            const c = (obj as RawSystemConfig | null)?.common;
            if (!c) {
                resolve(null);
                return;
            }
            const result: SystemConfig = {
                city: c.city ?? '',
                latitude: toNum(c.latitude),
                longitude: toNum(c.longitude),
            };
            cached = result;
            listeners.forEach((fn) => fn(result));
            resolve(result);
        });
    }).finally(() => {
        inflight = null;
    });
    inflight = p;
    return p;
}

export function useSystemConfig(): SystemConfig {
    const [cfg, setCfg] = useState<SystemConfig>(cached ?? EMPTY);
    const { connected } = useIoBroker();
    useEffect(() => {
        listeners.add(setCfg);
        return () => {
            listeners.delete(setCfg);
        };
    }, []);
    useEffect(() => {
        if (cached) {
            setCfg(cached);
            return;
        }
        // Retried on every (re)connect until one read succeeds.
        if (connected) void fetchSystemConfig();
    }, [connected]);
    return cfg;
}
