import { useState } from 'react';
import { ChevronRight, Database, Plus, Trash2, MapPin } from 'lucide-react';
import { ConfigSection } from './list/listFieldUi';
import { ColorPicker } from '../common/ColorPicker';
import type { WidgetConfig } from '../../types';
import type {
    MapMarker,
    MapMarkerMode,
    MapStyle,
    MapQuickView,
    MapChipsPosition,
    MapChipsCorner,
    MapLine,
    MapLineSource,
    MapLineInfoMode,
} from '../widgets/MapWidget';
import type { RouteProfile } from '../../utils/mapTrack';

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
    /** Opens the shared datapoint picker for a line's datapoint. */
    onPickLineDp: (idx: number) => void;
}

const LINE_SOURCES: { value: MapLineSource; label: string }[] = [
    { value: 'route', label: 'Route zwischen zwei Markern' },
    { value: 'json', label: 'Strecke aus JSON-DP (Punkteliste)' },
    { value: 'history', label: 'Strecke aus Verlauf eines Positions-DPs' },
];

const ROUTE_PROFILES: { value: RouteProfile; label: string }[] = [
    { value: 'car', label: 'Auto' },
    { value: 'bike', label: 'Fahrrad' },
    { value: 'foot', label: 'Zu Fuß' },
];

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

const CORNER_LABELS: { value: MapChipsCorner; label: string }[] = [
    { value: 'top-left', label: 'Oben links' },
    { value: 'top-right', label: 'Oben rechts' },
    { value: 'bottom-left', label: 'Unten links' },
    { value: 'bottom-right', label: 'Unten rechts' },
];

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

