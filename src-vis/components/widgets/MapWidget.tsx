import { useCallback, useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Tooltip, Polyline, CircleMarker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import { useDatapoint } from '../../hooks/useDatapoint';
import { getHistoryDirect, getObjectDirect, isHistoryStubbed, useIoBroker } from '../../hooks/useIoBroker';
import { detectHistoryAdapters } from '../../hooks/useChartHistory';
import { useT, type Language, type TranslationKey } from '../../i18n';
import type { WidgetProps } from '../../types';
import {
    extractLatLon,
    geocodeAddress,
    haversineKm,
    formatDistance,
    reverseGeocode,
    type LatLon,
    type ReverseAddress,
} from '../../utils/geo';
import {
    appendLivePoint,
    dayRange,
    detectSegments,
    endBearing,
    filterDay,
    nearestPlace,
    fetchRoute,
    formatDuration,
    historyToTrack,
    parseTrack,
    routeKey,
    trackBounds,
    trackLengthKm,
    normalizeProfile,
    type RouteProfile,
    type ParsedTrack,
    type RouteResult,
    type TrackPoint,
    type TrackSegment,
} from '../../utils/mapTrack';
import { useConfigStore } from '../../store/configStore';

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

/** Where a line's points come from: a route computed between two markers (#790),
 *  a points list in a datapoint, or the history of a position datapoint (#410). */
export type MapLineSource = 'route' | 'json' | 'history';

/** A line drawn on the map — a computed route or a recorded track. */
export interface MapLine {
    id: string;
    /** Name in the info box and tooltip (default: the track's name, or "start → end" for routes). */
    label?: string;
    source: MapLineSource;
    /** Line colour (default: lineColor of the track value, else blue for routes and red for tracks). */
    color?: string;
    /** Stroke width in px (default 4). */
    width?: number;
    /** Route: start marker (id from `markers`). */
    fromMarkerId?: string;
    /** Route: end marker (id from `markers`). */
    toMarkerId?: string;
    /** Route: car, bike or foot (default car). */
    profile?: RouteProfile;
    /** json: DP holding the points list; history: the position DP whose history is drawn. */
    dp?: string;
    /** json: path to the points array inside the DP value (auto-detected when empty). */
    pointsPath?: string;
    /** json/history: key of the latitude inside each point (auto-detected when empty). */
    latPath?: string;
    /** json/history: key of the longitude inside each point (auto-detected when empty). */
    lonPath?: string;
    /** history: adapter instance (first logging adapter of the DP when empty). */
    historyInstance?: string;
    /** history: time window in hours (default 24). */
    historyHours?: number;
    /** history: newest N points at most (default 500). */
    maxPoints?: number;
    /** Draw a dot per recorded point; tapping it shows time, speed and accuracy. */
    showPoints?: boolean;
}

/** Corner of the line info box (name, length, travel time), or 'off'. */
export type MapLineInfoMode = 'off' | MapChipsCorner;

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
    /** Paint `color` across the whole chip instead of only its border, so the
     *  colour coding stays readable at a glance. Per chip. */
    filled?: boolean;
}

/** Where the quick-access chips are rendered relative to the map. */
export type MapChipsPosition = 'overlay' | 'below';

/** Which corner an overlay chip group is anchored to. Used by the quick-access
 *  chips (only for `chipsPosition === 'overlay'`) and by the map-type switcher. */
export type MapChipsCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

const CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const;

function normalizeCorner(value: unknown, fallback: MapChipsCorner): MapChipsCorner {
    return (CORNERS as readonly string[]).includes(value as string) ? (value as MapChipsCorner) : fallback;
}

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
    /** Show the map-type switcher (chips) over the map, so the type can be
     *  changed in the running frontend instead of only in the editor. */
    showStyleChips?: boolean;
    styleChipsCorner?: MapChipsCorner;
    /** Which types the switcher offers; unset or empty offers all presets. */
    styleChoices?: MapStyle[];
    lines?: MapLine[];
    /** Corner of the box listing each line's length (default bottom-left), or 'off'. */
    lineInfo?: MapLineInfoMode;
    /** Day bar ‹ date › above the map: recorded tracks show the picked day instead of the last hours. */
    dayNav?: boolean;
    /** One chip per line above the map; tapping a chip shows that line. */
    lineChips?: boolean;
    /** Chips toggle lines independently instead of showing one line at a time. */
    lineChipsMulti?: boolean;
    /** Timeline of stays and trips under the map, for the first visible recorded track. */
    timeline?: boolean;
    /** Timeline: a stay keeps within this many metres (default 100). */
    stayRadius?: number;
    /** Timeline: minimum minutes at one place to count as a stay (default 10). */
    stayMinutes?: number;
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

/** Chip labels for the map-type switcher, in the presets' order. */
const STYLE_LABEL_KEYS: Record<MapStyle, TranslationKey> = {
    standard: 'map.style.standard',
    satellite: 'map.style.satellite',
    terrain: 'map.style.terrain',
};

const ALL_STYLES = Object.keys(TILE_PRESETS) as MapStyle[];

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

// ── Lines: computed routes (#790) and recorded tracks (#410) ─────────────────

/** What a line reports upward: the info-box row and the corners for auto-fit. */
interface LineInfo {
    label: string;
    color: string;
    km: number | null;
    durationMin?: number;
    bounds: [LatLon, LatLon] | null;
    /** Recorded points (json/history) — feeds the timeline. Compared by reference. */
    track?: TrackPoint[];
}

