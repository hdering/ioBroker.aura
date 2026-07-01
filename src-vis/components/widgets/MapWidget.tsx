import { useCallback, useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useDatapoint } from '../../hooks/useDatapoint';
import type { WidgetProps } from '../../types';
import { extractLatLon, geocodeAddress, haversineKm, formatDistance, type LatLon } from '../../utils/geo';

export type MapMarkerMode = 'json' | 'latlon' | 'static' | 'address';

export interface MapMarker {
    id: string;
    label?: string;
    mode: MapMarkerMode;
    /** JSON / object DP holding the position (mode = 'json'). */
    jsonDp?: string;
    latPath?: string;
    lonPath?: string;
    /** Separate numeric DPs (mode = 'latlon'). */
    latDp?: string;
    lonDp?: string;
    /** Fixed coordinates (mode = 'static'). */
    lat?: number;
    lon?: number;
    /** Free-text address, geocoded via OpenStreetMap (mode = 'address'). */
    address?: string;
    emoji?: string;
    color?: string;
}

export type MapStyle = 'standard' | 'satellite' | 'terrain';

interface MapOptions {
    markers?: MapMarker[];
    center?: LatLon;
    zoom?: number;
    followMarkers?: boolean;
    mapStyle?: MapStyle;
    /** Custom tile URL — overrides mapStyle when set. */
    tileUrl?: string;
    tileAttribution?: string;
    showDistance?: boolean;
    homeMarkerId?: string;
}

/** Free tile presets (no API key required). */
export const TILE_PRESETS: Record<MapStyle, { url: string; attribution: string; maxZoom?: number }> = {
    standard: {
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: '&copy; OpenStreetMap',
    },
    satellite: {
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        attribution: '&copy; Esri, Maxar, Earthstar Geographics',
    },
    terrain: {
        url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
        attribution: '&copy; OpenStreetMap, SRTM &middot; OpenTopoMap',
        maxZoom: 17,
    },
};

const DEFAULT_CENTER: LatLon = [51.1657, 10.4515]; // Germany
const DEFAULT_ZOOM = 6;

/** Build an emoji/dot pin as a Leaflet divIcon (avoids broken default marker PNG paths). */
function buildIcon(marker: MapMarker): L.DivIcon {
    const color = marker.color || '#2563eb';
    const inner = marker.emoji
        ? `<span style="font-size:16px;line-height:1">${marker.emoji}</span>`
        : '<span style="display:block;width:10px;height:10px;border-radius:50%;background:#fff"></span>';
    const html = `
        <div style="
            width:30px;height:30px;border-radius:50% 50% 50% 0;
            transform:rotate(-45deg);
            background:${color};
            border:2px solid #fff;
            box-shadow:0 1px 3px rgba(0,0,0,.4);
            display:flex;align-items:center;justify-content:center;">
            <div style="transform:rotate(45deg);display:flex;align-items:center;justify-content:center;">${inner}</div>
        </div>`;
    return L.divIcon({
        html,
        className: 'aura-map-pin',
        iconSize: [30, 30],
        iconAnchor: [15, 30],
        tooltipAnchor: [0, -28],
    });
}

/**
 * Resolves a single marker's live coordinates from its datapoint(s) and renders a
 * Leaflet marker. All three hooks are always called (with '' for unused modes) so the
 * hook count stays constant even when the marker mode changes via the config editor.
 */
