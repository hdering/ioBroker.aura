/**
 * Geo helpers for the Map widget.
 */

export type LatLon = [number, number];

const EARTH_RADIUS_KM = 6371;

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/**
 * Great-circle distance between two [lat, lon] points in kilometres (haversine).
 */
export function haversineKm(a: LatLon, b: LatLon): number {
    const dLat = toRad(b[0] - a[0]);
    const dLon = toRad(b[1] - a[1]);
    const lat1 = toRad(a[0]);
    const lat2 = toRad(b[0]);
    const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
    return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Format a km distance compactly: `850 m`, `3.2 km`, `27 km`. */
export function formatDistance(km: number): string {
    if (!Number.isFinite(km)) return '';
    if (km < 1) return `${Math.round(km * 1000)} m`;
    if (km < 10) return `${km.toFixed(1)} km`;
    return `${Math.round(km)} km`;
}

/** Coerce a value to a finite number or return null. */
function num(v: unknown): number | null {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v === 'string' && v.trim() !== '') {
        const n = Number(v.replace(',', '.'));
        return Number.isFinite(n) ? n : null;
    }
    return null;
}

// ── Geocoding (address → coordinates) ──────────────────────────────────────
// Resolved via OpenStreetMap Nominatim (no API key). Results are cached per
// address for the session and in-flight requests are de-duplicated so the same
// address is never geocoded twice — keeping us well within Nominatim's usage
// policy for the handful of static addresses a dashboard typically holds.
const geocodeCache = new Map<string, LatLon | null>();
const geocodeInflight = new Map<string, Promise<LatLon | null>>();

// Nominatim allows at most ~1 request/second. Serialize all geocode requests
// through a single chain with a minimum gap so concurrent markers (or a re-render
// burst) never trip its 429 rate limiter.
const MIN_GAP_MS = 1100;
let geocodeChain: Promise<unknown> = Promise.resolve();
let lastGeocodeAt = 0;

function schedule<T>(fn: () => Promise<T>): Promise<T> {
    const run = geocodeChain.then(async () => {
        const wait = lastGeocodeAt + MIN_GAP_MS - Date.now();
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        lastGeocodeAt = Date.now();
        return fn();
    });
    // Keep the chain alive regardless of individual failures.
    geocodeChain = run.then(
        () => undefined,
        () => undefined,
    );
    return run;
}

export async function geocodeAddress(address: string): Promise<LatLon | null> {
    const q = address.trim();
    if (!q) return null;
    if (geocodeCache.has(q)) return geocodeCache.get(q) ?? null;
    const existing = geocodeInflight.get(q);
    if (existing) return existing;

    const req = schedule(async (): Promise<LatLon | null> => {
        try {
            // Nominatim sends no CORS headers and requires an identifying User-Agent,
            // so go through Aura's same-origin /proxy (available in dev and prod) which
            // adds the User-Agent and pipes the JSON response through unchanged.
            const target = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`;
            const res = await fetch(`/proxy?url=${encodeURIComponent(target)}`);
            // Don't cache transient failures (e.g. 429) — allow a later retry.
            if (!res.ok) return null;
            const data = (await res.json()) as Array<{ lat?: string; lon?: string }>;
            const hit = Array.isArray(data) ? data[0] : null;
            const lat = hit ? Number(hit.lat) : NaN;
            const lon = hit ? Number(hit.lon) : NaN;
            const pos: LatLon | null = Number.isFinite(lat) && Number.isFinite(lon) ? [lat, lon] : null;
            geocodeCache.set(q, pos); // cache resolved hits and confirmed "no match"
            return pos;
        } catch {
            return null;
        } finally {
            geocodeInflight.delete(q);
        }
    });

    geocodeInflight.set(q, req);
    return req;
}

const LAT_KEYS = ['lat', 'latitude', 'Latitude', 'LAT'];
const LON_KEYS = ['lon', 'lng', 'long', 'longitude', 'Longitude', 'LON', 'LNG'];

/**
 * Extract a [lat, lon] pair from an arbitrary datapoint value.
 *
 * Accepts:
 *  - an object `{ lat, lon }` (or latitude/longitude, lng, …)
 *  - a JSON string of such an object
 *  - a `"lat,lon"` / `"lat;lon"` string
 *  - a `[lat, lon]` array
 *
 * Optional `latPath`/`lonPath` override the auto-detected keys for nested objects.
 */
export function extractLatLon(raw: unknown, latPath?: string, lonPath?: string): LatLon | null {
    let val: unknown = raw;

    if (typeof val === 'string') {
        const s = val.trim();
        // "lat,lon" or "lat;lon"
        if (/^-?\d+(\.\d+)?\s*[,;]\s*-?\d+(\.\d+)?$/.test(s)) {
            const [a, b] = s.split(/[,;]/).map((p) => Number(p.trim()));
            return Number.isFinite(a) && Number.isFinite(b) ? [a, b] : null;
        }
        try {
            val = JSON.parse(s);
        } catch {
            return null;
        }
    }

    if (Array.isArray(val) && val.length >= 2) {
        const a = num(val[0]);
        const b = num(val[1]);
        return a !== null && b !== null ? [a, b] : null;
    }

    if (val && typeof val === 'object') {
        const obj = val as Record<string, unknown>;
        const pick = (paths: string[], explicit?: string): number | null => {
            if (explicit) {
                const direct = explicit.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], obj);
                const n = num(direct);
                if (n !== null) return n;
            }
            for (const k of paths) {
                const n = num(obj[k]);
                if (n !== null) return n;
            }
            return null;
        };
        const lat = pick(LAT_KEYS, latPath);
        const lon = pick(LON_KEYS, lonPath);
        return lat !== null && lon !== null ? [lat, lon] : null;
    }

    return null;
}
