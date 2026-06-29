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