function MarkerLayer({
    marker,
    homePos,
    isHome,
    showDistance,
    onResolve,
}: {
    marker: MapMarker;
    homePos: LatLon | null;
    isHome: boolean;
    showDistance: boolean;
    onResolve: (id: string, pos: LatLon | null) => void;
}) {
    const jsonState = useDatapoint(marker.mode === 'json' ? (marker.jsonDp ?? '') : '');
    const latDp = useDatapoint(marker.mode === 'latlon' ? (marker.latDp ?? '') : '');
    const lonDp = useDatapoint(marker.mode === 'latlon' ? (marker.lonDp ?? '') : '');

    // Address mode: geocode the free-text address (cached) into coordinates.
    const [geoPos, setGeoPos] = useState<LatLon | null>(null);
    useEffect(() => {
        if (marker.mode !== 'address' || !marker.address?.trim()) {
            setGeoPos(null);
            return;
        }
        let cancelled = false;
        const address = marker.address;
        // Debounce so typing an address in the editor doesn't fire a request per keystroke.
        const handle = setTimeout(() => {
            void geocodeAddress(address).then((p) => {
                if (!cancelled) setGeoPos(p);
            });
        }, 600);
        return () => {
            cancelled = true;
            clearTimeout(handle);
        };
    }, [marker.mode, marker.address]);

    const pos = useMemo<LatLon | null>(() => {
        if (marker.mode === 'static') {
            return Number.isFinite(marker.lat) && Number.isFinite(marker.lon)
                ? [marker.lat as number, marker.lon as number]
                : null;
        }
        if (marker.mode === 'latlon') {
            if (latDp.value == null || latDp.value === '' || lonDp.value == null || lonDp.value === '') return null;
            const la = Number(latDp.value);
            const lo = Number(lonDp.value);
            return Number.isFinite(la) && Number.isFinite(lo) ? [la, lo] : null;
        }
        if (marker.mode === 'address') {
            return geoPos;
        }
        // json
        return extractLatLon(jsonState.state?.val, marker.latPath, marker.lonPath);
    }, [marker, jsonState.state?.val, latDp.value, lonDp.value, geoPos]);

    useEffect(() => {
        onResolve(marker.id, pos);
        return () => onResolve(marker.id, null);
    }, [marker.id, pos, onResolve]);

    // Only the visual fields affect the icon — rebuilding on every marker change is wasteful.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const icon = useMemo(() => buildIcon(marker), [marker.emoji, marker.color]);

    if (!pos) return null;

    const dist = showDistance && homePos && !isHome ? haversineKm(homePos, pos) : null;

    return (
        <Marker position={pos} icon={icon}>
            {(marker.label || dist != null) && (
                <Tooltip direction="top" offset={[0, -4]}>
                    {marker.label && <div style={{ fontWeight: 600 }}>{marker.label}</div>}
                    {dist != null && <div>{formatDistance(dist)}</div>}
                </Tooltip>
            )}
        </Marker>
    );
}

/** Keeps the Leaflet canvas sized to the (resizable) widget body. */
function ResizeHandler() {
    const map = useMap();
    useEffect(() => {
        const container = map.getContainer();
        const ro = new ResizeObserver(() => map.invalidateSize());
        ro.observe(container);
        // Initial fix-up after first layout.
        const t = setTimeout(() => map.invalidateSize(), 0);
        return () => {
            ro.disconnect();
            clearTimeout(t);
        };
    }, [map]);
    return null;
}

/** Auto-fits the view to all resolved markers when "follow markers" is enabled.
 *  `maxZoom`, when configured, caps how far the auto-fit zooms in (and is the
 *  target zoom for the single-marker case); undefined keeps the built-in defaults. */
function FollowMarkers({
    positions,
    enabled,
    maxZoom,
}: {
    positions: Record<string, LatLon>;
    enabled: boolean;
    maxZoom?: number;
}) {
    const map = useMap();
    const list = Object.values(positions);
    const key = list.map((p) => `${p[0].toFixed(4)},${p[1].toFixed(4)}`).join('|');
    useEffect(() => {
        if (!enabled || list.length === 0) return;
        let cancelled = false;
        const fit = () => {
            if (cancelled || !map) return;
            // Guard against a not-yet-laid-out container: getSize() returns 0 (or NaN)
            // before layout, and a NaN/0 size or zoom makes Leaflet try to load an
            // infinite number of tiles and throw.
            const size = map.getSize();
            if (!size.x || !size.y) return;
            const hasMax = Number.isFinite(maxZoom);
            try {
                if (list.length === 1) {
                    // Prefer the configured zoom; otherwise keep the previous "zoom in
                    // to at least 13" behavior so a lone marker isn't lost in the world view.
                    const cur = map.getZoom();
                    const z = hasMax ? (maxZoom as number) : Number.isFinite(cur) ? Math.max(cur, 13) : DEFAULT_ZOOM;
                    map.setView(list[0], z);
                } else {
                    const bounds = L.latLngBounds(list as L.LatLngTuple[]);
                    if (bounds.isValid())
                        map.fitBounds(bounds, { padding: [30, 30], maxZoom: hasMax ? (maxZoom as number) : 16 });
                }
            } catch {
                // Transient layout/zoom race — re-fit happens when positions change.
            }
        };
        // Fit once the map is ready and again whenever marker positions change (the
        // effect re-runs because `key` is in the deps). Deliberately NOT tied to the
        // map 'resize' event — re-setting the view on every resize aborts in-flight
        // tile requests and leaves the map blank.
        map.whenReady(fit);
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, enabled, maxZoom]);
    return null;
}

