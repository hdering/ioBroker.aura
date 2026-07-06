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

/** A quick-access chip that recenters the map on a configured position.
 *  The target position resolves the same way a marker does (JSON DP, two DPs,
 *  static coordinates, or a geocoded address). `mode` defaults to 'static' so
 *  chips created before modes existed (bare lat/lon) keep working. */
export interface MapQuickView {
    id: string;
    label?: string;
    mode?: MapMarkerMode;
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
    /** Target zoom when jumping; keeps the current zoom when unset. */
    zoom?: number;
    emoji?: string;
    color?: string;
}

/** Where the quick-access chips are rendered relative to the map. */
export type MapChipsPosition = 'overlay' | 'below';

/** Which corner the overlay chips are anchored to (only for `chipsPosition === 'overlay'`). */
export type MapChipsCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

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
    quickViews?: MapQuickView[];
    chipsPosition?: MapChipsPosition;
    chipsCorner?: MapChipsCorner;
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

/** The position-relevant subset shared by markers and quick-access chips. */
interface PositionSpec {
    mode?: MapMarkerMode;
    jsonDp?: string;
    latPath?: string;
    lonPath?: string;
    latDp?: string;
    lonDp?: string;
    lat?: number;
    lon?: number;
    address?: string;
}

/**
 * Resolves live coordinates from a spec's datapoint(s)/address/static fields.
 * All three DP hooks are always called (with '' for unused modes) so the hook
 * count stays constant even when the mode changes via the config editor.
 * Shared by both markers and quick-access chips.
 */
function useResolvedPosition(spec: PositionSpec): LatLon | null {
    const mode = spec.mode ?? 'static';
    const jsonState = useDatapoint(mode === 'json' ? (spec.jsonDp ?? '') : '');
    const latDp = useDatapoint(mode === 'latlon' ? (spec.latDp ?? '') : '');
    const lonDp = useDatapoint(mode === 'latlon' ? (spec.lonDp ?? '') : '');

    // Address mode: geocode the free-text address (cached) into coordinates.
    const [geoPos, setGeoPos] = useState<LatLon | null>(null);
    useEffect(() => {
        if (mode !== 'address' || !spec.address?.trim()) {
            setGeoPos(null);
            return;
        }
        let cancelled = false;
        const address = spec.address;
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
    }, [mode, spec.address]);

    return useMemo<LatLon | null>(() => {
        if (mode === 'static') {
            return Number.isFinite(spec.lat) && Number.isFinite(spec.lon)
                ? [spec.lat as number, spec.lon as number]
                : null;
        }
        if (mode === 'latlon') {
            if (latDp.value == null || latDp.value === '' || lonDp.value == null || lonDp.value === '') return null;
            const la = Number(latDp.value);
            const lo = Number(lonDp.value);
            return Number.isFinite(la) && Number.isFinite(lo) ? [la, lo] : null;
        }
        if (mode === 'address') {
            return geoPos;
        }
        // json
        return extractLatLon(jsonState.state?.val, spec.latPath, spec.lonPath);
    }, [mode, spec.lat, spec.lon, spec.latPath, spec.lonPath, jsonState.state?.val, latDp.value, lonDp.value, geoPos]);
}

/** Resolves a chip's live position (no visible output) and reports it upward. */
function QuickViewResolver({
    view,
    onResolve,
}: {
    view: MapQuickView;
    onResolve: (id: string, pos: LatLon | null) => void;
}) {
    const pos = useResolvedPosition(view);
    useEffect(() => {
        onResolve(view.id, pos);
        return () => onResolve(view.id, null);
    }, [view.id, pos, onResolve]);
    return null;
}

