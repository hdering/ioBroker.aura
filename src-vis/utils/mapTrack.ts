import { auraUrl } from './basePath';
import { extractLatLon, haversineKm, type LatLon } from './geo';

/**
 * Lines on the map widget: recorded tracks (a points list from a datapoint or the
 * history of a position datapoint, #410) and computed routes between two markers
 * (#790). Pure helpers only — the widget does the fetching lifecycle.
 */

export interface TrackPoint {
    pos: LatLon;
    /** Epoch ms, when the source carries a time stamp. */
    ts?: number;
    /** Speed in km/h, when the source carries one. */
    speed?: number;
    /** Position accuracy in metres, when the source carries one. */
    accuracy?: number;
}

export interface ParsedTrack {
    points: TrackPoint[];
    /** `name` / `title` / `label` of the track object, if any. */
    name?: string;
    /** `lineColor` / `color` of the track object, if any. */
    color?: string;
}

const POINT_LIST_KEYS = ['points', 'track', 'trackpoints', 'path', 'positions', 'coordinates', 'route', 'data'];
const TS_KEYS = ['timestamp', 'ts', 'time', 'date', 'datetime', 'lc'];
const SPEED_KEYS = ['speed', 'velocity', 'spd'];
const ACCURACY_KEYS = ['accuracy', 'acc', 'hdop'];

function num(v: unknown): number | undefined {
    if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
    if (typeof v === 'string' && v.trim() !== '') {
        const n = Number(v.replace(',', '.'));
        return Number.isFinite(n) ? n : undefined;
    }
    return undefined;
}

function pickNum(obj: Record<string, unknown>, keys: string[]): number | undefined {
    for (const k of keys) {
        const n = num(obj[k]);
        if (n !== undefined) return n;
    }
    return undefined;
}

/** Epoch ms from a number (s or ms) or a date string. */
function toTs(v: unknown): number | undefined {
    if (typeof v === 'number' && Number.isFinite(v)) return v < 1e11 ? v * 1000 : v;
    if (typeof v === 'string' && v.trim()) {
        const n = Number(v);
        if (Number.isFinite(n)) return toTs(n);
        const d = Date.parse(v);
        return Number.isFinite(d) ? d : undefined;
    }
    return undefined;
}

function getPath(obj: unknown, path: string): unknown {
    return path
        .split('.')
        .filter(Boolean)
        .reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj);
}

/** Reads time/speed/accuracy off a point object; positions go through extractLatLon. */
function pointFrom(raw: unknown, latPath?: string, lonPath?: string): TrackPoint | null {
    const pos = extractLatLon(raw, latPath, lonPath);
    if (!pos) return null;
    const p: TrackPoint = { pos };
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        const obj = raw as Record<string, unknown>;
        for (const k of TS_KEYS) {
            const ts = toTs(obj[k]);
            if (ts !== undefined) {
                p.ts = ts;
                break;
            }
        }
        const speed = pickNum(obj, SPEED_KEYS);
        if (speed !== undefined) p.speed = speed;
        const acc = pickNum(obj, ACCURACY_KEYS);
        if (acc !== undefined) p.accuracy = acc;
    }
    return p;
}

/** GeoJSON LineString / MultiLineString / Feature / FeatureCollection → [lat, lon] points. */
function fromGeoJson(val: Record<string, unknown>): TrackPoint[] | null {
    const type = val.type;
    if (type === 'FeatureCollection' && Array.isArray(val.features)) {
        const all = (val.features as unknown[]).flatMap((f) =>
            f && typeof f === 'object' ? (fromGeoJson(f as Record<string, unknown>) ?? []) : [],
        );
        return all;
    }
    if (type === 'Feature' && val.geometry && typeof val.geometry === 'object') {
        return fromGeoJson(val.geometry as Record<string, unknown>);
    }
    const lonLat = (c: unknown): TrackPoint | null => {
        if (!Array.isArray(c) || c.length < 2) return null;
        const lon = num(c[0]);
        const lat = num(c[1]);
        return lat !== undefined && lon !== undefined ? { pos: [lat, lon] } : null;
    };
    if (type === 'LineString' && Array.isArray(val.coordinates)) {
        return (val.coordinates as unknown[]).map(lonLat).filter((p): p is TrackPoint => !!p);
    }
    if (type === 'MultiLineString' && Array.isArray(val.coordinates)) {
        return (val.coordinates as unknown[])
            .flatMap((line) => (Array.isArray(line) ? line : []))
            .map(lonLat)
            .filter((p): p is TrackPoint => !!p);
    }
    return null;
}

