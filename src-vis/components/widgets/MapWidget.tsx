import { useCallback, useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useDatapoint } from '../../hooks/useDatapoint';
import type { WidgetProps } from '../../types';
import { extractLatLon, haversineKm, formatDistance, type LatLon } from '../../utils/geo';

export type MapMarkerMode = 'json' | 'latlon' | 'static';

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
    emoji?: string;
    color?: string;
}

interface MapOptions {
    markers?: MapMarker[];
    center?: LatLon;
    zoom?: number;
    followMarkers?: boolean;
    tileUrl?: string;
    tileAttribution?: string;
    showDistance?: boolean;
    homeMarkerId?: string;
}

const DEFAULT_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const DEFAULT_ATTRIBUTION = '&copy; OpenStreetMap';
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
        // json
        return extractLatLon(jsonState.state?.val, marker.latPath, marker.lonPath);
    }, [marker, jsonState.state?.val, latDp.value, lonDp.value]);

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

/** Auto-fits the view to all resolved markers when "follow markers" is enabled. */
function FollowMarkers({ positions, enabled }: { positions: Record<string, LatLon>; enabled: boolean }) {
    const map = useMap();
    const list = Object.values(positions);
    const key = list.map((p) => `${p[0].toFixed(4)},${p[1].toFixed(4)}`).join('|');
    useEffect(() => {
        if (!enabled || list.length === 0) return;
        if (list.length === 1) {
            map.setView(list[0], Math.max(map.getZoom(), 13));
        } else {
            map.fitBounds(L.latLngBounds(list as L.LatLngTuple[]), { padding: [30, 30], maxZoom: 16 });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, enabled]);
    return null;
}

export function MapWidget({ config, editMode }: WidgetProps) {
    const o = (config.options ?? {}) as MapOptions;
    const markers = useMemo<MapMarker[]>(() => (Array.isArray(o.markers) ? o.markers : []), [o.markers]);
    const tileUrl = o.tileUrl || DEFAULT_TILE_URL;
    const attribution = o.tileAttribution ?? DEFAULT_ATTRIBUTION;
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
    const center = o.center ?? DEFAULT_CENTER;
    const zoom = o.zoom ?? DEFAULT_ZOOM;

    return (
        <div style={{ position: 'absolute', inset: 0, borderRadius: 'inherit', overflow: 'hidden' }}>
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
                attributionControl
            >
                <TileLayer url={tileUrl} attribution={attribution} />
                <ResizeHandler />
                <FollowMarkers positions={positions} enabled={followMarkers} />
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
    );
}