/**
 * Resolves a single marker's live coordinates and renders a Leaflet marker.
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
    const pos = useResolvedPosition(marker);

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
    // ~0.1 m precision: coarser rounding (e.g. 4 places ≈ 11 m) made a slowly
    // moving marker (a robot mower, a car crawling in a yard) never change the
    // key, so the effect never re-ran and the map stopped following it.
    const key = list.map((p) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`).join('|');
    useEffect(() => {
        if (!enabled || list.length === 0) return;
        let cancelled = false;
        // Whether a fit has already succeeded for the CURRENT positions (this effect
        // run). Once true we stop re-fitting on resize so a user/grid resize doesn't
        // abort in-flight tiles and blank the map. Reset whenever `key` changes.
        let fitted = false;
        const fit = () => {
            if (cancelled || fitted || !map) return;
            // Guard against a not-yet-laid-out container: getSize() returns 0 (or NaN)
            // before layout, and a NaN/0 size or zoom makes Leaflet try to load an
            // infinite number of tiles and throw. Leave `fitted` false so the resize
            // listener below re-attempts once the container has a real size.
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
                fitted = true;
            } catch {
                // Transient layout/zoom race — leave `fitted` false so the next
                // resize (or a positions change) re-attempts.
            }
        };
        // Fit once the map is ready and again whenever marker positions change (the
        // effect re-runs because `key` is in the deps). Also re-attempt on 'resize'
        // UNTIL the first successful fit: a position resolved from the prefetch cache
        // before the grid lays the container out makes the initial fit bail on a
        // 0-size container; without this retry the map would stay on the default
        // center until the next position change (looks like "map never centers").
        // After the first success `fitted` short-circuits further resize fits, so a
        // normal user/grid resize still does NOT re-fit (which would abort tiles).
        map.whenReady(fit);
        map.on('resize', fit);
        return () => {
            cancelled = true;
            map.off('resize', fit);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, enabled, maxZoom]);
    return null;
}

/** Recenters the map when a quick-access chip is clicked. Re-runs on every
 *  click (the `nonce` changes) even if the same chip is tapped twice. */