/**
 * Parses a track from a datapoint value. Accepted shapes:
 *  - an array of points (`{lat, lon, …}`, `[lat, lon]`, `"lat,lon"`)
 *  - an object holding such an array under `pointsPath` or a well-known key
 *    (`points`, `track`, `path`, `positions`, `coordinates`, …), plus optional
 *    `name` and `lineColor`
 *  - GeoJSON (LineString / MultiLineString / Feature / FeatureCollection, [lon, lat])
 *  - a JSON string of any of the above
 */
export function parseTrack(raw: unknown, pointsPath?: string, latPath?: string, lonPath?: string): ParsedTrack {
    let val: unknown = raw;
    if (typeof val === 'string') {
        try {
            val = JSON.parse(val);
        } catch {
            return { points: [] };
        }
    }
    let list: unknown = val;
    let name: string | undefined;
    let color: string | undefined;
    if (val && typeof val === 'object' && !Array.isArray(val)) {
        const obj = val as Record<string, unknown>;
        const geo = fromGeoJson(obj);
        const props =
            obj.type === 'Feature' && obj.properties && typeof obj.properties === 'object'
                ? (obj.properties as Record<string, unknown>)
                : obj;
        const n = props.name ?? props.title ?? props.label;
        if (typeof n === 'string' && n.trim()) name = n.trim();
        const c = props.lineColor ?? props.color ?? props.stroke;
        if (typeof c === 'string' && c.trim()) color = c.trim();
        if (geo) return { points: geo, name, color };
        if (pointsPath?.trim()) list = getPath(obj, pointsPath.trim());
        else list = POINT_LIST_KEYS.map((k) => obj[k]).find(Array.isArray);
    }
    if (!Array.isArray(list)) return { points: [], name, color };
    const points = list.map((p) => pointFrom(p, latPath, lonPath)).filter((p): p is TrackPoint => !!p);
    return { points, name, color };
}

/**
 * Turns the history of a position datapoint (JSON object or "lat,lon" string per
 * entry) into track points, oldest first. Consecutive identical positions collapse
 * into the first one, so a parked car does not stack hundreds of dots.
 */
export function historyToTrack(
    entries: { ts: number; val: unknown }[],
    latPath?: string,
    lonPath?: string,
): TrackPoint[] {
    const out: TrackPoint[] = [];
    const sorted = [...entries].sort((a, b) => a.ts - b.ts);
    for (const e of sorted) {
        let raw: unknown = e.val;
        if (typeof raw === 'string') {
            const s = raw.trim();
            if (s.startsWith('{') || s.startsWith('[')) {
                try {
                    raw = JSON.parse(s);
                } catch {
                    continue;
                }
            }
        }
        const p = pointFrom(raw, latPath, lonPath);
        if (!p) continue;
        if (p.ts === undefined) p.ts = e.ts;
        const last = out[out.length - 1];
        if (last && last.pos[0] === p.pos[0] && last.pos[1] === p.pos[1]) continue;
        out.push(p);
    }
    return out;
}

/** Appends a live position to a track if it is new (different place, not older). */
export function appendLivePoint(track: TrackPoint[], live: TrackPoint | null): TrackPoint[] {
    if (!live) return track;
    const last = track[track.length - 1];
    if (last && last.pos[0] === live.pos[0] && last.pos[1] === live.pos[1]) return track;
    if (last?.ts !== undefined && live.ts !== undefined && live.ts < last.ts) return track;
    return [...track, live];
}

/** Total length of a polyline in kilometres. */
export function trackLengthKm(points: LatLon[]): number {
    let km = 0;
    for (let i = 1; i < points.length; i++) km += haversineKm(points[i - 1], points[i]);
    return km;
}

/** South-west and north-east corner of a point list, or null when empty. */
export function trackBounds(points: LatLon[]): [LatLon, LatLon] | null {
    if (!points.length) return null;
    let s = Infinity;
    let w = Infinity;
    let n = -Infinity;
    let e = -Infinity;
    for (const [la, lo] of points) {
        if (la < s) s = la;
        if (la > n) n = la;
        if (lo < w) w = lo;
        if (lo > e) e = lo;
    }
    return [
        [s, w],
        [n, e],
    ];
}