/** The day picked in the day bar: its window, and whether it is today (live data). */
interface DayWindow {
    start: number;
    end: number;
    isToday: boolean;
}

const ROUTE_COLOR = '#2563eb';
const TRACK_COLOR = '#e11d48';
/** A moving start/end marker re-requests its route at most this often. */
const ROUTE_REFRESH_MS = 30_000;
/** Recorded history is re-read this often so the time window keeps sliding. */
const HISTORY_REFRESH_MS = 5 * 60_000;
/** More dots than this are thinned out — the line itself always keeps every point. */
const MAX_DOTS = 1000;
const EMPTY_TRACK: ParsedTrack = { points: [] };

/** Route between two resolved positions, throttled for moving markers. */
function useRoute(from: LatLon | null, to: LatLon | null, profile: RouteProfile): RouteResult | null {
    const [route, setRoute] = useState<RouteResult | null>(null);
    const [lastFetch, setLastFetch] = useState(0);
    const key = from && to ? routeKey(from, to, profile) : '';
    useEffect(() => {
        if (!from || !to) {
            setRoute(null);
            return;
        }
        let cancelled = false;
        // Short debounce for edits, the refresh gap for markers that keep moving.
        const wait = Math.max(600, lastFetch + ROUTE_REFRESH_MS - Date.now());
        const handle = setTimeout(() => {
            setLastFetch(Date.now());
            void fetchRoute(from, to, profile).then((r) => {
                if (!cancelled) setRoute(r);
            });
        }, wait);
        return () => {
            cancelled = true;
            clearTimeout(handle);
        };
        // `from`/`to` are read fresh at fire time; the rounded key decides when to re-route.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);
    return route;
}

/** History of a position DP as track points, plus the live value appended. With a
 *  picked day the window is that day; the live value only belongs to today. */
function useHistoryTrack(line: MapLine, enabled: boolean, day: DayWindow | null): TrackPoint[] {
    const { connected: socketConnected } = useIoBroker();
    // A stubbed history (screenshot harness) counts as connected, like the history table.
    const connected = socketConnected || isHistoryStubbed();
    const dp = enabled ? (line.dp ?? '').trim() : '';
    const live = useDatapoint(dp);
    const [detected, setDetected] = useState<string | undefined>();
    const [rows, setRows] = useState<TrackPoint[]>([]);
    const [tick, setTick] = useState(0);
    const instance = line.historyInstance || detected;
    const hours = Number.isFinite(line.historyHours) && (line.historyHours as number) > 0 ? line.historyHours! : 24;
    // A whole day of a tracker easily exceeds the rolling-window default.
    const maxPoints =
        Number.isFinite(line.maxPoints) && (line.maxPoints as number) > 0 ? line.maxPoints! : day ? 2000 : 500;
    const isLive = !day || day.isToday;
    const dayStart = day?.start;
    const dayEnd = day?.end;

    useEffect(() => {
        if (!dp || line.historyInstance) return;
        let cancelled = false;
        void getObjectDirect(dp).then((obj) => {
            if (cancelled) return;
            const custom = obj?.common?.custom as Record<string, { enabled?: boolean }> | undefined;
            setDetected(custom ? detectHistoryAdapters(custom)[0]?.instance : undefined);
        });
        return () => {
            cancelled = true;
        };
    }, [dp, line.historyInstance]);

    useEffect(() => {
        // A past day is complete — only a live window needs re-reading.
        if (!dp || !isLive) return;
        const id = globalThis.setInterval(() => setTick((n) => n + 1), HISTORY_REFRESH_MS);
        return () => clearInterval(id);
    }, [dp, isLive]);

    useEffect(() => {
        if (!dp || !instance || !connected) {
            setRows([]);
            return;
        }
        let cancelled = false;
        const now = Date.now();
        const end = dayEnd !== undefined ? Math.min(dayEnd, now) : now;
        const start = dayStart ?? end - hours * 3_600_000;
        void getHistoryDirect(dp, {
            instance,
            start,
            end,
            count: maxPoints,
            aggregate: 'none',
            returnNewestEntries: true,
        }).then((entries) => {
            if (!cancelled) setRows(historyToTrack(entries, line.latPath, line.lonPath));
        });
        return () => {
            cancelled = true;
        };
    }, [dp, instance, connected, hours, maxPoints, line.latPath, line.lonPath, tick, dayStart, dayEnd]);

    const liveVal = live.state?.val;
    const liveTs = live.state?.ts;
    return useMemo(() => {
        if (liveVal == null || !isLive) return rows;
        const [p] = historyToTrack([{ ts: liveTs ?? Date.now(), val: liveVal }], line.latPath, line.lonPath);
        return appendLivePoint(rows, p ?? null);
    }, [rows, liveVal, liveTs, isLive, line.latPath, line.lonPath]);
}

function sameInfo(a: LineInfo | undefined, b: LineInfo): boolean {
    if (!a) return false;
    const { track: ta, ...ra } = a;
    const { track: tb, ...rb } = b;
    return ta === tb && JSON.stringify(ra) === JSON.stringify(rb);
}

/** Arrow head at the end of a track, pointing the way it was travelled. */
function arrowIcon(color: string, deg: number): L.DivIcon {
    return L.divIcon({
        className: 'aura-map-arrow',
        html: `<svg width="22" height="22" viewBox="0 0 22 22" style="transform:rotate(${deg}deg);display:block"><path d="M11 2 L19 19 L11 14.5 L3 19 Z" fill="${color}" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
    });
}

/** Time, speed and accuracy of one recorded point. */
function PointPopup({ p }: { p: TrackPoint }) {
    return (
        <div style={{ fontSize: 12, lineHeight: 1.4 }}>
            {p.ts !== undefined && <div style={{ fontWeight: 600 }}>{new Date(p.ts).toLocaleString()}</div>}
            {p.speed !== undefined && <div>{Math.round(p.speed)} km/h</div>}
            {p.accuracy !== undefined && <div>± {Math.round(p.accuracy)} m</div>}
            <div style={{ opacity: 0.6 }}>
                {p.pos[0].toFixed(5)}, {p.pos[1].toFixed(5)}
            </div>
        </div>
    );
}

/** Resolves one line (route or track), draws it and reports its info upward.
 *  Every hook runs for every source (with '' / disabled inputs) so switching the
 *  source in the editor keeps the hook order stable. */
function LineLayer({
    line,
    markers,
    positions,
    day,
    visible,
    onInfo,
}: {
    line: MapLine;
    markers: MapMarker[];
    positions: Record<string, LatLon>;
    day: DayWindow | null;
    /** Hidden by the line chips: still resolved (the chip needs its name), not drawn. */
    visible: boolean;
    onInfo: (id: string, info: LineInfo | null) => void;
}) {
    const source = line.source;
    const from = source === 'route' && line.fromMarkerId ? (positions[line.fromMarkerId] ?? null) : null;
    const to = source === 'route' && line.toMarkerId ? (positions[line.toMarkerId] ?? null) : null;
    const route = useRoute(from, to, normalizeProfile(line.profile));

    const jsonState = useDatapoint(source === 'json' ? (line.dp ?? '').trim() : '');
    const parsed = useMemo<ParsedTrack>(
        () =>
            source === 'json'
                ? parseTrack(jsonState.state?.val, line.pointsPath, line.latPath, line.lonPath)
                : EMPTY_TRACK,
        [source, jsonState.state?.val, line.pointsPath, line.latPath, line.lonPath],
    );
    const history = useHistoryTrack(line, source === 'history', day);

    const dayStart = day?.start;
    const dayEnd = day?.end;
    const track = useMemo<TrackPoint[]>(() => {
        if (source === 'history') return history;
        if (source !== 'json') return EMPTY_TRACK.points;
        return dayStart !== undefined && dayEnd !== undefined
            ? filterDay(parsed.points, dayStart, dayEnd)
            : parsed.points;
    }, [source, parsed, history, dayStart, dayEnd]);
    const hasEnds = !!from && !!to;
    const coords = useMemo<LatLon[]>(
        () => (source === 'route' ? (route && hasEnds ? route.coords : []) : track.map((p) => p.pos)),
        [source, route, hasEnds, track],
    );

    const color = line.color || parsed.color || (source === 'route' ? ROUTE_COLOR : TRACK_COLOR);
    const markerLabel = (id?: string) => markers.find((m) => m.id === id)?.label || '';
    const label =
        line.label ||
        parsed.name ||
        (source === 'route' && (line.fromMarkerId || line.toMarkerId)
            ? `${markerLabel(line.fromMarkerId)} → ${markerLabel(line.toMarkerId)}`
            : '');
    const info = useMemo<LineInfo>(
        () => ({
            label,
            color,
            km: coords.length > 1 ? (source === 'route' && route ? route.distanceKm : trackLengthKm(coords)) : null,
            durationMin: source === 'route' && route && coords.length > 1 ? route.durationMin : undefined,
            bounds: trackBounds(coords),
            track: source === 'route' ? undefined : track,
        }),
        [label, color, coords, source, route, track],
    );

    useEffect(() => {
        onInfo(line.id, info);
    }, [line.id, info, onInfo]);
    useEffect(() => () => onInfo(line.id, null), [line.id, onInfo]);

    if (!visible || (coords.length < 2 && !(line.showPoints && coords.length === 1))) return null;
    const weight = Number.isFinite(line.width) && (line.width as number) > 0 ? (line.width as number) : 4;
    const dots = line.showPoints && source !== 'route' ? track.slice(-MAX_DOTS) : [];
    // A recorded track shows where it began and which way it went.
    const isTrack = source !== 'route' && coords.length > 1;
    const endDeg = isTrack ? endBearing(coords) : 0;
    return (
        <>
            {coords.length > 1 && (
                <Polyline
                    positions={coords}
                    pathOptions={{ color, weight, opacity: 0.85, lineJoin: 'round', lineCap: 'round' }}
                    // Marker for tests: which line this path belongs to.
                    eventHandlers={{
                        add: (e) => (e.target as L.Polyline).getElement()?.setAttribute('data-aura-map-line', line.id),
                    }}
                >
                    {label && (
                        <Tooltip sticky>
                            <div style={{ fontWeight: 600 }}>{label}</div>
                            {info.km != null && <div>{formatDistance(info.km)}</div>}
                        </Tooltip>
                    )}
                </Polyline>
            )}
            {isTrack && (
                <>
                    <CircleMarker
                        center={coords[0]}
                        radius={6}
                        interactive={false}
                        pathOptions={{ color, weight: 3, fillColor: '#fff', fillOpacity: 1 }}
                    />
                    <Marker
                        position={coords[coords.length - 1]}
                        icon={arrowIcon(color, endDeg)}
                        interactive={false}
                        keyboard={false}
                    />
                </>
            )}
            {dots.map((p, i) => (
                <CircleMarker
                    key={`${i}:${p.pos[0]},${p.pos[1]}`}
                    center={p.pos}
                    radius={4}
                    pathOptions={{ color: '#fff', weight: 1.5, fillColor: color, fillOpacity: 1 }}
                >
                    <Popup>
                        <PointPopup p={p} />
                    </Popup>
                </CircleMarker>
            ))}
        </>
    );
}

/** One row of the line info box: colour swatch, name, length and travel time. */
function LineInfoRow({ info }: { info: LineInfo }) {
    const parts = [
        info.km != null ? formatDistance(info.km) : '…',
        info.durationMin !== undefined ? formatDuration(info.durationMin) : '',
    ].filter(Boolean);
    return (
        <div className="flex items-center gap-1.5 text-[11px] whitespace-nowrap" data-aura-map-line-info>
            <span style={{ width: 12, height: 3, borderRadius: 2, background: info.color, flexShrink: 0 }} />
            {info.label && <span className="truncate max-w-[140px] font-medium">{info.label}</span>}
            <span style={{ color: 'var(--text-secondary)' }}>{parts.join(' · ')}</span>
        </div>
    );
}

// ── Day bar, line chips and timeline (#410) ──────────────────────────────────

const localeOf = (lang: Language): string => (lang === 'de' ? 'de-DE' : 'en-GB');
const clockTime = (ts: number, lang: Language): string =>
    new Date(ts).toLocaleTimeString(localeOf(lang), { hour: '2-digit', minute: '2-digit' });

const barStyle: React.CSSProperties = {
    flexShrink: 0,
    background: 'var(--widget-bg)',
    borderBottom: '1px solid var(--app-border)',
};

/** ‹ Tue, 08.09.2026 › — steps through days; tapping the date returns to today. */
function DayBar({ offset, onChange, lang }: { offset: number; onChange: (o: number) => void; lang: Language }) {
    const t = useT();
    const label = new Date(dayRange(offset).start).toLocaleDateString(localeOf(lang), {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });
    const btn = 'px-2 py-1 rounded-lg hover:opacity-80 disabled:opacity-30 disabled:cursor-default';
    return (
        <div className="flex items-center justify-between px-1 py-1" style={barStyle} data-aura-map-daybar>
            <button
                type="button"
                className={btn}
                style={{ color: 'var(--text-primary)' }}
                onClick={() => onChange(offset - 1)}
                title={t('map.day.prev')}
                aria-label={t('map.day.prev')}
                data-aura-map-day="prev"
            >
                <ChevronLeft size={18} />
            </button>
            <button
                type="button"
                className="text-sm font-semibold px-2 py-1 rounded-lg hover:opacity-80"
                style={{ color: 'var(--text-primary)' }}
                onClick={() => onChange(0)}
                title={t('map.day.today')}
                data-aura-map-day-label
            >
                {label}
            </button>
            <button
                type="button"
                className={btn}
                style={{ color: 'var(--text-primary)' }}
                onClick={() => onChange(offset + 1)}
                disabled={offset >= 0}
                title={t('map.day.next')}
                aria-label={t('map.day.next')}
                data-aura-map-day="next"
            >
                <ChevronRight size={18} />
            </button>
        </div>
    );
}

/** One chip per line; the active ones are tinted in their line colour. */
function LineChipBar({
    chips,
    isActive,
    onToggle,
}: {
    chips: { id: string; label: string; color: string }[];
    isActive: (id: string) => boolean;
    onToggle: (id: string) => void;
}) {
    return (
        <div className="flex flex-wrap gap-1.5 px-2 py-1.5" style={barStyle}>
            {chips.map((c) => {
                const on = isActive(c.id);
                return (
                    <button
                        key={c.id}
                        type="button"
                        onClick={() => onToggle(c.id)}
                        aria-pressed={on}
                        data-aura-map-line-chip={c.id}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap hover:opacity-85"
                        style={{
                            color: 'var(--text-primary)',
                            background: on
                                ? `color-mix(in srgb, ${c.color} 18%, var(--widget-bg))`
                                : 'var(--widget-bg)',
                            border: `1.5px solid ${on ? c.color : 'var(--app-border)'}`,
                            opacity: on ? 1 : 0.7,
                        }}
                    >
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.color }} />
                        <span className="truncate max-w-[140px]">{c.label}</span>
                    </button>
                );
            })}
        </div>
    );
}

/** Address of a position (reverse geocoded, cached), null while loading or unknown. */
function useAddress(pos: LatLon, lang: Language): ReverseAddress | null {
    const [addr, setAddr] = useState<ReverseAddress | null>(null);
    const key = `${pos[0].toFixed(4)},${pos[1].toFixed(4)}`;
    useEffect(() => {
        let cancelled = false;
        setAddr(null);
        void reverseGeocode(pos, lang).then((a) => {
            if (!cancelled) setAddr(a);
        });
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, lang]);
    return addr;
}

/** A known place for the timeline: a fixed marker (static coordinates or address). */
interface KnownPlace {
    pos: LatLon;
    label: string;
}

const RAIL = 'var(--app-border)';

/** Time column + rail dot + content, one per timeline entry. */
function TimelineRow({
    time,
    dot,
    onClick,
    kind,
    children,
}: {
    time: string;
    dot: React.ReactNode;
    onClick: () => void;
    kind: TrackSegment['kind'];
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="w-full text-left grid hover:opacity-85"
            style={{ gridTemplateColumns: '44px 20px 1fr', columnGap: 6, padding: '6px 0' }}
            data-aura-map-timeline-row={kind}
        >
            <span className="text-[11px] text-right pt-0.5" style={{ color: 'var(--text-secondary)' }}>
                {time}
            </span>
            <span className="flex justify-center pt-1" style={{ position: 'relative', zIndex: 1 }}>
                {dot}
            </span>
            <span className="min-w-0">{children}</span>
        </button>
    );
}

function StayRow({
    seg,
    color,
    places,
    radiusM,
    lang,
    onFocus,
}: {
    seg: Extract<TrackSegment, { kind: 'stay' }>;
    color: string;
    places: KnownPlace[];
    radiusM: number;
    lang: Language;
    onFocus: () => void;
}) {
    const addr = useAddress(seg.center, lang);
    const known = nearestPlace(seg.center, places, Math.max(radiusM, 150));
    const title = known?.label || addr?.title || `${seg.center[0].toFixed(4)}, ${seg.center[1].toFixed(4)}`;
    return (
        <TimelineRow
            kind="stay"
            time={clockTime(seg.start, lang)}
            onClick={onFocus}
            dot={
                <span
                    style={{
                        width: 14,
                        height: 14,
                        borderRadius: '50%',
                        background: color,
                        border: '2.5px solid var(--widget-bg)',
                        boxShadow: `0 0 0 1px ${color}`,
                    }}
                />
            }
        >
            <span className="flex items-start gap-2">
                <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                        {title}
                    </span>
                    {addr && (
                        <span className="block text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                            {addr.address}
                        </span>
                    )}
                    <span className="block text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {clockTime(seg.start, lang)}–{clockTime(seg.end, lang)} ·{' '}
                        {formatDuration((seg.end - seg.start) / 60_000)}
                    </span>
                </span>
                {known && (
                    <span style={{ color: '#f59e0b', fontSize: 16, lineHeight: 1 }} title={known.label}>
                        ★
                    </span>
                )}
            </span>
        </TimelineRow>
    );
}

/** Stays and trips of one recorded track, oldest first. Tapping an entry zooms to it. */
function Timeline({
    track,
    color,
    radiusM,
    minStayMin,
    places,
    lang,
    onFocusStay,
    onFocusMove,
}: {
    track: TrackPoint[];
    color: string;
    radiusM: number;
    minStayMin: number;
    places: KnownPlace[];
    lang: Language;
    onFocusStay: (pos: LatLon) => void;
    onFocusMove: (points: LatLon[]) => void;
}) {
    const t = useT();
    const segments = useMemo(() => detectSegments(track, radiusM, minStayMin), [track, radiusM, minStayMin]);
    return (
        <div
            className="aura-scroll"
            style={{
                flex: '0 1 auto',
                maxHeight: '50%',
                overflowY: 'auto',
                background: 'var(--widget-bg)',
                borderTop: '1px solid var(--app-border)',
                padding: '4px 10px 6px 0',
            }}
            data-aura-map-timeline
        >
            {segments.length === 0 ? (
                <p className="text-xs px-3 py-2" style={{ color: 'var(--text-secondary)' }}>
                    {t('map.timeline.empty')}
                </p>
            ) : (
                <div style={{ position: 'relative' }}>
                    {/* The rail behind the dots, from the first entry to the last. */}
                    <span
                        style={{
                            position: 'absolute',
                            left: 44 + 6 + 9,
                            top: 14,
                            bottom: 14,
                            width: 2,
                            background: RAIL,
                        }}
                    />
                    {segments.map((s, i) =>
                        s.kind === 'stay' ? (
                            <StayRow
                                key={i}
                                seg={s}
                                color={color}
                                places={places}
                                radiusM={radiusM}
                                lang={lang}
                                onFocus={() => onFocusStay(s.center)}
                            />
                        ) : (
                            <TimelineRow
                                key={i}
                                kind="move"
                                time={clockTime(s.start, lang)}
                                onClick={() => onFocusMove(s.points)}
                                dot={
                                    <span
                                        style={{
                                            width: 10,
                                            height: 10,
                                            borderRadius: '50%',
                                            background: 'var(--widget-bg)',
                                            border: '2.5px solid var(--text-secondary)',
                                        }}
                                    />
                                }
                            >
                                <span className="block text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                                    {t('map.timeline.moving')}
                                </span>
                                <span className="block text-xs" style={{ color: 'var(--text-secondary)' }}>
                                    {formatDuration((s.end - s.start) / 60_000)} · {formatDistance(s.km)}
                                </span>
                            </TimelineRow>
                        ),
                    )}
                </div>
            )}
        </div>
    );
}

/** Fits the view to a set of bounds whenever the `nonce` changes (timeline taps). */
function FitController({ target }: { target: { bounds: [LatLon, LatLon]; nonce: number } | null }) {
    const map = useMap();
    useEffect(() => {
        if (!target) return;
        const size = map.getSize();
        if (!size.x || !size.y) return;
        try {
            map.flyToBounds(L.latLngBounds(target.bounds as L.LatLngTuple[]), { padding: [30, 30], maxZoom: 17 });
        } catch {
            // Transient layout/zoom race — the next tap will retry.
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [target?.nonce]);
    return null;
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

/** Picks a readable label colour for a filled chip from the fill's perceived
 *  brightness. Two cases cannot be measured: a non-hex fill (CSS variable — the
 *  accent default) gets white, and a mostly transparent fill keeps the theme's
 *  text colour, because there the widget background still shows through. */
function labelOn(fill: string): string {
    const raw = /^#([0-9a-f]{3,8})$/i.exec(fill.trim())?.[1] ?? '';
    // #rgb / #rgba are shorthand for the doubled form; everything else is taken as is.
    const hex = raw.length <= 4 ? raw.replace(/./g, (c) => c + c) : raw;
    if (hex.length !== 6 && hex.length !== 8) return '#fff';
    if (hex.length === 8 && parseInt(hex.slice(6, 8), 16) < 128) return 'var(--text-primary)';
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.6 ? '#111827' : '#fff';
}

/** One map-type chip. The active type is filled with the accent colour, so the
 *  switcher doubles as an indicator of what is currently on screen. */
function StyleChip({
    style,
    label,
    active,
    onSelect,
}: {
    style: MapStyle;
    label: string;
    active: boolean;
    onSelect: () => void;
}) {
    return (
        <button
            type="button"
            // Marker + pressed state for tests and screen readers.
            data-aura-map-style={style}
            aria-pressed={active}
            onClick={(e) => {
                e.stopPropagation();
                onSelect();
            }}
            className="px-2 py-1 rounded-full text-[11px] font-medium whitespace-nowrap shrink-0 hover:opacity-85 transition-opacity"
            style={{
                background: active ? 'var(--accent)' : 'var(--widget-bg)',
                color: active ? '#fff' : 'var(--text-primary)',
                border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                boxShadow: '0 1px 3px rgba(0,0,0,.25)',
                cursor: 'pointer',
            }}
            title={label}
        >
            {label}
        </button>
    );
}

/** Anchors one or more chip rows to a map corner. Rows stack vertically, so the
 *  quick-access chips and the map-type switcher can share a corner without
 *  covering each other. The wrapper stays click-through; the chips themselves
 *  re-enable pointer events. */
function CornerOverlay({
    corner,
    editMode,
    children,
}: {
    corner: MapChipsCorner;
    editMode?: boolean;
    children: React.ReactNode;
}) {
    const isTop = corner === 'top-left' || corner === 'top-right';
    const isLeft = corner === 'top-left' || corner === 'bottom-left';
    return (
        <div
            style={{
                position: 'absolute',
                [isTop ? 'top' : 'bottom']: 6,
                // Clear the zoom control, which Leaflet puts in the top-left corner.
                [isLeft ? 'left' : 'right']: corner === 'top-left' && !editMode ? 44 : 6,
                maxWidth: 'calc(100% - 12px)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: isLeft ? 'flex-start' : 'flex-end',
                gap: 4,
                zIndex: 1000,
                pointerEvents: 'none',
            }}
        >
            {children}
        </div>
    );
}

/** One wrapping row of chips inside a `CornerOverlay`. */
function ChipRow({ alignRight, children }: { alignRight: boolean; children: React.ReactNode }) {
    return (
        <div
            style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 4,
                justifyContent: alignRight ? 'flex-end' : 'flex-start',
            }}
        >
            {children}
        </div>
    );
}

/** A single quick-access chip pill. */
function QuickChip({ view, onJump }: { view: MapQuickView; onJump: (v: MapQuickView) => void }) {
    const color = view.color || 'var(--accent)';
    const filled = view.filled === true;
    return (
        <button
            type="button"
            onClick={(e) => {
                e.stopPropagation();
                onJump(view);
            }}
            className="flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium whitespace-nowrap shrink-0 hover:opacity-85 transition-opacity"
            style={{
                background: filled ? color : 'var(--widget-bg)',
                color: filled ? labelOn(color) : 'var(--text-primary)',
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
    const t = useT();
    const o = (config.options ?? {}) as MapOptions;
    const markers = useMemo<MapMarker[]>(() => (Array.isArray(o.markers) ? o.markers : []), [o.markers]);

    // ── Map type: starts from the admin config, switchable at runtime via chips ──
    const cfgStyle: MapStyle = o.mapStyle && o.mapStyle in TILE_PRESETS ? o.mapStyle : 'standard';
    const [styleOverride, setStyleOverride] = useState<MapStyle | null>(null);
    // Editing the type in the admin config drops a stale frontend selection.
    useEffect(() => setStyleOverride(null), [cfgStyle, o.tileUrl]);
    const activeStyle = styleOverride ?? cfgStyle;
    const preset = TILE_PRESETS[activeStyle] ?? TILE_PRESETS.standard;
    // A custom tile URL wins over the style preset — until the user picks a type
    // in the frontend, because then that preset is exactly what they asked for.
    const customTiles = !!o.tileUrl && !styleOverride;
    const tileUrl = customTiles ? (o.tileUrl as string) : preset.url;
    const attribution = customTiles ? (o.tileAttribution ?? '') : preset.attribution;

    const showStyleChips = o.showStyleChips === true;
    const styleCorner = normalizeCorner(o.styleChipsCorner, 'top-left');
    // An empty/garbled choice list offers every preset rather than no chip at all.
    const styleChoices = useMemo<MapStyle[]>(() => {
        const picked = Array.isArray(o.styleChoices) ? ALL_STYLES.filter((st) => o.styleChoices?.includes(st)) : [];
        return picked.length ? picked : ALL_STYLES;
    }, [o.styleChoices]);

    const followMarkers = o.followMarkers ?? true;
    const showDistance = !!o.showDistance;

    // Quick-access chips: show every configured entry so the user always gets
    // visual feedback; the jump itself is guarded against missing coordinates.
    const quickViews = useMemo<MapQuickView[]>(() => (Array.isArray(o.quickViews) ? o.quickViews : []), [o.quickViews]);
    const chipsPosition: MapChipsPosition = o.chipsPosition === 'below' ? 'below' : 'overlay';
    const chipsCorner = normalizeCorner(o.chipsCorner, 'top-right');
    const hasChips = quickViews.length > 0;
    const chipsBelow = hasChips && chipsPosition === 'below';
    const column =
        chipsBelow ||
        o.dayNav === true ||
        (o.lineChips === true && Array.isArray(o.lines) && o.lines.length > 0) ||
        o.timeline === true;

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

    // ── Lines (routes + tracks) ──
    const lines = useMemo<MapLine[]>(() => (Array.isArray(o.lines) ? o.lines : []), [o.lines]);
    const lineInfoCorner: MapLineInfoMode = o.lineInfo === 'off' ? 'off' : normalizeCorner(o.lineInfo, 'bottom-left');
    const [lineInfos, setLineInfos] = useState<Record<string, LineInfo>>({});
    const onLineInfo = useCallback((id: string, info: LineInfo | null) => {
        setLineInfos((prev) => {
            if (!info) {
                if (!(id in prev)) return prev;
                const next = { ...prev };
                delete next[id];
                return next;
            }
            return sameInfo(prev[id], info) ? prev : { ...prev, [id]: info };
        });
    }, []);
    // ── Day bar: recorded tracks show one day instead of the last hours ──
    const lang = useConfigStore((s) => (s.frontend.language ?? 'de') as Language);
    const dayNav = o.dayNav === true;
    const [dayOffset, setDayOffset] = useState(0);
    const day = useMemo<DayWindow | null>(
        () => (dayNav ? { ...dayRange(dayOffset), isToday: dayOffset === 0 } : null),
        [dayNav, dayOffset],
    );

    // ── Line chips: one line at a time, or each toggled on its own ──
    const lineChips = o.lineChips === true && lines.length > 0;
    const chipsMulti = o.lineChipsMulti === true;
    const [pickedLine, setPickedLine] = useState<string | null>(null);
    const [hiddenLines, setHiddenLines] = useState<Set<string>>(() => new Set());
    const isLineVisible = useCallback(
        (id: string) => {
            if (!lineChips) return true;
            if (chipsMulti) return !hiddenLines.has(id);
            const picked = lines.some((l) => l.id === pickedLine) ? pickedLine : lines[0]?.id;
            return id === picked;
        },
        [lineChips, chipsMulti, hiddenLines, pickedLine, lines],
    );
    const toggleLineChip = useCallback(
        (id: string) => {
            if (!chipsMulti) {
                setPickedLine(id);
                return;
            }
            setHiddenLines((prev) => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
            });
        },
        [chipsMulti],
    );
    const visibleLines = lines.filter((l) => isLineVisible(l.id));
    const lineChipList = lines.map((l, i) => ({
        id: l.id,
        label: lineInfos[l.id]?.label || l.label || `${i + 1}`,
        color: lineInfos[l.id]?.color || l.color || (l.source === 'route' ? ROUTE_COLOR : TRACK_COLOR),
    }));

    // Auto-fit covers the visible lines too: each contributes its bounding corners.
    const fitPositions = useMemo<Record<string, LatLon>>(() => {
        const out: Record<string, LatLon> = { ...positions };
        for (const [id, info] of Object.entries(lineInfos)) {
            if (!info.bounds || !isLineVisible(id)) continue;
            out[`line:${id}:sw`] = info.bounds[0];
            out[`line:${id}:ne`] = info.bounds[1];
        }
        return out;
    }, [positions, lineInfos, isLineVisible]);
    const infoRows = visibleLines
        .map((l) => lineInfos[l.id])
        .filter((i): i is LineInfo => !!i && (i.km != null || !!i.label));

    // ── Timeline: stays and trips of the first visible recorded track ──
    const timelineOn = o.timeline === true;
    const timelineInfo = timelineOn
        ? visibleLines.map((l) => lineInfos[l.id]).find((i) => i?.track !== undefined)
        : undefined;
    const stayRadius = Number.isFinite(o.stayRadius) && (o.stayRadius as number) > 0 ? (o.stayRadius as number) : 100;
    const stayMinutes =
        Number.isFinite(o.stayMinutes) && (o.stayMinutes as number) > 0 ? (o.stayMinutes as number) : 10;
    // Fixed markers name the places they sit on; moving ones (a person's own
    // position) would otherwise label every stay after themselves.
    const knownPlaces = useMemo<KnownPlace[]>(
        () =>
            markers
                .filter((m) => (m.mode === 'static' || m.mode === 'address') && positions[m.id])
                .map((m) => ({ pos: positions[m.id], label: m.label || (m.emoji ?? '') })),
        [markers, positions],
    );
    const [fitTarget, setFitTarget] = useState<{ bounds: [LatLon, LatLon]; nonce: number } | null>(null);
    const focusStay = useCallback(
        (pos: LatLon) => setFlyTarget((prev) => ({ pos, zoom: 16, nonce: (prev?.nonce ?? 0) + 1 })),
        [],
    );
    const focusMove = useCallback((points: LatLon[]) => {
        const bounds = trackBounds(points);
        if (bounds) setFitTarget((prev) => ({ bounds, nonce: (prev?.nonce ?? 0) + 1 }));
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
                // Round to the theme radius directly rather than inheriting it: a
                // transparent map widget's frame drops its border-radius to 0 in
                // view mode (only the edit-mode dashed outline is rounded), so
                // `inherit` left the map with square corners in the live frontend.
                borderRadius: 'var(--widget-radius)',
                overflow: 'hidden',
                // Numeric z-index establishes a stacking context so Leaflet's internal
                // panes (z-index up to ~700) stay contained and don't paint over the
                // frame's edit chrome (z-10/20). In edit mode let clicks/drag pass
                // through so the "edit widget" button and grid dragging keep working.
                zIndex: 0,
                pointerEvents: editMode ? 'none' : 'auto',
                // Bars above/below the map (day, line chips, chip bar, timeline) lay out as a column.
                display: column ? 'flex' : undefined,
                flexDirection: column ? 'column' : undefined,
            }}
        >
            {/* Non-visual resolvers keep each chip's live position up to date. */}
            {quickViews.map((v) => (
                <QuickViewResolver key={v.id} view={v} onResolve={onResolveChip} />
            ))}

            {dayNav && <DayBar offset={dayOffset} onChange={setDayOffset} lang={lang} />}
            {lineChips && <LineChipBar chips={lineChipList} isActive={isLineVisible} onToggle={toggleLineChip} />}

            <div style={column ? { position: 'relative', flex: 1, minHeight: 0 } : { position: 'absolute', inset: 0 }}>
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
                    <FollowMarkers positions={fitPositions} enabled={followMarkers} maxZoom={followMaxZoom} />
                    <FlyToController target={flyTarget} />
                    <FitController target={fitTarget} />
                    {lines.map((l) => (
                        <LineLayer
                            key={l.id}
                            line={l}
                            markers={markers}
                            positions={positions}
                            day={day}
                            visible={isLineVisible(l.id)}
                            onInfo={onLineInfo}
                        />
                    ))}
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

                {/* Overlay chips float over the map, anchored per corner. Both groups
                    are rendered through the same corner wrapper, so putting them in
                    the same corner stacks them instead of overlapping. */}
                {CORNERS.map((corner) => {
                    const rows = [
                        hasChips && chipsPosition === 'overlay' && chipsCorner === corner ? (
                            <ChipRow key="quick" alignRight={corner.endsWith('right')}>
                                {quickViews.map((v) => (
                                    <div key={v.id} style={{ pointerEvents: 'auto' }}>
                                        <QuickChip view={v} onJump={onJump} />
                                    </div>
                                ))}
                            </ChipRow>
                        ) : null,
                        showStyleChips && styleCorner === corner ? (
                            <ChipRow key="style" alignRight={corner.endsWith('right')}>
                                {styleChoices.map((st) => (
                                    <div key={st} style={{ pointerEvents: 'auto' }}>
                                        <StyleChip
                                            style={st}
                                            label={t(STYLE_LABEL_KEYS[st])}
                                            active={st === activeStyle && !customTiles}
                                            onSelect={() => setStyleOverride(st)}
                                        />
                                    </div>
                                ))}
                            </ChipRow>
                        ) : null,
                        infoRows.length > 0 && lineInfoCorner === corner ? (
                            <div
                                key="lines"
                                className="flex flex-col gap-0.5 px-2 py-1 rounded-lg"
                                style={{
                                    pointerEvents: 'auto',
                                    background: 'var(--widget-bg)',
                                    color: 'var(--text-primary)',
                                    border: '1px solid var(--app-border)',
                                    boxShadow: '0 1px 3px rgba(0,0,0,.25)',
                                    maxWidth: '100%',
                                }}
                            >
                                {infoRows.map((info, i) => (
                                    <LineInfoRow key={i} info={info} />
                                ))}
                            </div>
                        ) : null,
                    ].filter(Boolean);
                    if (!rows.length) return null;
                    return (
                        <CornerOverlay key={corner} corner={corner} editMode={editMode}>
                            {rows}
                        </CornerOverlay>
                    );
                })}
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

            {timelineOn && (
                <Timeline
                    track={timelineInfo?.track ?? EMPTY_TRACK.points}
                    color={timelineInfo?.color ?? TRACK_COLOR}
                    radiusM={stayRadius}
                    minStayMin={stayMinutes}
                    places={knownPlaces}
                    lang={lang}
                    onFocusStay={focusStay}
                    onFocusMove={focusMove}
                />
            )}
        </div>
    );
}
