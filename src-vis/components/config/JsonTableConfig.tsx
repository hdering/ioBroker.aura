import { useMemo, useState } from 'react';
import { Plus, Trash2, ChevronUp, ChevronDown, RefreshCw, AlignLeft, AlignCenter, AlignRight } from 'lucide-react';
import { parseJson, type JsonColumnDef } from '../widgets/JsonTableWidget';
import { ColorPicker } from '../common/ColorPicker';
import { ImagePathHint } from './ImagePathHint';
import { getStateDirect } from '../../hooks/useIoBroker';
import { useDatapoint } from '../../hooks/useDatapoint';
import { useT } from '../../i18n';
import {
    VALUE_TRANSFORM_PRESETS,
    applyValueTransform,
    chooseTransformPreset,
    selectedTransformPreset,
} from '../../utils/valueTransform';
import { TIME_DISPLAY_PRESETS, formatTimeDisplay, hasTimeDisplay } from '../../utils/timeDisplay';
import { NUMBER_FORMATS, NUMBER_FORMAT_SAMPLES, type NumberFormat } from '../../utils/formatValue';
import { useGlobalSettingsStore } from '../../store/globalSettingsStore';

interface Props {
    datapoint: string;
    options: Record<string, unknown>;
    onChange: (patch: Record<string, unknown>) => void;
}

const jCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none';
/** Tighter field, for the format sections nested inside a column card. */
const fmtCls = 'w-full text-xs rounded-lg px-2 py-1 focus:outline-none';
const fmtMonoCls = `${fmtCls} font-mono`;
const hintSty: React.CSSProperties = { color: 'var(--text-secondary)', opacity: 0.7 };
const jSty: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};

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

function parseHeadersFromRaw(raw: unknown): string[] | null {
    let data: unknown;
    if (typeof raw === 'string') {
        try {
            data = JSON.parse(raw as string);
        } catch {
            return null;
        }
    } else {
        data = raw;
    }
    if (!data) return null;
    if (
        Array.isArray(data) &&
        data.length > 0 &&
        typeof data[0] === 'object' &&
        data[0] !== null &&
        !Array.isArray(data[0])
    ) {
        return Object.keys(data[0] as object);
    }
    if (Array.isArray(data) && data.length > 1 && Array.isArray(data[0])) {
        return (data[0] as unknown[]).map(String);
    }
    if (!Array.isArray(data) && typeof data === 'object' && 'headers' in (data as object)) {
        return (data as { headers: unknown[] }).headers.map(String);
    }
    return null;
}