/** `14 min`, `1 h 05 min`. */
export function formatDuration(minutes: number): string {
    if (!Number.isFinite(minutes) || minutes < 0) return '';
    const m = Math.round(minutes);
    if (m < 60) return `${m} min`;
    return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}

// ── Routing (OSRM) ────────────────────────────────────────────────────────────
// FOSSGIS runs public OSRM instances per profile (car/bike/foot), free and without
// a key. Requests go through Aura's /proxy (identifying User-Agent), are cached per
// rounded start/end and serialised with a gap so a moving marker cannot flood the
// service.

export type RouteProfile = 'car' | 'bike' | 'foot';

export interface RouteResult {
    coords: LatLon[];
    distanceKm: number;
    durationMin: number;
}

const ROUTE_PROFILES: RouteProfile[] = ['car', 'bike', 'foot'];
const routeCache = new Map<string, RouteResult | null>();
const routeInflight = new Map<string, Promise<RouteResult | null>>();
const ROUTE_GAP_MS = 1000;
let routeChain: Promise<unknown> = Promise.resolve();
let lastRouteAt = 0;

export function normalizeProfile(p: unknown): RouteProfile {
    return ROUTE_PROFILES.includes(p as RouteProfile) ? (p as RouteProfile) : 'car';
}

/** Cache key: start/end rounded to ~110 m, so a slowly moving marker reuses the route. */
export function routeKey(from: LatLon, to: LatLon, profile: RouteProfile): string {
    const r = (p: LatLon) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`;
    return `${profile}|${r(from)}|${r(to)}`;
}

export function routeUrl(from: LatLon, to: LatLon, profile: RouteProfile): string {
    const c = (p: LatLon) => `${p[1].toFixed(6)},${p[0].toFixed(6)}`;
    return `https://routing.openstreetmap.de/routed-${profile}/route/v1/driving/${c(from)};${c(to)}?overview=full&geometries=geojson`;
}

/** Parses an OSRM `route` response into [lat, lon] coordinates + distance + duration. */
export function parseOsrmRoute(data: unknown): RouteResult | null {
    const d = data as {
        code?: string;
        routes?: { distance?: number; duration?: number; geometry?: { coordinates?: unknown[] } }[];
    };
    if (d?.code !== 'Ok') return null;
    const r = d.routes?.[0];
    const coords = (r?.geometry?.coordinates ?? [])
        .map((c): LatLon | null => {
            if (!Array.isArray(c)) return null;
            const lon = Number(c[0]);
            const lat = Number(c[1]);
            return Number.isFinite(lat) && Number.isFinite(lon) ? [lat, lon] : null;
        })
        .filter((c): c is LatLon => !!c);
    if (coords.length < 2) return null;
    return {
        coords,
        distanceKm: Number(r?.distance ?? 0) / 1000,
        durationMin: Number(r?.duration ?? 0) / 60,
    };
}

function scheduleRoute<T>(fn: () => Promise<T>): Promise<T> {
    const run = routeChain.then(async () => {
        const wait = lastRouteAt + ROUTE_GAP_MS - Date.now();
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        lastRouteAt = Date.now();
        return fn();
    });
    routeChain = run.then(
        () => undefined,
        () => undefined,
    );
    return run;
}

/** Fetches (or returns the cached) route. Transient failures are not cached. */
export function fetchRoute(from: LatLon, to: LatLon, profile: RouteProfile): Promise<RouteResult | null> {
    const key = routeKey(from, to, profile);
    if (routeCache.has(key)) return Promise.resolve(routeCache.get(key) ?? null);
    const existing = routeInflight.get(key);
    if (existing) return existing;
    const req = scheduleRoute(async (): Promise<RouteResult | null> => {
        try {
            const res = await fetch(auraUrl(`/proxy?url=${encodeURIComponent(routeUrl(from, to, profile))}`));
            if (!res.ok) return null;
            const data: unknown = await res.json();
            const route = parseOsrmRoute(data);
            // "NoRoute" is a real answer (e.g. across the sea) — cache it; garbage is not.
            if (route || (data as { code?: string })?.code === 'NoRoute') routeCache.set(key, route);
            return route;
        } catch {
            return null;
        } finally {
            routeInflight.delete(key);
        }
    });
    routeInflight.set(key, req);
    return req;
}
