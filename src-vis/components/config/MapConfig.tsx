import { Database, Plus, Trash2, MapPin } from 'lucide-react';
import type { WidgetConfig } from '../../types';
import type {
    MapMarker,
    MapMarkerMode,
    MapStyle,
    MapQuickView,
    MapChipsPosition,
    MapChipsCorner,
} from '../widgets/MapWidget';

const MAP_STYLES: { value: MapStyle; label: string }[] = [
    { value: 'standard', label: 'Karte' },
    { value: 'satellite', label: 'Satellit' },
    { value: 'terrain', label: 'Gelände / Topo' },
];

interface Props {
    config: WidgetConfig;
    onConfigChange: (config: WidgetConfig) => void;
    /** Opens the shared datapoint picker for a marker's lat/lon/json field. */
    onPickMarkerDp: (idx: number, field: 'jsonDp' | 'latDp' | 'lonDp') => void;
    /** Opens the shared datapoint picker for a quick-access chip's lat/lon/json field. */
    onPickQuickViewDp: (idx: number, field: 'jsonDp' | 'latDp' | 'lonDp') => void;
}

const iCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none';
const iSty: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};
const lblCls = 'text-[11px] mb-1 block';
const lblSty: React.CSSProperties = { color: 'var(--text-secondary)' };

function Toggle({ value, onToggle }: { value: boolean; onToggle: () => void }) {
    return (
        <button
            onClick={onToggle}
            className="relative w-9 h-5 rounded-full transition-colors shrink-0"
            style={{ background: value ? 'var(--accent)' : 'var(--app-border)' }}
        >
            <span
                className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                style={{ left: value ? '18px' : '2px' }}
            />
        </button>
    );
}

const MODE_LABELS: { value: MapMarkerMode; label: string }[] = [
    { value: 'json', label: 'JSON-/Objekt-DP (lat/lon)' },
    { value: 'latlon', label: 'Zwei DPs (Lat + Lon)' },
    { value: 'static', label: 'Feste Koordinaten' },
    { value: 'address', label: 'Adresse' },
];

