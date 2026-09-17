/**
 * Zoom for an embedded page. (issue #667)
 *
 * A cross-origin document cannot be styled from the host, so the only lever the
 * widget has is the frame element itself: scale it down and hand it a
 * proportionally larger box, and the embedded page lays out for that larger
 * viewport before it is painted into the widget — which is what "zoom out until
 * it fits" means for a page that brings its own breakpoints. `transform` does the
 * scaling rather than the `zoom` property, because the inverse width/height keeps
 * the result filling the widget exactly in every engine.
 *
 * Two places set the level, on purpose — the request asked for both:
 * - `iframeZoom` in the widget config is the level every device starts at.
 * - the controls in the frontend store a level per device (localStorage), which
 *   wins on that device only. A phone and a wall tablet need different numbers
 *   for the same page, and the config cannot hold two.
 */

export const IFRAME_ZOOM_MIN = 25;
export const IFRAME_ZOOM_MAX = 400;
export const IFRAME_ZOOM_DEFAULT = 100;

/** The ladder the +/− buttons walk — the stops a browser's own zoom uses. */
export const IFRAME_ZOOM_STOPS = [25, 33, 50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200, 250, 300, 400] as const;

/** Any stored/typed value boiled down to a usable percentage. */
export function clampIframeZoom(value: unknown): number {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n) || n <= 0) return IFRAME_ZOOM_DEFAULT;
    return Math.min(IFRAME_ZOOM_MAX, Math.max(IFRAME_ZOOM_MIN, Math.round(n)));
}

/**
 * The level actually shown: the device's own overrides the configured one, but
 * only while the controls that produced it are switched on — turning them off is
 * how an admin takes the fleet back to one level.
 */
export function resolveIframeZoom(
    configured: unknown,
    deviceZoom: number | null | undefined,
    controlsEnabled: boolean,
): number {
    if (controlsEnabled && deviceZoom != null) return clampIframeZoom(deviceZoom);
    return clampIframeZoom(configured);
}

/** Next stop up (`dir` 1) or down (−1) from wherever a pinch left the level. */
export function stepIframeZoom(current: number, dir: 1 | -1): number {
    const now = clampIframeZoom(current);
    if (dir > 0) return IFRAME_ZOOM_STOPS.find((s) => s > now) ?? IFRAME_ZOOM_MAX;
    return [...IFRAME_ZOOM_STOPS].reverse().find((s) => s < now) ?? IFRAME_ZOOM_MIN;
}

/**
 * Size + transform for the frame element. At 100 % nothing is written at all, so
 * an unzoomed widget carries no transform — a scaled frame is its own stacking
 * and rasterisation context, which a video stream should not pay for by default.
 */
export function iframeZoomStyle(percent: number): {
    width: string;
    height: string;
    transform?: string;
    transformOrigin?: string;
} {
    const zoom = clampIframeZoom(percent);
    if (zoom === IFRAME_ZOOM_DEFAULT) return { width: '100%', height: '100%' };
    const inverse = `${Math.round((10000 / zoom) * 1000) / 1000}%`;
    return {
        width: inverse,
        height: inverse,
        transform: `scale(${zoom / 100})`,
        transformOrigin: 'top left',
    };
}

interface PointLike {
    clientX: number;
    clientY: number;
}

export function pinchDistance(a: PointLike, b: PointLike): number {
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

/** Level for a pinch that started at `startDistance` and now spans `distance`. */
export function zoomFromPinch(base: number, startDistance: number, distance: number): number {
    if (!(startDistance > 0) || !(distance > 0)) return clampIframeZoom(base);
    return clampIframeZoom((clampIframeZoom(base) * distance) / startDistance);
}

// ── Per-device levels ────────────────────────────────────────────────────────
// A plain localStorage key, deliberately outside the managed set in
// store/persistManager: what a device zooms to is the one setting that must NOT
// travel to ioBroker and back out to every other screen.

export const IFRAME_ZOOM_STORAGE_KEY = 'aura-iframe-zoom';

function storage(): Storage | null {
    try {
        return typeof localStorage === 'undefined' ? null : localStorage;
    } catch {
        return null; // Safari in private mode throws on access alone.
    }
}

/** Parses the stored map defensively — a broken blob must not blank the widget. */
export function parseDeviceZoomMap(raw: string | null): Record<string, number> {
    if (!raw) return {};
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return {};
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, number> = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof value === 'number' && Number.isFinite(value)) out[id] = clampIframeZoom(value);
    }
    return out;
}

export function readDeviceZoom(widgetId: string): number | null {
    const store = storage();
    if (!store) return null;
    const map = parseDeviceZoomMap(store.getItem(IFRAME_ZOOM_STORAGE_KEY));
    return widgetId in map ? map[widgetId] : null;
}

/** `null` drops the override, putting the widget back on the configured level. */
export function writeDeviceZoom(widgetId: string, percent: number | null): void {
    const store = storage();
    if (!store) return;
    const map = parseDeviceZoomMap(store.getItem(IFRAME_ZOOM_STORAGE_KEY));
    if (percent == null) delete map[widgetId];
    else map[widgetId] = clampIframeZoom(percent);
    try {
        if (Object.keys(map).length === 0) store.removeItem(IFRAME_ZOOM_STORAGE_KEY);
        else store.setItem(IFRAME_ZOOM_STORAGE_KEY, JSON.stringify(map));
    } catch {
        /* quota or private mode — the level simply does not survive the reload */
    }
}