export function MapWidget({ config, editMode }: WidgetProps) {
    const o = (config.options ?? {}) as MapOptions;
    const markers = useMemo<MapMarker[]>(() => (Array.isArray(o.markers) ? o.markers : []), [o.markers]);
    const preset = TILE_PRESETS[o.mapStyle ?? 'standard'] ?? TILE_PRESETS.standard;
    // A custom tile URL always wins; otherwise use the selected style preset.
    const tileUrl = o.tileUrl || preset.url;
    const attribution = o.tileUrl ? (o.tileAttribution ?? '') : preset.attribution;
    const followMarkers = o.followMarkers ?? true;
    const showDistance = !!o.showDistance;

    const [positions, setPositions] = useState<Record<string, LatLon>>({});
    const onResolve = useCallback((id: string, pos: LatLon | null) => {
        setPositions((prev) => {
            if (!pos) {
                if (!(id in prev)) return prev;
                const next = { ...prev };
                delete next[id];
                return next;
            }
            const cur = prev[id];
            if (cur && cur[0] === pos[0] && cur[1] === pos[1]) return prev;
            return { ...prev, [id]: pos };
        });
    }, []);

    const homePos = o.homeMarkerId ? (positions[o.homeMarkerId] ?? null) : null;
    // Coerce to finite values — a NaN center/zoom (e.g. from a half-edited config)
    // would put Leaflet into a broken NaN state.
    const rawCenter = o.center;
    const center: LatLon =
        Array.isArray(rawCenter) && Number.isFinite(rawCenter[0]) && Number.isFinite(rawCenter[1])
            ? [rawCenter[0], rawCenter[1]]
            : DEFAULT_CENTER;
    const zoom = Number.isFinite(o.zoom) ? (o.zoom as number) : DEFAULT_ZOOM;
    // Only pass a follow-mode zoom cap when the user actually configured one, so
    // an unset zoom keeps the built-in auto-fit behavior.
    const followMaxZoom = Number.isFinite(o.zoom) ? (o.zoom as number) : undefined;

    return (
        <div
            style={{
                position: 'absolute',
                inset: 0,
                borderRadius: 'inherit',
                overflow: 'hidden',
                // Numeric z-index establishes a stacking context so Leaflet's internal
                // panes (z-index up to ~700) stay contained and don't paint over the
                // frame's edit chrome (z-10/20). In edit mode let clicks/drag pass
                // through so the "edit widget" button and grid dragging keep working.
                zIndex: 0,
                pointerEvents: editMode ? 'none' : 'auto',
            }}
        >
            {
                <div style={{ position: 'absolute', inset: 0 }}>
                    <MapContainer
                        center={center}
                        zoom={zoom}
                        style={{ width: '100%', height: '100%' }}
                        // Disable interaction in edit mode so the widget can be dragged/resized on the grid.
                        dragging={!editMode}
                        scrollWheelZoom={!editMode}
                        doubleClickZoom={!editMode}
                        touchZoom={!editMode}
                        zoomControl={!editMode}
                    >
                        {/* No key here on purpose: react-leaflet updates the url in place via
                        setUrl. Remounting the layer triggers Leaflet onAdd → _resetView,
                        which can throw "infinite number of tiles" and crash the tree. */}
                        <TileLayer url={tileUrl} attribution={attribution} />
                        <ResizeHandler />
                        <FollowMarkers positions={positions} enabled={followMarkers} maxZoom={followMaxZoom} />
                        {markers.map((m) => (
                            <MarkerLayer
                                key={m.id}
                                marker={m}
                                homePos={homePos}
                                isHome={m.id === o.homeMarkerId}
                                showDistance={showDistance}
                                onResolve={onResolve}
                            />
                        ))}
                    </MapContainer>
                </div>
            }
        </div>
    );
}
