import { useState, useEffect, useCallback } from 'react';

export interface FsRoot {
    label: string;
    path: string;
}

export interface FsEntry {
    name: string;
    isDir: boolean;
    size: number | null;
    mtime: number | null;
    mime: string | null;
}

export interface FsListing {
    path: string;
    parent: string | null;
    entries: FsEntry[];
}

const CACHE_TTL_MS = 30_000;

const listCache = new Map<string, { data: FsListing; fetchedAt: number }>();
let rootsCache: FsRoot[] | null = null;
let rootsCacheTime = 0;

async function fetchJson<T>(url: string): Promise<T> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json() as Promise<T>;
}

export function useFsRoots(): { roots: FsRoot[]; loading: boolean; error: string | null } {
    const [roots, setRoots] = useState<FsRoot[]>(rootsCache ?? []);
    const [loading, setLoading] = useState(!rootsCache);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (rootsCache && Date.now() - rootsCacheTime < CACHE_TTL_MS) {
            setRoots(rootsCache);
            setLoading(false);
            return;
        }
        setLoading(true);
        fetchJson<FsRoot[]>('/fs/roots')
            .then((data) => {
                rootsCache = data;
                rootsCacheTime = Date.now();
                setRoots(data);
                setError(null);
            })
            .catch((e) => setError(String(e)))
            .finally(() => setLoading(false));
    }, []);

    return { roots, loading, error };
}

export function useFsList(fsPath: string | null): {
    listing: FsListing | null;
    loading: boolean;
    error: string | null;
    refresh: () => void;
} {
    const [listing, setListing] = useState<FsListing | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [tick, setTick] = useState(0);

    useEffect(() => {
        if (!fsPath) {
            setListing(null);
            return;
        }
        const cached = listCache.get(fsPath);
        if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
            setListing(cached.data);
            return;
        }
        setLoading(true);
        fetchJson<FsListing>(`/fs/list?path=${encodeURIComponent(fsPath)}`)
            .then((data) => {
                listCache.set(fsPath, { data, fetchedAt: Date.now() });
                setListing(data);
                setError(null);
            })
            .catch((e) => setError(String(e)))
            .finally(() => setLoading(false));
    }, [fsPath, tick]);

    const refresh = useCallback(() => {
        if (fsPath) listCache.delete(fsPath);
        setTick((t) => t + 1);
    }, [fsPath]);

    return { listing, loading, error, refresh };
}