function genId(): string {
    return `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function DpField({
    value,
    placeholder,
    onChange,
    onPick,
}: {
    value: string;
    placeholder: string;
    onChange: (v: string) => void;
    onPick: () => void;
}) {
    return (
        <div className="flex gap-1">
            <input
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className={`${iCls} flex-1 font-mono min-w-0`}
                style={iSty}
            />
            <button
                type="button"
                onClick={onPick}
                className="px-2 rounded-lg hover:opacity-80 shrink-0"
                style={{
                    background: 'var(--app-bg)',
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--app-border)',
                }}
                title="Aus ioBroker wählen"
            >
                <Database size={13} />
            </button>
        </div>
    );
}

export function MapConfig({ config, onConfigChange, onPickMarkerDp, onPickQuickViewDp }: Props) {
    const o = config.options ?? {};
    const markers: MapMarker[] = Array.isArray(o.markers) ? (o.markers as MapMarker[]) : [];

    const set = (patch: Record<string, unknown>) => onConfigChange({ ...config, options: { ...o, ...patch } });
    const setMarkers = (next: MapMarker[]) => set({ markers: next });
    const patchMarker = (idx: number, patch: Partial<MapMarker>) =>
        setMarkers(markers.map((m, i) => (i === idx ? { ...m, ...patch } : m)));

    const addMarker = () =>
        setMarkers([...markers, { id: genId(), mode: 'latlon', label: '', emoji: '📍', color: '#2563eb' }]);
    const removeMarker = (idx: number) => {
        const removed = markers[idx];
        const next = markers.filter((_, i) => i !== idx);
        const patch: Record<string, unknown> = { markers: next };
        if (o.homeMarkerId === removed?.id) patch.homeMarkerId = undefined;
        set(patch);
    };

    const followMarkers = (o.followMarkers as boolean) ?? true;
    const showDistance = (o.showDistance as boolean) ?? false;

    const quickViews: MapQuickView[] = Array.isArray(o.quickViews) ? (o.quickViews as MapQuickView[]) : [];
    const chipsPosition: MapChipsPosition = o.chipsPosition === 'below' ? 'below' : 'overlay';
    const chipsCorner: MapChipsCorner = (o.chipsCorner as MapChipsCorner) || 'top-right';
    const setQuickViews = (next: MapQuickView[]) => set({ quickViews: next });
    const patchQuickView = (idx: number, patch: Partial<MapQuickView>) =>
        setQuickViews(quickViews.map((v, i) => (i === idx ? { ...v, ...patch } : v)));
    const addQuickView = () =>
        setQuickViews([...quickViews, { id: genId(), mode: 'static', label: '', emoji: '📍', color: '#2563eb' }]);
    const removeQuickView = (idx: number) => setQuickViews(quickViews.filter((_, i) => i !== idx));

    return (
        <div className="space-y-4">
            {/* ── Map style ── */}
            <div>
                <label className={lblCls} style={lblSty}>
                    Kartentyp
                </label>
                <select
                    value={(o.mapStyle as MapStyle | undefined) ?? 'standard'}
                    onChange={(e) => set({ mapStyle: e.target.value as MapStyle })}
                    className={iCls}
                    style={iSty}
                    disabled={!!o.tileUrl}
                >
                    {MAP_STYLES.map((s) => (
                        <option key={s.value} value={s.value}>
                            {s.label}
                        </option>
                    ))}
                </select>
                {!!o.tileUrl && (
                    <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
                        Eigene Tile-URL ist gesetzt und überschreibt den Kartentyp.
                    </p>
                )}
            </div>

            {/* ── Markers ── */}
            <div>
                <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px] font-medium" style={lblSty}>
                        Marker ({markers.length})
                    </label>
                    <button
                        type="button"
                        onClick={addMarker}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] hover:opacity-80"
                        style={{ background: 'var(--accent)', color: '#fff' }}
                    >
                        <Plus size={12} /> Marker
                    </button>
                </div>

                {markers.length === 0 && (
                    <p className="text-[10px]" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
                        Noch keine Marker. Jeder Marker zeigt eine Position aus einem Datenpunkt (z.B. Auto, Kind).
                    </p>
                )}

                <div className="space-y-2">
                    {markers.map((m, idx) => (
                        <div
                            key={m.id}
                            className="rounded-lg p-2 space-y-2"
                            style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}
                        >
                            <div className="flex gap-1 items-center">
                                <input
                                    type="text"
                                    value={m.label ?? ''}
                                    onChange={(e) => patchMarker(idx, { label: e.target.value })}
                                    placeholder="Bezeichnung (z.B. Auto)"
                                    className={`${iCls} flex-1 min-w-0`}
                                    style={iSty}
                                />
                                <input
                                    type="text"
                                    value={m.emoji ?? ''}
                                    onChange={(e) => patchMarker(idx, { emoji: e.target.value })}
                                    placeholder="📍"
                                    className="w-10 text-center text-base rounded-lg px-1 py-1 focus:outline-none"
                                    style={iSty}
                                    title="Emoji"
                                />
                                <input
                                    type="color"
                                    value={m.color ?? '#2563eb'}
                                    onChange={(e) => patchMarker(idx, { color: e.target.value })}
                                    className="w-8 h-8 rounded-lg cursor-pointer shrink-0"
                                    style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}
                                    title="Farbe"
                                />
                                <button
                                    type="button"
                                    onClick={() => removeMarker(idx)}
                                    className="p-1.5 rounded-lg hover:opacity-80 shrink-0"
                                    style={{ color: 'var(--danger, #ef4444)' }}
                                    title="Marker entfernen"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>

                            <select
                                value={m.mode}
                                onChange={(e) => patchMarker(idx, { mode: e.target.value as MapMarkerMode })}
                                className={iCls}
                                style={iSty}
                            >
                                {MODE_LABELS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </option>
                                ))}
                            </select>

                            {m.mode === 'json' && (
                                <>
                                    <DpField
                                        value={m.jsonDp ?? ''}
                                        placeholder="z.B. tr-064.0.location"
                                        onChange={(v) => patchMarker(idx, { jsonDp: v || undefined })}
                                        onPick={() => onPickMarkerDp(idx, 'jsonDp')}
                                    />
                                    <p className="text-[10px]" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
                                        DP mit Objekt/JSON wie {'{ "lat": 52.5, "lon": 13.4 }'} – Schlüssel lat/latitude
                                        und lon/lng/longitude werden automatisch erkannt.
                                    </p>
                                </>
                            )}

                            {m.mode === 'latlon' && (
                                <div className="grid grid-cols-1 gap-1">
                                    <DpField
                                        value={m.latDp ?? ''}
                                        placeholder="Latitude-DP"
                                        onChange={(v) => patchMarker(idx, { latDp: v || undefined })}
                                        onPick={() => onPickMarkerDp(idx, 'latDp')}
                                    />
                                    <DpField
                                        value={m.lonDp ?? ''}
                                        placeholder="Longitude-DP"
                                        onChange={(v) => patchMarker(idx, { lonDp: v || undefined })}
                                        onPick={() => onPickMarkerDp(idx, 'lonDp')}
                                    />
                                </div>
                            )}

                            {m.mode === 'address' && (
                                <>
                                    <input
                                        type="text"
                                        value={m.address ?? ''}
                                        onChange={(e) => patchMarker(idx, { address: e.target.value || undefined })}
                                        placeholder="z.B. Marienplatz 1, München"
                                        className={iCls}
                                        style={iSty}
                                    />
                                    <p className="text-[10px]" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
                                        Wird per OpenStreetMap (Photon) in Koordinaten umgewandelt – feste Position,
                                        keine Live-Verfolgung.
                                    </p>
                                </>
                            )}

                            {m.mode === 'static' && (
                                <div className="grid grid-cols-2 gap-1">
                                    <input
                                        type="number"
                                        step="any"
                                        value={m.lat ?? ''}
                                        onChange={(e) =>
                                            patchMarker(idx, {
                                                lat: e.target.value === '' ? undefined : Number(e.target.value),
                                            })
                                        }
                                        placeholder="Lat (z.B. 52.52)"
                                        className={iCls}
                                        style={iSty}
                                    />
                                    <input
                                        type="number"
                                        step="any"
                                        value={m.lon ?? ''}
                                        onChange={(e) =>
                                            patchMarker(idx, {
                                                lon: e.target.value === '' ? undefined : Number(e.target.value),
                                            })
                                        }
                                        placeholder="Lon (z.B. 13.405)"
                                        className={iCls}
                                        style={iSty}
                                    />
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* ── Quick-access chips ── */}
            <div>
                <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px] font-medium" style={lblSty}>
                        Schnellzugriff-Chips ({quickViews.length})
                    </label>
                    <button
                        type="button"
                        onClick={addQuickView}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] hover:opacity-80"
                        style={{ background: 'var(--accent)', color: '#fff' }}
                    >
                        <Plus size={12} /> Chip
                    </button>
                </div>

                {quickViews.length === 0 ? (
                    <p className="text-[10px]" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
                        Chips springen per Klick zu einer festen Position auf der Karte (z.B. „Zuhause“, „Büro“).
                    </p>
                ) : (
                    <>
                        <div className="mb-2">
                            <label className={lblCls} style={lblSty}>
                                Position der Chips
                            </label>
                            <select
                                value={chipsPosition}
                                onChange={(e) => set({ chipsPosition: e.target.value as MapChipsPosition })}
                                className={iCls}
                                style={iSty}
                            >
                                <option value="overlay">Über der Karte (Overlay)</option>
                                <option value="below">Unter der Karte</option>
                            </select>
                        </div>

                        {chipsPosition === 'overlay' && (
                            <div className="mb-2">
                                <label className={lblCls} style={lblSty}>
                                    Ecke des Overlays
                                </label>
                                <select
                                    value={chipsCorner}
                                    onChange={(e) => set({ chipsCorner: e.target.value as MapChipsCorner })}
                                    className={iCls}
                                    style={iSty}
                                >
                                    <option value="top-left">Oben links</option>
                                    <option value="top-right">Oben rechts</option>
                                    <option value="bottom-left">Unten links</option>
                                    <option value="bottom-right">Unten rechts</option>
                                </select>
                            </div>
                        )}

                        <div className="space-y-2">
                            {quickViews.map((v, idx) => (
                                <div
                                    key={v.id}
                                    className="rounded-lg p-2 space-y-2"
                                    style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}
                                >
                                    <div className="flex gap-1 items-center">
                                        <input
                                            type="text"
                                            value={v.label ?? ''}
                                            onChange={(e) => patchQuickView(idx, { label: e.target.value })}
                                            placeholder="Bezeichnung (z.B. Zuhause)"
                                            className={`${iCls} flex-1 min-w-0`}
                                            style={iSty}
                                        />
                                        <input
                                            type="text"
                                            value={v.emoji ?? ''}
                                            onChange={(e) => patchQuickView(idx, { emoji: e.target.value })}
                                            placeholder="📍"
                                            className="w-10 text-center text-base rounded-lg px-1 py-1 focus:outline-none"
                                            style={iSty}
                                            title="Emoji"
                                        />
                                        <input
                                            type="color"
                                            value={v.color ?? '#2563eb'}
                                            onChange={(e) => patchQuickView(idx, { color: e.target.value })}
                                            className="w-8 h-8 rounded-lg cursor-pointer shrink-0"
                                            style={{
                                                background: 'var(--app-bg)',
                                                border: '1px solid var(--app-border)',
                                            }}
                                            title="Farbe"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => removeQuickView(idx)}
                                            className="p-1.5 rounded-lg hover:opacity-80 shrink-0"
                                            style={{ color: 'var(--danger, #ef4444)' }}
                                            title="Chip entfernen"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>

                                    <select
                                        value={v.mode ?? 'static'}
                                        onChange={(e) => patchQuickView(idx, { mode: e.target.value as MapMarkerMode })}
                                        className={iCls}
                                        style={iSty}
                                    >
                                        {MODE_LABELS.map((opt) => (
                                            <option key={opt.value} value={opt.value}>
                                                {opt.label}
                                            </option>
                                        ))}
                                    </select>

                                    {(v.mode ?? 'static') === 'json' && (
                                        <>
                                            <DpField
                                                value={v.jsonDp ?? ''}
                                                placeholder="z.B. tr-064.0.location"
                                                onChange={(val) => patchQuickView(idx, { jsonDp: val || undefined })}
                                                onPick={() => onPickQuickViewDp(idx, 'jsonDp')}
                                            />
                                            <p
                                                className="text-[10px]"
                                                style={{ color: 'var(--text-secondary)', opacity: 0.6 }}
                                            >
                                                DP mit Objekt/JSON wie {'{ "lat": 52.5, "lon": 13.4 }'} – Schlüssel
                                                lat/latitude und lon/lng/longitude werden automatisch erkannt.
                                            </p>
                                        </>
                                    )}

                                    {(v.mode ?? 'static') === 'latlon' && (
                                        <div className="grid grid-cols-1 gap-1">
                                            <DpField
                                                value={v.latDp ?? ''}
                                                placeholder="Latitude-DP"
                                                onChange={(val) => patchQuickView(idx, { latDp: val || undefined })}
                                                onPick={() => onPickQuickViewDp(idx, 'latDp')}
                                            />
                                            <DpField
                                                value={v.lonDp ?? ''}
                                                placeholder="Longitude-DP"
                                                onChange={(val) => patchQuickView(idx, { lonDp: val || undefined })}
                                                onPick={() => onPickQuickViewDp(idx, 'lonDp')}
                                            />
                                        </div>
                                    )}

                                    {(v.mode ?? 'static') === 'address' && (
                                        <>
                                            <input
                                                type="text"
                                                value={v.address ?? ''}
                                                onChange={(e) =>
                                                    patchQuickView(idx, { address: e.target.value || undefined })
                                                }
                                                placeholder="z.B. Marienplatz 1, München"
                                                className={iCls}
                                                style={iSty}
                                            />
                                            <p
                                                className="text-[10px]"
                                                style={{ color: 'var(--text-secondary)', opacity: 0.6 }}
                                            >
                                                Wird per OpenStreetMap (Photon) in Koordinaten umgewandelt.
                                            </p>
                                        </>
                                    )}

                                    {(v.mode ?? 'static') === 'static' && (
                                        <div className="grid grid-cols-2 gap-1">
                                            <input
                                                type="number"
                                                step="any"
                                                value={v.lat ?? ''}
                                                onChange={(e) =>
                                                    patchQuickView(idx, {
                                                        lat: e.target.value === '' ? undefined : Number(e.target.value),
                                                    })
                                                }
                                                placeholder="Lat (z.B. 52.52)"
                                                className={iCls}
                                                style={iSty}
                                            />
                                            <input
                                                type="number"
                                                step="any"
                                                value={v.lon ?? ''}
                                                onChange={(e) =>
                                                    patchQuickView(idx, {
                                                        lon: e.target.value === '' ? undefined : Number(e.target.value),
                                                    })
                                                }
                                                placeholder="Lon (z.B. 13.405)"
                                                className={iCls}
                                                style={iSty}
                                            />
                                        </div>
                                    )}

                                    <div>
                                        <label className={lblCls} style={lblSty}>
                                            Zoomstufe beim Springen (1–19, optional)
                                        </label>
                                        <input
                                            type="number"
                                            min={1}
                                            max={19}
                                            value={v.zoom ?? ''}
                                            onChange={(e) =>
                                                patchQuickView(idx, {
                                                    zoom: e.target.value === '' ? undefined : Number(e.target.value),
                                                })
                                            }
                                            placeholder="aktuelle Zoomstufe beibehalten"
                                            className={iCls}
                                            style={iSty}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>

            {/* ── View ── */}
            <div className="flex items-center justify-between">
                <label className={lblCls} style={lblSty}>
                    Ansicht automatisch auf Marker zentrieren
                </label>
                <Toggle value={followMarkers} onToggle={() => set({ followMarkers: !followMarkers })} />
            </div>

            {!followMarkers && (
                <div className="grid grid-cols-2 gap-1">
                    <input
                        type="number"
                        step="any"
                        value={(o.center as [number, number] | undefined)?.[0] ?? ''}
                        onChange={(e) => {
                            const c = (o.center as [number, number] | undefined) ?? [51.1657, 10.4515];
                            set({ center: [e.target.value === '' ? 0 : Number(e.target.value), c[1]] });
                        }}
                        placeholder="Center Lat"
                        className={iCls}
                        style={iSty}
                    />
                    <input
                        type="number"
                        step="any"
                        value={(o.center as [number, number] | undefined)?.[1] ?? ''}
                        onChange={(e) => {
                            const c = (o.center as [number, number] | undefined) ?? [51.1657, 10.4515];
                            set({ center: [c[0], e.target.value === '' ? 0 : Number(e.target.value)] });
                        }}
                        placeholder="Center Lon"
                        className={iCls}
                        style={iSty}
                    />
                </div>
            )}

            {/* ── Zoom level (fixed zoom when not following; max zoom cap when following) ── */}
            <div>
                <label className={lblCls} style={lblSty}>
                    {followMarkers ? 'Maximale Zoomstufe (1–19)' : 'Zoomstufe (1–19)'}
                </label>
                <input
                    type="number"
                    min={1}
                    max={19}
                    value={(o.zoom as number | undefined) ?? ''}
                    onChange={(e) => set({ zoom: e.target.value === '' ? undefined : Number(e.target.value) })}
                    placeholder={followMarkers ? 'automatisch' : '6'}
                    className={iCls}
                    style={iSty}
                />
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
                    {followMarkers
                        ? 'Begrenzt, wie weit beim automatischen Zentrieren hineingezoomt wird. Leer = automatisch.'
                        : 'Feste Zoomstufe der Karte. Höher = näher.'}
                </p>
            </div>

            {/* ── Distance ── */}
            <div className="flex items-center justify-between">
                <label className={lblCls} style={lblSty}>
                    Entfernung anzeigen
                </label>
                <Toggle value={showDistance} onToggle={() => set({ showDistance: !showDistance })} />
            </div>

            {showDistance && (
                <div>
                    <label className={lblCls} style={lblSty}>
                        <MapPin size={11} className="inline mr-1" />
                        Bezugspunkt (Entfernung wird ab hier berechnet)
                    </label>
                    <select
                        value={(o.homeMarkerId as string | undefined) ?? ''}
                        onChange={(e) => set({ homeMarkerId: e.target.value || undefined })}
                        className={iCls}
                        style={iSty}
                    >
                        <option value="">– kein Bezugspunkt –</option>
                        {markers.map((m) => (
                            <option key={m.id} value={m.id}>
                                {m.label || m.id}
                            </option>
                        ))}
                    </select>
                </div>
            )}

            {/* ── Tiles (advanced) ── */}
            <div>
                <label className={lblCls} style={lblSty}>
                    Tile-Server-URL (optional)
                </label>
                <input
                    type="text"
                    value={(o.tileUrl as string) ?? ''}
                    onChange={(e) => set({ tileUrl: e.target.value || undefined })}
                    placeholder="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    className={`${iCls} font-mono`}
                    style={iSty}
                />
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
                    Leer = OpenStreetMap. Eigene Tiles benötigen ggf. eine Attribution.
                </p>
            </div>
        </div>
    );
}