export function MapConfig({ config, onConfigChange, onPickMarkerDp, onPickQuickViewDp, onPickLineDp }: Props) {
    const o = config.options ?? {};
    const markers: MapMarker[] = Array.isArray(o.markers) ? (o.markers as MapMarker[]) : [];

    const set = (patch: Record<string, unknown>) => onConfigChange({ ...config, options: { ...o, ...patch } });

    // Marker, line and chip cards fold down to their header row. Entries start folded so a
    // long list stays scannable; a freshly added one opens, because it still needs filling in.
    const [openItems, setOpenItems] = useState<Set<string>>(() => new Set());
    const isItemOpen = (id: string) => openItems.has(id);
    const toggleItem = (id: string) =>
        setOpenItems((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    const openItem = (id: string) => {
        setOpenItems((prev) => new Set(prev).add(id));
        return id;
    };
    const setMarkers = (next: MapMarker[]) => set({ markers: next });
    const patchMarker = (idx: number, patch: Partial<MapMarker>) =>
        setMarkers(markers.map((m, i) => (i === idx ? { ...m, ...patch } : m)));

    const addMarker = () =>
        setMarkers([...markers, { id: openItem(genId()), mode: 'latlon', label: '', emoji: '📍', color: '#2563eb' }]);
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
        setQuickViews([
            ...quickViews,
            { id: openItem(genId()), mode: 'static', label: '', emoji: '📍', color: '#2563eb' },
        ]);
    const removeQuickView = (idx: number) => setQuickViews(quickViews.filter((_, i) => i !== idx));

    const lines: MapLine[] = Array.isArray(o.lines) ? (o.lines as MapLine[]) : [];
    const setLines = (next: MapLine[]) => set({ lines: next.length ? next : undefined });
    const patchLine = (idx: number, patch: Partial<MapLine>) =>
        setLines(lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
    const addLine = () =>
        setLines([
            ...lines,
            {
                id: openItem(genId()),
                source: 'route',
                fromMarkerId: markers[0]?.id,
                toMarkerId: markers[1]?.id,
            },
        ]);
    const removeLine = (idx: number) => setLines(lines.filter((_, i) => i !== idx));
    const lineInfo: MapLineInfoMode = (o.lineInfo as MapLineInfoMode | undefined) ?? 'bottom-left';
    const numOrUndef = (v: string) => (v === '' ? undefined : Number(v));

    // Runtime map-type switcher. An empty `styleChoices` means "offer all types",
    // which is why the option is stored as undefined once nothing is picked.
    const showStyleChips = o.showStyleChips === true;
    const styleChipsCorner: MapChipsCorner = (o.styleChipsCorner as MapChipsCorner) || 'top-left';
    const styleChoices: MapStyle[] = Array.isArray(o.styleChoices) ? (o.styleChoices as MapStyle[]) : [];
    const toggleStyleChoice = (value: MapStyle) => {
        const on = styleChoices.includes(value);
        // Rebuild from MAP_STYLES so the chips keep the preset order while toggling.
        const next = MAP_STYLES.map((s) => s.value).filter((s) => (s === value ? !on : styleChoices.includes(s)));
        set({ styleChoices: next.length ? next : undefined });
    };

    return (
        <div className="space-y-2">
            {/* ── Map style ── */}
            <ConfigSection title="Kartentyp">
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

                {/* ── Runtime map-type switcher ── */}
                <div>
                    <div className="flex items-center justify-between">
                        <label className={lblCls} style={lblSty}>
                            Kartentyp im Frontend umschaltbar
                        </label>
                        <Toggle value={showStyleChips} onToggle={() => set({ showStyleChips: !showStyleChips })} />
                    </div>
                    <p className="text-[10px]" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
                        Blendet Chips über der Karte ein, mit denen der Kartentyp im laufenden Betrieb gewechselt wird.
                    </p>

                    {showStyleChips && (
                        <div className="mt-2 space-y-2">
                            <div>
                                <label className={lblCls} style={lblSty}>
                                    Ecke der Chips
                                </label>
                                <select
                                    value={styleChipsCorner}
                                    onChange={(e) => set({ styleChipsCorner: e.target.value as MapChipsCorner })}
                                    className={iCls}
                                    style={iSty}
                                >
                                    {CORNER_LABELS.map((c) => (
                                        <option key={c.value} value={c.value}>
                                            {c.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className={lblCls} style={lblSty}>
                                    Auswählbare Kartentypen
                                </label>
                                <div className="flex flex-wrap gap-1">
                                    {MAP_STYLES.map((s) => {
                                        const on = styleChoices.includes(s.value);
                                        return (
                                            <button
                                                key={s.value}
                                                type="button"
                                                onClick={() => toggleStyleChoice(s.value)}
                                                className="px-2 py-1 rounded-full text-[11px] hover:opacity-80"
                                                style={{
                                                    background: on ? 'var(--accent)' : 'var(--app-bg)',
                                                    color: on ? '#fff' : 'var(--text-secondary)',
                                                    border: `1px solid ${on ? 'var(--accent)' : 'var(--app-border)'}`,
                                                }}
                                            >
                                                {s.label}
                                            </button>
                                        );
                                    })}
                                </div>
                                <p
                                    className="text-[10px] mt-0.5"
                                    style={{ color: 'var(--text-secondary)', opacity: 0.6 }}
                                >
                                    Ohne Auswahl werden alle Kartentypen angeboten.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </ConfigSection>

            {/* ── Markers ── */}
            <ConfigSection
                title={`Marker (${markers.length})`}
                action={
                    <button
                        type="button"
                        onClick={addMarker}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] normal-case tracking-normal hover:opacity-80"
                        style={{ background: 'var(--accent)', color: '#fff' }}
                    >
                        <Plus size={12} /> Marker
                    </button>
                }
            >
                <div>
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
                                    <button
                                        type="button"
                                        onClick={() => toggleItem(m.id)}
                                        className="p-1 rounded hover:opacity-80 shrink-0"
                                        style={{ color: 'var(--text-secondary)' }}
                                        title={isItemOpen(m.id) ? 'Einklappen' : 'Ausklappen'}
                                        aria-expanded={isItemOpen(m.id)}
                                        data-aura-map-item-toggle
                                    >
                                        <ChevronRight
                                            size={14}
                                            className="transition-transform"
                                            style={{ transform: isItemOpen(m.id) ? 'rotate(90deg)' : undefined }}
                                        />
                                    </button>
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
                                    <ColorPicker
                                        value={m.color ?? '#2563eb'}
                                        onChange={(v) => patchMarker(idx, { color: v })}
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

                                {isItemOpen(m.id) && (
                                    <>
                                        <select
                                            value={m.mode}
                                            onChange={(e) =>
                                                patchMarker(idx, { mode: e.target.value as MapMarkerMode })
                                            }
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
                                                <p
                                                    className="text-[10px]"
                                                    style={{ color: 'var(--text-secondary)', opacity: 0.6 }}
                                                >
                                                    DP mit Objekt/JSON wie {'{ "lat": 52.5, "lon": 13.4 }'} – Schlüssel
                                                    lat/latitude und lon/lng/longitude werden automatisch erkannt.
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
                                                    onChange={(e) =>
                                                        patchMarker(idx, { address: e.target.value || undefined })
                                                    }
                                                    placeholder="z.B. Marienplatz 1, München"
                                                    className={iCls}
                                                    style={iSty}
                                                />
                                                <p
                                                    className="text-[10px]"
                                                    style={{ color: 'var(--text-secondary)', opacity: 0.6 }}
                                                >
                                                    Wird per OpenStreetMap (Photon) in Koordinaten umgewandelt – feste
                                                    Position, keine Live-Verfolgung.
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
                                                            lat:
                                                                e.target.value === ''
                                                                    ? undefined
                                                                    : Number(e.target.value),
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
                                                            lon:
                                                                e.target.value === ''
                                                                    ? undefined
                                                                    : Number(e.target.value),
                                                        })
                                                    }
                                                    placeholder="Lon (z.B. 13.405)"
                                                    className={iCls}
                                                    style={iSty}
                                                />
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </ConfigSection>

            {/* ── Lines: routes + recorded tracks ── */}
            <ConfigSection
                title={`Linien (${lines.length})`}
                action={
                    <button
                        type="button"
                        onClick={addLine}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] normal-case tracking-normal hover:opacity-80"
                        style={{ background: 'var(--accent)', color: '#fff' }}
                        data-aura-map-add-line
                    >
                        <Plus size={12} /> Linie
                    </button>
                }
            >
                <div>
                    {lines.length === 0 ? (
                        <p className="text-[10px]" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
                            Route zwischen zwei Markern (z.B. Zuhause → Tankstelle) oder eine aufgezeichnete Strecke aus
                            einem Datenpunkt.
                        </p>
                    ) : (
                        <>
                            <div className="mb-2">
                                <label className={lblCls} style={lblSty}>
                                    Infokasten mit Länge
                                </label>
                                <select
                                    value={lineInfo}
                                    onChange={(e) =>
                                        set({
                                            lineInfo:
                                                e.target.value === 'bottom-left'
                                                    ? undefined
                                                    : (e.target.value as MapLineInfoMode),
                                        })
                                    }
                                    className={iCls}
                                    style={iSty}
                                >
                                    {CORNER_LABELS.map((c) => (
                                        <option key={c.value} value={c.value}>
                                            {c.label}
                                        </option>
                                    ))}
                                    <option value="off">Ausblenden</option>
                                </select>
                            </div>

                            <div className="mb-2 space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                    <label className="text-[11px]" style={lblSty}>
                                        Tag wählen (‹ Datum › über der Karte)
                                    </label>
                                    <Toggle
                                        value={o.dayNav === true}
                                        onToggle={() => set({ dayNav: o.dayNav === true ? undefined : true })}
                                    />
                                </div>
                                <div className="flex items-center justify-between gap-2">
                                    <label className="text-[11px]" style={lblSty}>
                                        Linien per Chips umschalten
                                    </label>
                                    <Toggle
                                        value={o.lineChips === true}
                                        onToggle={() => set({ lineChips: o.lineChips === true ? undefined : true })}
                                    />
                                </div>
                                {o.lineChips === true && (
                                    <div className="flex items-center justify-between gap-2 pl-3">
                                        <label className="text-[11px]" style={lblSty}>
                                            Mehrere Linien gleichzeitig (sonst immer nur eine)
                                        </label>
                                        <Toggle
                                            value={o.lineChipsMulti === true}
                                            onToggle={() =>
                                                set({ lineChipsMulti: o.lineChipsMulti === true ? undefined : true })
                                            }
                                        />
                                    </div>
                                )}
                                <div className="flex items-center justify-between gap-2">
                                    <label className="text-[11px]" style={lblSty}>
                                        Zeitleiste mit Aufenthalten und Fahrten
                                    </label>
                                    <Toggle
                                        value={o.timeline === true}
                                        onToggle={() => set({ timeline: o.timeline === true ? undefined : true })}
                                    />
                                </div>
                                {o.timeline === true && (
                                    <>
                                        <div className="grid grid-cols-2 gap-1 pl-3">
                                            <div>
                                                <label className={lblCls} style={lblSty}>
                                                    Aufenthalt: Radius (m)
                                                </label>
                                                <input
                                                    type="number"
                                                    min={10}
                                                    value={(o.stayRadius as number | undefined) ?? ''}
                                                    onChange={(e) => set({ stayRadius: numOrUndef(e.target.value) })}
                                                    placeholder="100"
                                                    className={iCls}
                                                    style={iSty}
                                                />
                                            </div>
                                            <div>
                                                <label className={lblCls} style={lblSty}>
                                                    Aufenthalt: ab Minuten
                                                </label>
                                                <input
                                                    type="number"
                                                    min={1}
                                                    value={(o.stayMinutes as number | undefined) ?? ''}
                                                    onChange={(e) => set({ stayMinutes: numOrUndef(e.target.value) })}
                                                    placeholder="10"
                                                    className={iCls}
                                                    style={iSty}
                                                />
                                            </div>
                                        </div>
                                        <p
                                            className="text-[10px] pl-3"
                                            style={{ color: 'var(--text-secondary)', opacity: 0.6 }}
                                        >
                                            Für die erste sichtbare Strecke (JSON oder Verlauf, mit Zeitstempeln).
                                            Adressen kommen von OpenStreetMap (Photon); liegt ein Aufenthalt an einem
                                            Marker mit festen Koordinaten oder Adresse, erscheint dessen Name mit ★.
                                        </p>
                                    </>
                                )}
                            </div>

                            <div className="space-y-2">
                                {lines.map((l, idx) => (
                                    <div
                                        key={l.id}
                                        className="rounded-lg p-2 space-y-2"
                                        style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}
                                    >
                                        <div className="flex gap-1 items-center">
                                            <button
                                                type="button"
                                                onClick={() => toggleItem(l.id)}
                                                className="p-1 rounded hover:opacity-80 shrink-0"
                                                style={{ color: 'var(--text-secondary)' }}
                                                title={isItemOpen(l.id) ? 'Einklappen' : 'Ausklappen'}
                                                aria-expanded={isItemOpen(l.id)}
                                                data-aura-map-item-toggle
                                            >
                                                <ChevronRight
                                                    size={14}
                                                    className="transition-transform"
                                                    style={{
                                                        transform: isItemOpen(l.id) ? 'rotate(90deg)' : undefined,
                                                    }}
                                                />
                                            </button>
                                            <input
                                                type="text"
                                                value={l.label ?? ''}
                                                onChange={(e) => patchLine(idx, { label: e.target.value || undefined })}
                                                placeholder="Bezeichnung (optional)"
                                                className={`${iCls} flex-1 min-w-0`}
                                                style={iSty}
                                            />
                                            <ColorPicker
                                                value={l.color ?? (l.source === 'route' ? '#2563eb' : '#e11d48')}
                                                onChange={(v) => patchLine(idx, { color: v })}
                                                className="w-8 h-8 rounded-lg cursor-pointer shrink-0"
                                                style={{
                                                    background: 'var(--app-bg)',
                                                    border: '1px solid var(--app-border)',
                                                }}
                                                title="Linienfarbe"
                                            />
                                            <input
                                                type="number"
                                                min={1}
                                                max={12}
                                                value={l.width ?? ''}
                                                onChange={(e) => patchLine(idx, { width: numOrUndef(e.target.value) })}
                                                placeholder="4"
                                                className="w-12 text-xs rounded-lg px-1.5 py-2 focus:outline-none shrink-0"
                                                style={iSty}
                                                title="Linienstärke (px)"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => removeLine(idx)}
                                                className="p-1.5 rounded-lg hover:opacity-80 shrink-0"
                                                style={{ color: 'var(--danger, #ef4444)' }}
                                                title="Linie entfernen"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>

                                        {isItemOpen(l.id) && (
                                            <>
                                                <select
                                                    value={l.source}
                                                    onChange={(e) =>
                                                        patchLine(idx, { source: e.target.value as MapLineSource })
                                                    }
                                                    className={iCls}
                                                    style={iSty}
                                                >
                                                    {LINE_SOURCES.map((opt) => (
                                                        <option key={opt.value} value={opt.value}>
                                                            {opt.label}
                                                        </option>
                                                    ))}
                                                </select>

                                                {l.source === 'route' && (
                                                    <>
                                                        <div className="grid grid-cols-2 gap-1">
                                                            {(['fromMarkerId', 'toMarkerId'] as const).map((field) => (
                                                                <div key={field}>
                                                                    <label className={lblCls} style={lblSty}>
                                                                        {field === 'fromMarkerId' ? 'Start' : 'Ziel'}
                                                                    </label>
                                                                    <select
                                                                        value={l[field] ?? ''}
                                                                        onChange={(e) =>
                                                                            patchLine(idx, {
                                                                                [field]: e.target.value || undefined,
                                                                            })
                                                                        }
                                                                        className={iCls}
                                                                        style={iSty}
                                                                    >
                                                                        <option value="">– Marker –</option>
                                                                        {markers.map((m) => (
                                                                            <option key={m.id} value={m.id}>
                                                                                {m.label || m.id}
                                                                            </option>
                                                                        ))}
                                                                    </select>
                                                                </div>
                                                            ))}
                                                        </div>
                                                        <div>
                                                            <label className={lblCls} style={lblSty}>
                                                                Fortbewegung
                                                            </label>
                                                            <select
                                                                value={l.profile ?? 'car'}
                                                                onChange={(e) =>
                                                                    patchLine(idx, {
                                                                        profile:
                                                                            e.target.value === 'car'
                                                                                ? undefined
                                                                                : (e.target.value as RouteProfile),
                                                                    })
                                                                }
                                                                className={iCls}
                                                                style={iSty}
                                                            >
                                                                {ROUTE_PROFILES.map((p) => (
                                                                    <option key={p.value} value={p.value}>
                                                                        {p.label}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                        <p
                                                            className="text-[10px]"
                                                            style={{ color: 'var(--text-secondary)', opacity: 0.6 }}
                                                        >
                                                            Berechnet über OpenStreetMap (OSRM, FOSSGIS) entlang der
                                                            Straßen. Bewegt sich ein Marker, wird die Route höchstens
                                                            alle 30 s neu berechnet.
                                                        </p>
                                                    </>
                                                )}

                                                {(l.source === 'json' || l.source === 'history') && (
                                                    <>
                                                        <DpField
                                                            value={l.dp ?? ''}
                                                            placeholder={
                                                                l.source === 'json'
                                                                    ? 'DP mit Punkteliste (JSON)'
                                                                    : 'Positions-DP mit Verlauf'
                                                            }
                                                            onChange={(v) => patchLine(idx, { dp: v || undefined })}
                                                            onPick={() => onPickLineDp(idx)}
                                                        />
                                                        <p
                                                            className="text-[10px]"
                                                            style={{ color: 'var(--text-secondary)', opacity: 0.6 }}
                                                        >
                                                            {l.source === 'json'
                                                                ? 'Liste von Punkten ({ "lat", "lon", "timestamp", "speed", "accuracy" }), auch unter "points" in einem Objekt mit "name"/"lineColor", oder GeoJSON.'
                                                                : 'DP mit Position als JSON-Objekt oder "lat,lon" und aktivem History-/InfluxDB-/SQL-Adapter.'}
                                                        </p>
                                                        {l.source === 'json' && (
                                                            <input
                                                                type="text"
                                                                value={l.pointsPath ?? ''}
                                                                onChange={(e) =>
                                                                    patchLine(idx, {
                                                                        pointsPath: e.target.value || undefined,
                                                                    })
                                                                }
                                                                placeholder="Pfad zur Liste (leer = automatisch)"
                                                                className={`${iCls} font-mono`}
                                                                style={iSty}
                                                            />
                                                        )}
                                                        <div className="grid grid-cols-2 gap-1">
                                                            <input
                                                                type="text"
                                                                value={l.latPath ?? ''}
                                                                onChange={(e) =>
                                                                    patchLine(idx, {
                                                                        latPath: e.target.value || undefined,
                                                                    })
                                                                }
                                                                placeholder="Lat-Schlüssel (auto)"
                                                                className={`${iCls} font-mono`}
                                                                style={iSty}
                                                            />
                                                            <input
                                                                type="text"
                                                                value={l.lonPath ?? ''}
                                                                onChange={(e) =>
                                                                    patchLine(idx, {
                                                                        lonPath: e.target.value || undefined,
                                                                    })
                                                                }
                                                                placeholder="Lon-Schlüssel (auto)"
                                                                className={`${iCls} font-mono`}
                                                                style={iSty}
                                                            />
                                                        </div>
                                                        {l.source === 'history' && (
                                                            <>
                                                                <div className="grid grid-cols-2 gap-1">
                                                                    <div>
                                                                        <label className={lblCls} style={lblSty}>
                                                                            Zeitraum (Stunden)
                                                                        </label>
                                                                        <input
                                                                            type="number"
                                                                            min={1}
                                                                            value={l.historyHours ?? ''}
                                                                            onChange={(e) =>
                                                                                patchLine(idx, {
                                                                                    historyHours: numOrUndef(
                                                                                        e.target.value,
                                                                                    ),
                                                                                })
                                                                            }
                                                                            placeholder="24"
                                                                            className={iCls}
                                                                            style={iSty}
                                                                        />
                                                                    </div>
                                                                    <div>
                                                                        <label className={lblCls} style={lblSty}>
                                                                            Max. Punkte
                                                                        </label>
                                                                        <input
                                                                            type="number"
                                                                            min={2}
                                                                            value={l.maxPoints ?? ''}
                                                                            onChange={(e) =>
                                                                                patchLine(idx, {
                                                                                    maxPoints: numOrUndef(
                                                                                        e.target.value,
                                                                                    ),
                                                                                })
                                                                            }
                                                                            placeholder="500"
                                                                            className={iCls}
                                                                            style={iSty}
                                                                        />
                                                                    </div>
                                                                </div>
                                                                <input
                                                                    type="text"
                                                                    value={l.historyInstance ?? ''}
                                                                    onChange={(e) =>
                                                                        patchLine(idx, {
                                                                            historyInstance:
                                                                                e.target.value.trim() || undefined,
                                                                        })
                                                                    }
                                                                    placeholder="History-Instanz (leer = automatisch, z.B. history.0)"
                                                                    className={`${iCls} font-mono`}
                                                                    style={iSty}
                                                                />
                                                            </>
                                                        )}
                                                        <div className="flex items-center justify-between gap-2">
                                                            <label className="text-[11px]" style={lblSty}>
                                                                Einzelne Punkte anzeigen (Klick: Zeit, Tempo,
                                                                Genauigkeit)
                                                            </label>
                                                            <Toggle
                                                                value={l.showPoints === true}
                                                                onToggle={() =>
                                                                    patchLine(idx, {
                                                                        showPoints:
                                                                            l.showPoints === true ? undefined : true,
                                                                    })
                                                                }
                                                            />
                                                        </div>
                                                    </>
                                                )}
                                            </>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </ConfigSection>

            {/* ── Quick-access chips ── */}
            <ConfigSection
                title={`Schnellzugriff-Chips (${quickViews.length})`}
                action={
                    <button
                        type="button"
                        onClick={addQuickView}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] normal-case tracking-normal hover:opacity-80"
                        style={{ background: 'var(--accent)', color: '#fff' }}
                    >
                        <Plus size={12} /> Chip
                    </button>
                }
            >
                <div>
                    {quickViews.length === 0 ? (
                        <p className="text-[10px]" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
                            Chips springen per Klick zu einer festen Position auf der Karte (z.B. {'„Zuhause“, „Büro“'}
                            ).
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
                                        {CORNER_LABELS.map((c) => (
                                            <option key={c.value} value={c.value}>
                                                {c.label}
                                            </option>
                                        ))}
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
                                            <button
                                                type="button"
                                                onClick={() => toggleItem(v.id)}
                                                className="p-1 rounded hover:opacity-80 shrink-0"
                                                style={{ color: 'var(--text-secondary)' }}
                                                title={isItemOpen(v.id) ? 'Einklappen' : 'Ausklappen'}
                                                aria-expanded={isItemOpen(v.id)}
                                                data-aura-map-item-toggle
                                            >
                                                <ChevronRight
                                                    size={14}
                                                    className="transition-transform"
                                                    style={{
                                                        transform: isItemOpen(v.id) ? 'rotate(90deg)' : undefined,
                                                    }}
                                                />
                                            </button>
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
                                            <ColorPicker
                                                value={v.color ?? '#2563eb'}
                                                onChange={(val) => patchQuickView(idx, { color: val })}
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

                                        {isItemOpen(v.id) && (
                                            <>
                                                <div className="flex items-center justify-between gap-2">
                                                    <label className="text-[11px]" style={lblSty}>
                                                        Farbe als Füllung (statt nur Rahmen)
                                                    </label>
                                                    <Toggle
                                                        value={v.filled === true}
                                                        onToggle={() =>
                                                            patchQuickView(idx, {
                                                                filled: v.filled === true ? undefined : true,
                                                            })
                                                        }
                                                    />
                                                </div>

                                                <select
                                                    value={v.mode ?? 'static'}
                                                    onChange={(e) =>
                                                        patchQuickView(idx, { mode: e.target.value as MapMarkerMode })
                                                    }
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
                                                            onChange={(val) =>
                                                                patchQuickView(idx, { jsonDp: val || undefined })
                                                            }
                                                            onPick={() => onPickQuickViewDp(idx, 'jsonDp')}
                                                        />
                                                        <p
                                                            className="text-[10px]"
                                                            style={{ color: 'var(--text-secondary)', opacity: 0.6 }}
                                                        >
                                                            DP mit Objekt/JSON wie {'{ "lat": 52.5, "lon": 13.4 }'} –
                                                            Schlüssel lat/latitude und lon/lng/longitude werden
                                                            automatisch erkannt.
                                                        </p>
                                                    </>
                                                )}

                                                {(v.mode ?? 'static') === 'latlon' && (
                                                    <div className="grid grid-cols-1 gap-1">
                                                        <DpField
                                                            value={v.latDp ?? ''}
                                                            placeholder="Latitude-DP"
                                                            onChange={(val) =>
                                                                patchQuickView(idx, { latDp: val || undefined })
                                                            }
                                                            onPick={() => onPickQuickViewDp(idx, 'latDp')}
                                                        />
                                                        <DpField
                                                            value={v.lonDp ?? ''}
                                                            placeholder="Longitude-DP"
                                                            onChange={(val) =>
                                                                patchQuickView(idx, { lonDp: val || undefined })
                                                            }
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
                                                                patchQuickView(idx, {
                                                                    address: e.target.value || undefined,
                                                                })
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
                                                                    lat:
                                                                        e.target.value === ''
                                                                            ? undefined
                                                                            : Number(e.target.value),
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
                                                                    lon:
                                                                        e.target.value === ''
                                                                            ? undefined
                                                                            : Number(e.target.value),
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
                                                                zoom:
                                                                    e.target.value === ''
                                                                        ? undefined
                                                                        : Number(e.target.value),
                                                            })
                                                        }
                                                        placeholder="aktuelle Zoomstufe beibehalten"
                                                        className={iCls}
                                                        style={iSty}
                                                    />
                                                </div>
                                            </>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </ConfigSection>

            {/* ── View ── */}
            <ConfigSection title="Ansicht & Entfernung">
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
            </ConfigSection>

            {/* ── Custom tile server: no longer offered. Maps that already have one keep
                 using it (the widget still reads tileUrl); here it can only be removed. ── */}
            {!!o.tileUrl && (
                <ConfigSection title="Eigener Kachel-Server">
                    <div data-aura-map-legacy-tiles>
                        <div className="flex gap-1">
                            <input
                                type="text"
                                value={o.tileUrl as string}
                                readOnly
                                className={`${iCls} flex-1 min-w-0 font-mono`}
                                style={{ ...iSty, opacity: 0.7 }}
                            />
                            <button
                                type="button"
                                onClick={() => set({ tileUrl: undefined, tileAttribution: undefined })}
                                className="px-2 rounded-lg hover:opacity-80 shrink-0"
                                style={{ color: 'var(--danger, #ef4444)', border: '1px solid var(--app-border)' }}
                                title="Eigenen Kachel-Server entfernen"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                        <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
                            Wird nicht mehr angeboten, bleibt aber in Betrieb. Nach dem Entfernen gilt der Kartentyp.
                        </p>
                    </div>
                </ConfigSection>
            )}
        </div>
    );
}