export function JsonTableConfig({ datapoint, options: o, onChange }: Props) {
    const set = (patch: Record<string, unknown>) => onChange(patch);

    const colDefs: JsonColumnDef[] = (o.columns as JsonColumnDef[] | undefined) ?? [];
    const setColDefs = (cols: JsonColumnDef[]) => set({ columns: cols });

    const [newKey, setNewKey] = useState('');
    const [loading, setLoading] = useState(false);
    const t = useT();
    const globalNumFmt = useGlobalSettingsStore((s) => s.numberFormat);

    // First row of the live data — the format section previews against it, so
    // "Millisekunden-Stempel wird zu 10.07.2024" is verifiable before saving.
    const { value: liveValue } = useDatapoint(datapoint);
    const liveTable = useMemo(() => parseJson(liveValue), [liveValue]);
    const sampleRow = liveTable?.rows[0];

    // The two format switches work like the Bild/HTML ones, but they have no flag of
    // their own — they stand for a group of values. So the switch reads those values,
    // and a switch turned on before anything is picked is remembered here until then.
    const [formatOpen, setFormatOpen] = useState<Record<string, { time?: boolean; convert?: boolean }>>({});
    const timeShown = (c: JsonColumnDef) => formatOpen[c.key]?.time ?? hasTimeDisplay(c.valueTimeFormat);
    const convertShown = (c: JsonColumnDef) =>
        formatOpen[c.key]?.convert ??
        (c.valueTransform !== undefined ||
            c.valueFactor !== undefined ||
            c.valueOffset !== undefined ||
            c.decimals !== undefined ||
            c.numberFormat !== undefined);
    const setFormatFlag = (key: string, flag: 'time' | 'convert', on: boolean) =>
        setFormatOpen((prev) => ({ ...prev, [key]: { ...prev[key], [flag]: on } }));

    /** What the first row's cell will look like - also says when a value is no time at all. */
    const previewFormat = (col: JsonColumnDef, sample: unknown): string => {
        if (sample === null || sample === undefined || sample === '') return 'Kein Beispielwert';
        const value = applyValueTransform(sample, col.valueFactor, col.valueOffset);
        return (
            formatTimeDisplay(value, col.valueTimeFormat ?? 'datetime', t, col.valueTimePattern) ??
            'Wert ist keine Zeit'
        );
    };

    function boolOpt(key: string, def: boolean): boolean {
        return (o[key] as boolean) ?? def;
    }

    function toggleOpt(key: string, def: boolean) {
        set({ [key]: !boolOpt(key, def) });
    }

    async function loadFromDatapoint() {
        if (!datapoint) return;
        setLoading(true);
        try {
            const state = await getStateDirect(datapoint);
            const headers = parseHeadersFromRaw(state?.val);
            if (headers && headers.length > 0) {
                // Merge with existing colDefs: keep existing defs, add new keys
                const existingKeys = new Set(colDefs.map((c) => c.key));
                const newDefs: JsonColumnDef[] = [...colDefs];
                headers.forEach((h, i) => {
                    if (!existingKeys.has(h)) {
                        newDefs.push({ key: h, order: colDefs.length + i });
                    }
                });
                // Re-assign order to match header sequence
                const orderedDefs = headers.map((h, i) => {
                    const existing = newDefs.find((c) => c.key === h);
                    return existing ? { ...existing, order: i } : { key: h, order: i };
                });
                setColDefs(orderedDefs);
            }
        } finally {
            setLoading(false);
        }
    }

    function addColumn() {
        const k = newKey.trim();
        if (!k || colDefs.some((c) => c.key === k)) return;
        setColDefs([...colDefs, { key: k, order: colDefs.length }]);
        setNewKey('');
    }

    function updateCol(idx: number, patch: Partial<JsonColumnDef>) {
        const updated = colDefs.map((c, i) => (i === idx ? { ...c, ...patch } : c));
        setColDefs(updated);
    }

    /** Datum/Zeit switch: on picks a default so the column changes right away, off clears it. */
    function toggleTimeFormat(idx: number, col: JsonColumnDef) {
        const on = !timeShown(col);
        setFormatFlag(col.key, 'time', on);
        updateCol(
            idx,
            on
                ? { valueTimeFormat: col.valueTimeFormat ?? 'datetime' }
                : { valueTimeFormat: undefined, valueTimePattern: undefined },
        );
    }

    /** Zahlenformat switch: off takes factor, offset, decimals and separator with it. */
    function toggleConvert(idx: number, col: JsonColumnDef) {
        const on = !convertShown(col);
        setFormatFlag(col.key, 'convert', on);
        if (!on) {
            updateCol(idx, {
                valueTransform: undefined,
                valueFactor: undefined,
                valueOffset: undefined,
                decimals: undefined,
                numberFormat: undefined,
            });
        }
    }

    function removeCol(idx: number) {
        setColDefs(colDefs.filter((_, i) => i !== idx));
    }

    function moveCol(idx: number, dir: -1 | 1) {
        const next = idx + dir;
        if (next < 0 || next >= colDefs.length) return;
        const arr = [...colDefs];
        [arr[idx], arr[next]] = [arr[next], arr[idx]];
        // Update order values to match position
        setColDefs(arr.map((c, i) => ({ ...c, order: i })));
    }

    const firstColHeader = boolOpt('firstColHeader', false);

    // Columns to offer as the default sort: the configured ones, else what the data holds.
    const defaultSortKey = (o.defaultSortKey as string | undefined) ?? '';
    const sortKeys = (() => {
        const keys =
            colDefs.length > 0 ? colDefs.filter((c) => !c.hidden).map((c) => c.key) : (liveTable?.headers ?? []);
        return defaultSortKey && !keys.includes(defaultSortKey) ? [...keys, defaultSortKey] : keys;
    })();
    const colLabel = (key: string) => colDefs.find((c) => c.key === key)?.label ?? key;

    return (
        <>
            {/* Auto-height */}
            <div className="flex items-center justify-between">
                <div>
                    <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        Höhe automatisch anpassen
                    </label>
                    <p className="text-[10px]" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                        Widget-Höhe folgt der Anzahl der Zeilen
                    </p>
                </div>
                <Toggle value={boolOpt('autoHeight', false)} onToggle={() => toggleOpt('autoHeight', false)} />
            </div>

            {/* Search */}
            <div className="flex items-center justify-between">
                <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    Suche anzeigen
                </label>
                <Toggle value={boolOpt('showSearch', false)} onToggle={() => toggleOpt('showSearch', false)} />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between">
                <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    Kopfzeile anzeigen
                </label>
                <Toggle value={boolOpt('showHeader', true)} onToggle={() => toggleOpt('showHeader', true)} />
            </div>
            {boolOpt('showHeader', true) && (
                <>
                    <div className="flex items-center gap-2">
                        <ColorPicker
                            // The whole value: the picker takes a theme token and a
                            // light/dark pair, and handing it a default instead would
                            // write that default back over the pair (#689).
                            value={(o.headerBg as string) || '#6366f1'}
                            onChange={(v) => set({ headerBg: v })}
                            className="w-8 h-7 rounded cursor-pointer shrink-0"
                            style={{ border: '1px solid var(--app-border)', padding: '1px' }}
                        />
                        <div className="flex-1">
                            <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                                Header-Hintergrund
                            </label>
                            <input
                                type="text"
                                value={(o.headerBg as string) ?? 'var(--accent)'}
                                onChange={(e) => set({ headerBg: e.target.value || undefined })}
                                placeholder="var(--accent)"
                                className={jCls}
                                style={jSty}
                            />
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <ColorPicker
                            value={(o.headerColor as string) || '#ffffff'}
                            onChange={(v) => set({ headerColor: v })}
                            className="w-8 h-7 rounded cursor-pointer shrink-0"
                            style={{ border: '1px solid var(--app-border)', padding: '1px' }}
                        />
                        <div className="flex-1">
                            <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                                Header-Textfarbe
                            </label>
                            <input
                                type="text"
                                value={(o.headerColor as string) ?? '#ffffff'}
                                onChange={(e) => set({ headerColor: e.target.value || undefined })}
                                placeholder="#ffffff"
                                className={jCls}
                                style={jSty}
                            />
                        </div>
                    </div>
                </>
            )}

            {/* First column as label */}
            <div className="flex items-center justify-between">
                <div>
                    <label className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                        Erste Spalte als Bezeichnung
                    </label>
                    <p className="text-[10px]" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                        Hebt die erste Spalte hervor
                    </p>
                </div>
                <Toggle value={firstColHeader} onToggle={() => toggleOpt('firstColHeader', false)} />
            </div>
            {firstColHeader && (
                <>
                    <div className="flex items-center gap-2">
                        <ColorPicker
                            value={(o.firstColBg as string) || '#1e1e2e'}
                            onChange={(v) => set({ firstColBg: v })}
                            className="w-8 h-7 rounded cursor-pointer shrink-0"
                            style={{ border: '1px solid var(--app-border)', padding: '1px' }}
                        />
                        <div className="flex-1">
                            <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                                Bezeichnungsspalte Hintergrund
                            </label>
                            <input
                                type="text"
                                value={(o.firstColBg as string) ?? 'var(--app-bg)'}
                                onChange={(e) => set({ firstColBg: e.target.value || undefined })}
                                placeholder="var(--app-bg)"
                                className={jCls}
                                style={jSty}
                            />
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <ColorPicker
                            value={(o.firstColColor as string) || '#8b8b9e'}
                            onChange={(v) => set({ firstColColor: v })}
                            className="w-8 h-7 rounded cursor-pointer shrink-0"
                            style={{ border: '1px solid var(--app-border)', padding: '1px' }}
                        />
                        <div className="flex-1">
                            <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                                Bezeichnungsspalte Textfarbe
                            </label>
                            <input
                                type="text"
                                value={(o.firstColColor as string) ?? 'var(--text-secondary)'}
                                onChange={(e) => set({ firstColColor: e.target.value || undefined })}
                                placeholder="var(--text-secondary)"
                                className={jCls}
                                style={jSty}
                            />
                        </div>
                    </div>
                </>
            )}

            {/* Striped rows */}
            <div className="flex items-center justify-between">
                <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    Zebra-Streifen
                </label>
                <Toggle value={boolOpt('striped', true)} onToggle={() => toggleOpt('striped', true)} />
            </div>

            {/* Font size */}
            <div>
                <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                    Schriftgröße (px)
                </label>
                <input
                    type="number"
                    min={8}
                    max={96}
                    value={(o.fontSize as number) ?? 12}
                    onChange={(e) => set({ fontSize: Number(e.target.value) })}
                    className={jCls}
                    style={jSty}
                />
            </div>

            {/* Sortable columns */}
            <div className="flex items-center justify-between">
                <div>
                    <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        Sortierbar
                    </label>
                    <p className="text-[10px]" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                        Klick auf Spaltenkopf sortiert (auf/ab/aus)
                    </p>
                </div>
                <Toggle value={boolOpt('sortable', false)} onToggle={() => toggleOpt('sortable', false)} />
            </div>

            {/* Default sort (#706) */}
            <div>
                <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                    Standard-Sortierung
                </label>
                <div className="flex items-center gap-2">
                    <select
                        value={defaultSortKey}
                        onChange={(e) => set({ defaultSortKey: e.target.value || undefined })}
                        className={`${jCls} flex-1`}
                        style={jSty}
                    >
                        <option value="">Keine (Reihenfolge der Daten)</option>
                        {sortKeys.map((k) => (
                            <option key={k} value={k}>
                                {colLabel(k)}
                            </option>
                        ))}
                    </select>
                    {defaultSortKey && (
                        <select
                            value={o.defaultSortDir === 'desc' ? 'desc' : 'asc'}
                            onChange={(e) => set({ defaultSortDir: e.target.value === 'desc' ? 'desc' : undefined })}
                            className={`${jCls} w-auto`}
                            style={jSty}
                        >
                            <option value="asc">Aufsteigend</option>
                            <option value="desc">Absteigend</option>
                        </select>
                    )}
                </div>
                <p className="text-[10px] mt-0.5" style={hintSty}>
                    Gilt beim Öffnen; ein Klick auf den Spaltenkopf (Sortierbar) überschreibt sie.
                </p>
            </div>

            {/* Max rows */}
            <div>
                <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                    Max. Zeilen (0 = alle)
                </label>
                <input
                    type="number"
                    min={0}
                    max={9999}
                    value={(o.maxRows as number) ?? 0}
                    onChange={(e) => set({ maxRows: Math.max(0, Number(e.target.value) || 0) || undefined })}
                    className={jCls}
                    style={jSty}
                />
            </div>

            {/* ── Columns editor ── */}
            <div className="mt-1">
                <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                        Spalten ({colDefs.length === 0 ? 'auto' : colDefs.length})
                    </label>
                    <button
                        onClick={loadFromDatapoint}
                        disabled={!datapoint || loading}
                        className="flex items-center gap-1 px-2 py-1 rounded text-[10px] transition-opacity disabled:opacity-40"
                        style={{ background: 'var(--app-border)', color: 'var(--text-primary)' }}
                        title="Spalten aus aktuellem Datenpunkt-Wert laden"
                    >
                        <RefreshCw size={9} className={loading ? 'animate-spin' : ''} />
                        Laden
                    </button>
                </div>

                {colDefs.length === 0 && (
                    <p className="text-[10px] mb-2" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
                        Keine Spalten konfiguriert – Reihenfolge und Namen werden aus den JSON-Daten übernommen.
                    </p>
                )}

                <div className="flex flex-col gap-1.5">
                    {colDefs.map((col, idx) => (
                        <div
                            key={col.key}
                            className="rounded-lg p-2 flex flex-col gap-1.5"
                            style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}
                        >
                            {/* Row 1: key + move + delete */}
                            <div className="flex items-center gap-1">
                                <span
                                    className="text-[10px] font-mono flex-1 truncate"
                                    style={{ color: 'var(--text-secondary)' }}
                                    title={col.key}
                                >
                                    {col.key}
                                </span>
                                <button
                                    onClick={() => moveCol(idx, -1)}
                                    disabled={idx === 0}
                                    className="p-0.5 rounded hover:opacity-70 disabled:opacity-25"
                                    style={{ color: 'var(--text-secondary)' }}
                                >
                                    <ChevronUp size={12} />
                                </button>
                                <button
                                    onClick={() => moveCol(idx, 1)}
                                    disabled={idx === colDefs.length - 1}
                                    className="p-0.5 rounded hover:opacity-70 disabled:opacity-25"
                                    style={{ color: 'var(--text-secondary)' }}
                                >
                                    <ChevronDown size={12} />
                                </button>
                                <button
                                    onClick={() => removeCol(idx)}
                                    className="p-0.5 rounded hover:opacity-70"
                                    style={{ color: 'var(--text-secondary)' }}
                                >
                                    <Trash2 size={12} />
                                </button>
                            </div>
                            {/* Row 2: label input */}
                            <input
                                type="text"
                                value={col.label ?? ''}
                                onChange={(e) => updateCol(idx, { label: e.target.value || undefined })}
                                placeholder={`Anzeigename (Standard: ${col.key})`}
                                className={jCls}
                                style={jSty}
                            />
                            {/* Row 3: toggles */}
                            <div className="flex items-center gap-3 flex-wrap">
                                <label className="flex items-center gap-1.5 cursor-pointer">
                                    <Toggle
                                        value={col.image ?? false}
                                        onToggle={() =>
                                            updateCol(idx, {
                                                image: !(col.image ?? false),
                                                html: (col.image ?? false) ? col.html : false,
                                                iconify: (col.image ?? false) ? col.iconify : false,
                                            })
                                        }
                                    />
                                    <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                                        Bild
                                    </span>
                                </label>
                                <label className="flex items-center gap-1.5 cursor-pointer">
                                    <Toggle
                                        value={col.html ?? false}
                                        onToggle={() =>
                                            updateCol(idx, {
                                                html: !(col.html ?? false),
                                                image: (col.html ?? false) ? col.image : false,
                                                iconify: (col.html ?? false) ? col.iconify : false,
                                            })
                                        }
                                    />
                                    <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                                        HTML
                                    </span>
                                </label>
                                <label
                                    className="flex items-center gap-1.5 cursor-pointer"
                                    title="mdi:..., material-symbols:..., lucide:... inline rendern"
                                >
                                    <Toggle
                                        value={col.iconify ?? false}
                                        onToggle={() =>
                                            updateCol(idx, {
                                                iconify: !(col.iconify ?? false),
                                                image: (col.iconify ?? false) ? col.image : false,
                                                html: (col.iconify ?? false) ? col.html : false,
                                            })
                                        }
                                    />
                                    <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                                        Icons
                                    </span>
                                </label>
                                <label className="flex items-center gap-1.5 cursor-pointer">
                                    <Toggle
                                        value={col.hidden ?? false}
                                        onToggle={() => updateCol(idx, { hidden: !(col.hidden ?? false) })}
                                    />
                                    <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                                        Ausblenden
                                    </span>
                                </label>
                                {/* A path or markup is nothing a value format could sensibly touch,
                                    so these two only show up for plain text columns. */}
                                {!col.image && !col.html && (
                                    <>
                                        <label
                                            className="flex items-center gap-1.5 cursor-pointer"
                                            title="Zeitstempel als Datum / Uhrzeit anzeigen"
                                        >
                                            <Toggle
                                                value={timeShown(col)}
                                                onToggle={() => toggleTimeFormat(idx, col)}
                                            />
                                            <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                                                Datum/Zeit
                                            </span>
                                        </label>
                                        <label
                                            className="flex items-center gap-1.5 cursor-pointer"
                                            title="Zahlen umrechnen, runden und mit Tausendertrennzeichen versehen"
                                        >
                                            <Toggle
                                                value={convertShown(col)}
                                                onToggle={() => toggleConvert(idx, col)}
                                            />
                                            <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                                                Zahlenformat
                                            </span>
                                        </label>
                                    </>
                                )}
                            </div>
                            {/* Row 3.5: width / alignment / wrap */}
                            <div className="flex items-center gap-2 flex-wrap">
                                <div className="flex items-center gap-1">
                                    <label className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                                        Breite
                                    </label>
                                    <input
                                        type="number"
                                        min={0}
                                        max={2000}
                                        value={col.width ?? ''}
                                        onChange={(e) => updateCol(idx, { width: Number(e.target.value) || undefined })}
                                        placeholder="auto"
                                        className="text-xs rounded-lg px-2 py-1 focus:outline-none w-16"
                                        style={jSty}
                                    />
                                    <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                                        px
                                    </span>
                                </div>
                                <div className="flex items-center gap-0.5">
                                    {(
                                        [
                                            ['left', AlignLeft],
                                            ['center', AlignCenter],
                                            ['right', AlignRight],
                                        ] as const
                                    ).map(([val, Ico]) => {
                                        const active = (col.align ?? 'left') === val;
                                        return (
                                            <button
                                                key={val}
                                                type="button"
                                                onClick={() =>
                                                    updateCol(idx, { align: val === 'left' ? undefined : val })
                                                }
                                                className="p-1 rounded transition-colors"
                                                style={{
                                                    background: active ? 'var(--accent)' : 'var(--app-border)',
                                                    color: active ? '#fff' : 'var(--text-secondary)',
                                                }}
                                                title={`Ausrichtung: ${val}`}
                                            >
                                                <Ico size={12} />
                                            </button>
                                        );
                                    })}
                                </div>
                                <label className="flex items-center gap-1.5 cursor-pointer">
                                    <Toggle
                                        value={col.wrap ?? false}
                                        onToggle={() => updateCol(idx, { wrap: !(col.wrap ?? false) })}
                                    />
                                    <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                                        Umbruch
                                    </span>
                                </label>
                            </div>
                            {/* Row 3.6: prefix / suffix (text decoration, not for image columns) */}
                            {!col.image && (
                                <div className="flex items-center gap-2">
                                    <div className="flex-1">
                                        <label
                                            className="text-[10px] block mb-1"
                                            style={{ color: 'var(--text-secondary)' }}
                                        >
                                            Präfix
                                        </label>
                                        <input
                                            type="text"
                                            value={col.prefix ?? ''}
                                            onChange={(e) => updateCol(idx, { prefix: e.target.value || undefined })}
                                            placeholder="z.B. €"
                                            className={jCls}
                                            style={jSty}
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <label
                                            className="text-[10px] block mb-1"
                                            style={{ color: 'var(--text-secondary)' }}
                                        >
                                            Suffix
                                        </label>
                                        <input
                                            type="text"
                                            value={col.suffix ?? ''}
                                            onChange={(e) => updateCol(idx, { suffix: e.target.value || undefined })}
                                            placeholder="z.B. °C"
                                            className={jCls}
                                            style={jSty}
                                        />
                                    </div>
                                </div>
                            )}
                            {/* Row 3.7: Datum/Zeit — the switch above decides whether this shows. */}
                            {!col.image && !col.html && timeShown(col) && (
                                <div
                                    className="rounded-lg p-1.5 flex flex-col gap-1.5"
                                    style={{ border: '1px solid var(--app-border)' }}
                                >
                                    <select
                                        value={col.valueTimeFormat ?? 'datetime'}
                                        onChange={(e) =>
                                            updateCol(idx, {
                                                valueTimeFormat: e.target.value,
                                                valueTimePattern:
                                                    e.target.value === 'custom'
                                                        ? (col.valueTimePattern ?? 'dd.MM.yyyy HH:mm')
                                                        : undefined,
                                            })
                                        }
                                        className={fmtCls}
                                        style={jSty}
                                    >
                                        {TIME_DISPLAY_PRESETS.filter((pr) => pr.id !== 'none').map((pr) => (
                                            <option key={pr.id} value={pr.id}>
                                                {pr.label}
                                            </option>
                                        ))}
                                        <option value="custom">Eigenes Format…</option>
                                    </select>
                                    {col.valueTimeFormat === 'custom' && (
                                        <div>
                                            <input
                                                type="text"
                                                value={col.valueTimePattern ?? ''}
                                                onChange={(e) =>
                                                    updateCol(idx, { valueTimePattern: e.target.value || undefined })
                                                }
                                                placeholder="dd.MM.yyyy HH:mm"
                                                className={fmtMonoCls}
                                                style={jSty}
                                            />
                                            <p className="text-[9px] mt-1" style={hintSty}>
                                                Tokens: HH mm ss · dd MM yyyy yy · EEEE (Wochentag) · EE · MMMM (Monat)
                                                · ww (KW)
                                            </p>
                                        </div>
                                    )}
                                    <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                                        Vorschau:{' '}
                                        <span style={{ color: 'var(--text-primary)' }}>
                                            {previewFormat(col, sampleRow?.[col.key])}
                                        </span>
                                    </p>
                                    <p className="text-[9px]" style={hintSty}>
                                        Zeitstempel (Sekunden/Millisekunden), ISO-Zeitangaben und HH:mm werden
                                        automatisch erkannt.
                                    </p>
                                </div>
                            )}
                            {/* Row 3.8: Zahlenformat — conversion, decimal places and thousands separator in one row;
                                the custom factor/offset follow below. */}
                            {!col.image && !col.html && convertShown(col) && (
                                <div
                                    className="rounded-lg p-1.5 flex flex-col gap-1.5"
                                    style={{ border: '1px solid var(--app-border)' }}
                                >
                                    <div className="flex items-end gap-2">
                                        <div className="flex-1 min-w-0">
                                            <label className="text-[9px] block mb-0.5 truncate" style={hintSty}>
                                                Umrechnung
                                            </label>
                                            <select
                                                value={selectedTransformPreset(
                                                    col.valueTransform,
                                                    col.valueFactor,
                                                    col.valueOffset,
                                                )}
                                                onChange={(e) => {
                                                    const { unit: _unit, ...patch } = chooseTransformPreset(
                                                        e.target.value,
                                                        {
                                                            factor: col.valueFactor,
                                                            offset: col.valueOffset,
                                                        },
                                                    );
                                                    updateCol(idx, patch);
                                                }}
                                                className={fmtCls}
                                                style={jSty}
                                            >
                                                {VALUE_TRANSFORM_PRESETS.map((pr) => (
                                                    <option key={pr.id} value={pr.id}>
                                                        {pr.label}
                                                    </option>
                                                ))}
                                                <option value="custom">Eigene…</option>
                                            </select>
                                        </div>
                                        <div className="w-32 shrink-0">
                                            <label className="text-[9px] block mb-0.5" style={hintSty}>
                                                Nachkommastellen
                                            </label>
                                            <input
                                                type="number"
                                                min={0}
                                                max={10}
                                                value={col.decimals ?? ''}
                                                onChange={(e) =>
                                                    updateCol(idx, {
                                                        decimals:
                                                            e.target.value === ''
                                                                ? undefined
                                                                : Math.max(0, Math.min(10, Number(e.target.value))),
                                                    })
                                                }
                                                placeholder="unverändert"
                                                className={fmtCls}
                                                style={jSty}
                                            />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <label className="text-[9px] block mb-0.5 truncate" style={hintSty}>
                                                Tausendertrennzeichen
                                            </label>
                                            <select
                                                value={col.numberFormat ?? 'global'}
                                                onChange={(e) =>
                                                    updateCol(idx, {
                                                        numberFormat:
                                                            e.target.value === 'global'
                                                                ? undefined
                                                                : (e.target.value as NumberFormat),
                                                    })
                                                }
                                                className={fmtCls}
                                                style={jSty}
                                            >
                                                <option value="global">
                                                    Global (
                                                    {globalNumFmt && globalNumFmt !== 'plain'
                                                        ? NUMBER_FORMAT_SAMPLES[globalNumFmt]
                                                        : 'ohne'}
                                                    )
                                                </option>
                                                {NUMBER_FORMATS.map((f) => (
                                                    <option key={f} value={f}>
                                                        {f === 'plain' ? 'ohne' : NUMBER_FORMAT_SAMPLES[f]}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                    {selectedTransformPreset(col.valueTransform, col.valueFactor, col.valueOffset) ===
                                        'custom' && (
                                        <div className="flex items-center gap-2">
                                            <div className="flex-1">
                                                <label className="text-[9px] block mb-0.5" style={hintSty}>
                                                    Faktor
                                                </label>
                                                <input
                                                    type="number"
                                                    step="any"
                                                    value={col.valueFactor ?? 1}
                                                    onChange={(e) =>
                                                        updateCol(idx, {
                                                            valueTransform: 'custom',
                                                            valueFactor:
                                                                e.target.value === ''
                                                                    ? undefined
                                                                    : Number(e.target.value),
                                                        })
                                                    }
                                                    className={fmtCls}
                                                    style={jSty}
                                                />
                                            </div>
                                            <div className="flex-1">
                                                <label className="text-[9px] block mb-0.5" style={hintSty}>
                                                    Offset
                                                </label>
                                                <input
                                                    type="number"
                                                    step="any"
                                                    value={col.valueOffset ?? 0}
                                                    onChange={(e) =>
                                                        updateCol(idx, {
                                                            valueTransform: 'custom',
                                                            valueOffset:
                                                                e.target.value === ''
                                                                    ? undefined
                                                                    : Number(e.target.value),
                                                        })
                                                    }
                                                    className={fmtCls}
                                                    style={jSty}
                                                />
                                            </div>
                                        </div>
                                    )}
                                    <p className="text-[9px]" style={hintSty}>
                                        Nur für die Anzeige. Anzeige = Wert × Faktor + Offset
                                    </p>
                                </div>
                            )}
                            {/* Row 4: image size (only if image enabled) */}
                            {col.image && (
                                <>
                                    <div className="flex items-center gap-2">
                                        <label className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                                            Bildgröße (px)
                                        </label>
                                        <input
                                            type="number"
                                            min={8}
                                            max={512}
                                            value={col.imageSize ?? 32}
                                            onChange={(e) =>
                                                updateCol(idx, { imageSize: Number(e.target.value) || undefined })
                                            }
                                            className={`${jCls} flex-1`}
                                            style={jSty}
                                        />
                                    </div>
                                    <div>
                                        <label
                                            className="text-[10px] block mb-1"
                                            style={{ color: 'var(--text-secondary)' }}
                                        >
                                            Pfad-Präfix (überschreibt globale Admin-URL)
                                        </label>
                                        <input
                                            type="text"
                                            value={col.imagePathPrefix ?? ''}
                                            onChange={(e) =>
                                                updateCol(idx, { imagePathPrefix: e.target.value || undefined })
                                            }
                                            placeholder="z.B. http://192.168.1.10:8081"
                                            className={jCls}
                                            style={jSty}
                                        />
                                        <p
                                            className="text-[9px] mt-0.5"
                                            style={{ color: 'var(--text-secondary)', opacity: 0.7 }}
                                        >
                                            Leer lassen, wenn die Zellwerte schon vollständige Pfade enthalten.
                                        </p>
                                        <ImagePathHint className="mt-1.5" />
                                    </div>
                                </>
                            )}
                            {col.html && (
                                <div className="flex items-center gap-2">
                                    <label className="text-[10px] shrink-0" style={{ color: 'var(--text-secondary)' }}>
                                        HTML-Breite
                                    </label>
                                    <select
                                        value={col.htmlWidth ?? (col.htmlFill ? 'fill' : 'auto')}
                                        onChange={(e) =>
                                            updateCol(idx, {
                                                htmlWidth: e.target.value as JsonColumnDef['htmlWidth'],
                                                htmlFill: undefined,
                                            })
                                        }
                                        className={`${jCls} flex-1`}
                                        style={jSty}
                                        title="Wie das HTML die Spaltenbreite nutzt"
                                    >
                                        <option value="auto">Inhalt (eigene Breite)</option>
                                        <option value="fill">Spalte füllen</option>
                                        <option value="scale">Proportional (längster Wert füllt)</option>
                                    </select>
                                </div>
                            )}
                            {col.html && (
                                <p className="text-[9px]" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                                    Lokale Bilder in <code>{'<img>'}</code> via <code>aura-file:</code>-Präfix, z.B.{' '}
                                    <code>
                                        {'<img src="aura-file:/opt/iobroker/iobroker-data/files/vis.0/Aura/icon.png">'}
                                    </code>
                                </p>
                            )}
                        </div>
                    ))}
                </div>

                {/* Add column manually */}
                <div className="flex gap-1 mt-1.5">
                    <input
                        type="text"
                        value={newKey}
                        onChange={(e) => setNewKey(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addColumn()}
                        placeholder="Spalten-Key (z.B. name)"
                        className={`${jCls} flex-1`}
                        style={jSty}
                    />
                    <button
                        onClick={addColumn}
                        disabled={!newKey.trim()}
                        className="px-2 rounded-lg shrink-0 disabled:opacity-40"
                        style={{ background: 'var(--accent)', color: '#fff' }}
                    >
                        <Plus size={13} />
                    </button>
                </div>
            </div>
        </>
    );
}