function FlyToController({ target }: { target: { pos: LatLon; zoom?: number; nonce: number } | null }) {
    const map = useMap();
    useEffect(() => {
        if (!target) return;
        // Guard against a not-yet-laid-out container (getSize() ~0) which would
        // make Leaflet try to load an infinite number of tiles and throw.
        const size = map.getSize();
        if (!size.x || !size.y) return;
        const cur = map.getZoom();
        const z = Number.isFinite(target.zoom) ? (target.zoom as number) : Number.isFinite(cur) ? cur : DEFAULT_ZOOM;
        try {
            map.flyTo(target.pos, z, { duration: 0.6 });
        } catch {
            // Transient layout/zoom race — the next click will retry.
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [target?.nonce]);
    return null;
}

/** A single quick-access chip pill. */
function QuickChip({ view, onJump }: { view: MapQuickView; onJump: (v: MapQuickView) => void }) {
    const color = view.color || 'var(--accent)';
    return (
        <button
            type="button"
            onClick={(e) => {
                e.stopPropagation();
                onJump(view);
            }}
            className="flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium whitespace-nowrap shrink-0 hover:opacity-85 transition-opacity"
            style={{
                background: 'var(--widget-bg)',
                color: 'var(--text-primary)',
                border: `1px solid ${color}`,
                boxShadow: '0 1px 3px rgba(0,0,0,.25)',
                cursor: 'pointer',
            }}
            title={view.label || 'Position'}
        >
            {view.emoji && <span style={{ lineHeight: 1 }}>{view.emoji}</span>}
            <span className="truncate max-w-[120px]">{view.label || 'Position'}</span>
        </button>
    );
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

    // Quick-access chips: show every configured entry so the user always gets
    // visual feedback; the jump itself is guarded against missing coordinates.
    const quickViews = useMemo<MapQuickView[]>(() => (Array.isArray(o.quickViews) ? o.quickViews : []), [o.quickViews]);
    const chipsPosition: MapChipsPosition = o.chipsPosition === 'below' ? 'below' : 'overlay';
    const chipsCorner: MapChipsCorner = (['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const).includes(
        o.chipsCorner as MapChipsCorner,
    )
        ? (o.chipsCorner as MapChipsCorner)
        : 'top-right';
    const hasChips = quickViews.length > 0;
    const chipsBelow = hasChips && chipsPosition === 'below';

    // Live positions resolved for each chip (from DP / address / static coords).
    const [chipPositions, setChipPositions] = useState<Record<string, LatLon>>({});
    const onResolveChip = useCallback((id: string, pos: LatLon | null) => {
        setChipPositions((prev) => {
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

    const [flyTarget, setFlyTarget] = useState<{ pos: LatLon; zoom?: number; nonce: number } | null>(null);
    const onJump = useCallback(
        (v: MapQuickView) => {
            const pos = chipPositions[v.id];
            if (!pos) return; // position not resolved yet (DP empty, address pending, coords missing)
            const z = Number(v.zoom);
            setFlyTarget((prev) => ({
                pos,
                zoom: Number.isFinite(z) ? z : undefined,
                nonce: (prev?.nonce ?? 0) + 1,
            }));
        },
        [chipPositions],
    );

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
    // In follow mode `o.zoom` is a MAX-zoom cap for the auto-fit, not the initial
    // view. Opening the container at that cap (often 19) shows an unrecognisable,
    // fully-zoomed-in patch of the default center until the first position
    // resolves — which reads as "the map takes forever to show my position".
    // Start from a sensible overview and let FollowMarkers zoom in once a
    // position is known. With follow off, `zoom` is the fixed user zoom.
    const initialZoom = followMarkers ? DEFAULT_ZOOM : zoom;

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
                // When chips sit below the map, lay out map + chip bar as a column.
                display: chipsBelow ? 'flex' : undefined,
                flexDirection: chipsBelow ? 'column' : undefined,
            }}
        >
            {/* Non-visual resolvers keep each chip's live position up to date. */}
            {quickViews.map((v) => (
                <QuickViewResolver key={v.id} view={v} onResolve={onResolveChip} />
            ))}

            <div
                style={
                    chipsBelow ? { position: 'relative', flex: 1, minHeight: 0 } : { position: 'absolute', inset: 0 }
                }
            >
                <MapContainer
                    center={center}
                    zoom={initialZoom}
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
                    <FlyToController target={flyTarget} />
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

                {/* Overlay chips float over the map, anchored to the configured corner.
                    The top-left corner is nudged right (non-edit mode) to clear the zoom control. */}
                {hasChips &&
                    chipsPosition === 'overlay' &&
                    (() => {
                        const isTop = chipsCorner === 'top-left' || chipsCorner === 'top-right';
                        const isLeft = chipsCorner === 'top-left' || chipsCorner === 'bottom-left';
                        const cornerStyle: React.CSSProperties = {
                            position: 'absolute',
                            [isTop ? 'top' : 'bottom']: 6,
                            // Clear the top-left zoom control only when the chips sit there.
                            [isLeft ? 'left' : 'right']: isLeft && chipsCorner === 'top-left' && !editMode ? 44 : 6,
                            maxWidth: 'calc(100% - 12px)',
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: 4,
                            justifyContent: isLeft ? 'flex-start' : 'flex-end',
                            zIndex: 1000,
                            pointerEvents: 'none',
                        };
                        return (
                            <div style={cornerStyle}>
                                {/* Chips themselves re-enable pointer events; the wrapper stays click-through. */}
                                {quickViews.map((v) => (
                                    <div key={v.id} style={{ pointerEvents: 'auto' }}>
                                        <QuickChip view={v} onJump={onJump} />
                                    </div>
                                ))}
                            </div>
                        );
                    })()}
            </div>

            {/* Chip bar below the map (camera-widget style). */}
            {chipsBelow && (
                <div
                    style={{
                        flexShrink: 0,
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 6,
                        padding: 6,
                        overflow: 'auto',
                        background: 'var(--widget-bg)',
                        borderTop: '1px solid var(--app-border)',
                    }}
                >
                    {quickViews.map((v) => (
                        <QuickChip key={v.id} view={v} onJump={onJump} />
                    ))}
                </div>
            )}
        </div>
    );
}
