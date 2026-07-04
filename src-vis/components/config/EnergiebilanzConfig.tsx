/**
 * EnergiebilanzConfig — config panel for the "Energiebilanz" widget.
 *
 * Two nested repeaters: an outer list of bars, each with its own inner list of
 * datapoint entries. Reuses the DatapointPicker / IconPickerModal / ColorPicker
 * building blocks and the history-adapter detection of the advanced chart config.
 */
import { useState, useEffect } from 'react';
import { Database, X, Plus, ChevronUp, ChevronDown, Settings2 } from 'lucide-react';
import { Icon } from '@iconify/react';
import type { WidgetConfig } from '../../types';
import type { EnergyBalanceOptions, EnergyBar } from '../widgets/EnergiebilanzWidget';
import type { EnergyAggregate, EnergyEntry } from '../../hooks/useEnergyBalanceValues';
import { ColorPicker } from '../common/ColorPicker';
import { DatapointPicker } from './DatapointPicker';
import { IconPickerModal } from './IconPickerModal';
import { getObjectDirect } from '../../hooks/useIoBroker';
import { detectHistoryAdapters, RANGE_LABELS, type DetectedAdapter } from '../../hooks/useChartHistory';
import type { EChartTimeRange } from '../../hooks/useMultiSeriesData';
import { lucidePascalToIconify } from '../../utils/iconifyLoader';
import { useGlobalSettingsStore } from '../../store/globalSettingsStore';

const CHART_RANGES: EChartTimeRange[] = ['1h', '6h', '24h', '7d', '30d', 'custom'];
const AGGREGATES: { id: EnergyAggregate; label: string }[] = [
    { id: 'last', label: 'Letzter Wert' },
    { id: 'delta', label: 'Differenz (Ende − Start)' },
    { id: 'sum', label: 'Summe' },
    { id: 'average', label: 'Durchschnitt' },
    { id: 'max', label: 'Maximum' },
    { id: 'min', label: 'Minimum' },
];
const DEFAULT_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

function generateId(): string {
    return Math.random().toString(36).slice(2, 9);
}

function toIconifyId(name: string): string {
    return name.includes(':') ? name : lucidePascalToIconify(name);
}

const inputCls = 'w-full text-[11px] rounded px-2 py-1 focus:outline-none';
const inputStyle = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};

interface Props {
    config: WidgetConfig;
    onConfigChange: (config: WidgetConfig) => void;
}

interface AdapterState {
    adapters: DetectedAdapter[];
    checking: boolean;
}

// ── Per-entry row ───────────────────────────────────────────────────────────────

function EntryRow({
    entry,
    adapterState,
    onUpdate,
    onRemove,
    onMove,
    onRefreshAdapters,
    defaultDecimals,
    canMoveUp,
    canMoveDown,
}: {
    entry: EnergyEntry;
    adapterState?: AdapterState;
    onUpdate: (patch: Partial<EnergyEntry>) => void;
    onRemove: () => void;
    onMove: (dir: -1 | 1) => void;
    onRefreshAdapters: () => void;
    defaultDecimals: number;
    canMoveUp: boolean;
    canMoveDown: boolean;
}) {
    const [expanded, setExpanded] = useState(false);
    const [iconOpen, setIconOpen] = useState(false);
    const [dpOpen, setDpOpen] = useState(false);
    const adapters = adapterState?.adapters ?? [];

    return (
        <div className="rounded-lg" style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}>
            {/* header */}
            <div className="flex items-center gap-1.5 px-1.5 py-1">
                <div className="flex flex-col">
                    <button
                        onClick={() => onMove(-1)}
                        disabled={!canMoveUp}
                        className="hover:opacity-70 disabled:opacity-25"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        <ChevronUp size={12} />
                    </button>
                    <button
                        onClick={() => onMove(1)}
                        disabled={!canMoveDown}
                        className="hover:opacity-70 disabled:opacity-25"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        <ChevronDown size={12} />
                    </button>
                </div>
                {entry.icon && (
                    <Icon icon={toIconifyId(entry.icon)} width={15} height={15} style={{ color: entry.color }} />
                )}
                <span className="flex-1 truncate text-[11px]" style={{ color: 'var(--text-primary)' }}>
                    {entry.datapointId || <span style={{ color: 'var(--text-secondary)' }}>Kein Datenpunkt</span>}
                </span>
                <button
                    onClick={() => setExpanded((v) => !v)}
                    className="hover:opacity-70"
                    style={{ color: 'var(--text-secondary)' }}
                    title="Einstellungen"
                >
                    <Settings2 size={13} />
                </button>
                <button
                    onClick={onRemove}
                    className="hover:opacity-70"
                    style={{ color: 'var(--accent-red, #ef4444)' }}
                    title="Entfernen"
                >
                    <X size={13} />
                </button>
            </div>

            {expanded && (
                <div className="px-1.5 pb-1.5 space-y-1.5">
                    {/* Row 1: DP path + icon-only picker */}
                    <div>
                        <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                            Pfad zu Datenpunkt
                        </label>
                        <div className="flex items-center gap-1.5">
                            <input
                                value={entry.datapointId}
                                placeholder="z.B. javascript.0.energie.pv"
                                onChange={(e) => onUpdate({ datapointId: e.target.value })}
                                className={`${inputCls} font-mono min-w-0`}
                                style={inputStyle}
                            />
                            <button
                                onClick={() => setDpOpen(true)}
                                title="Datenpunkt wählen"
                                className="flex items-center justify-center rounded hover:opacity-80 shrink-0"
                                style={{ background: 'var(--accent)', color: '#fff', width: 28, height: 26 }}
                            >
                                <Database size={13} />
                            </button>
                        </div>
                    </div>

                    {/* Row 2: Icon, Bezeichnung, Einheit, Farbe */}
                    <div className="flex items-end gap-1.5">
                        <div>
                            <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                                Icon
                            </label>
                            <button
                                onClick={() => setIconOpen(true)}
                                className="flex items-center justify-center rounded hover:opacity-80"
                                style={{ ...inputStyle, width: 30, height: 26 }}
                                title="Icon wählen"
                            >
                                {entry.icon ? (
                                    <Icon icon={toIconifyId(entry.icon)} width={15} height={15} />
                                ) : (
                                    <span className="text-[9px]" style={{ color: 'var(--text-secondary)' }}>
                                        …
                                    </span>
                                )}
                            </button>
                        </div>
                        <div className="flex-1 min-w-0">
                            <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                                Bezeichnung
                            </label>
                            <input
                                value={entry.label ?? ''}
                                onChange={(e) => onUpdate({ label: e.target.value || undefined })}
                                className={inputCls}
                                style={inputStyle}
                            />
                        </div>
                        <div style={{ width: 64 }}>
                            <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                                Einheit
                            </label>
                            <input
                                value={entry.unit ?? ''}
                                placeholder="kWh"
                                onChange={(e) => onUpdate({ unit: e.target.value || undefined })}
                                className={inputCls}
                                style={inputStyle}
                            />
                        </div>
                        <div>
                            <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                                Farbe
                            </label>
                            <ColorPicker
                                value={entry.color ?? DEFAULT_COLORS[0]}
                                onChange={(v) => onUpdate({ color: v })}
                                className="rounded cursor-pointer"
                                style={{ width: 30, height: 26, border: '1px solid var(--app-border)' }}
                            />
                        </div>
                    </div>

                    {/* Row 3: Dezimalstellen (Global), Aggregation */}
                    <div className="grid grid-cols-2 gap-1.5">
                        <div>
                            <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                                Dezimalstellen (Global)
                            </label>
                            <input
                                type="number"
                                min={0}
                                max={5}
                                value={entry.decimals ?? defaultDecimals}
                                onChange={(e) => onUpdate({ decimals: Number(e.target.value) })}
                                className={inputCls}
                                style={inputStyle}
                            />
                        </div>
                        <div>
                            <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                                Aggregation
                            </label>
                            <select
                                value={entry.aggregate ?? 'last'}
                                onChange={(e) => onUpdate({ aggregate: e.target.value as EnergyAggregate })}
                                className={inputCls}
                                style={inputStyle}
                            >
                                {AGGREGATES.map((a) => (
                                    <option key={a.id} value={a.id}>
                                        {a.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* History adapter */}
                    <div>
                        <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                            History-Adapter
                        </label>
                        {adapters.length > 0 ? (
                            <select
                                value={entry.historyInstance ?? ''}
                                onChange={(e) => onUpdate({ historyInstance: e.target.value || undefined })}
                                className={inputCls}
                                style={inputStyle}
                            >
                                <option value="">Auto ({adapters[0].instance})</option>
                                {adapters.map((a) => (
                                    <option key={a.instance} value={a.instance}>
                                        {a.label}
                                    </option>
                                ))}
                            </select>
                        ) : (
                            <div className="flex items-center gap-1.5">
                                <input
                                    value={entry.historyInstance ?? ''}
                                    placeholder={adapterState?.checking ? 'Suche…' : 'z.B. history.0'}
                                    onChange={(e) => onUpdate({ historyInstance: e.target.value || undefined })}
                                    className={inputCls}
                                    style={inputStyle}
                                />
                                <button
                                    onClick={onRefreshAdapters}
                                    className="text-[9px] px-1.5 py-1 rounded hover:opacity-70 shrink-0"
                                    style={inputStyle}
                                >
                                    Suchen
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {iconOpen && (
                <IconPickerModal
                    current={entry.icon ?? ''}
                    onSelect={(name) => {
                        onUpdate({ icon: name || undefined });
                        setIconOpen(false);
                    }}
                    onClose={() => setIconOpen(false)}
                />
            )}
            {dpOpen && (
                <DatapointPicker
                    currentValue={entry.datapointId}
                    onSelect={(id, unit) => {
                        if (id) onUpdate({ datapointId: id, unit: entry.unit ?? unit ?? undefined });
                        setDpOpen(false);
                    }}
                    onClose={() => setDpOpen(false)}
                />
            )}
        </div>
    );
}

// ── Per-bar section ──────────────────────────────────────────────────────────────

function BarSection({
    bar,
    index,
    total,
    adapterStates,
    onUpdate,
    onRemove,
    onMove,
    onRefreshAdapters,
    defaultDecimals,
}: {
    bar: EnergyBar;
    index: number;
    total: number;
    adapterStates: Record<string, AdapterState>;
    onUpdate: (patch: Partial<EnergyBar>) => void;
    onRemove: () => void;
    onMove: (dir: -1 | 1) => void;
    onRefreshAdapters: (entryId: string, datapointId: string) => void;
    defaultDecimals: number;
}) {
    const entries = bar.entries ?? [];

    const setEntries = (next: EnergyEntry[]) => onUpdate({ entries: next });
    const addEntry = () => setEntries([...entries, { id: generateId(), datapointId: '', aggregate: 'last' }]);
    const updateEntry = (id: string, patch: Partial<EnergyEntry>) =>
        setEntries(entries.map((e) => (e.id === id ? { ...e, ...patch } : e)));
    const removeEntry = (id: string) => setEntries(entries.filter((e) => e.id !== id));
    const moveEntry = (idx: number, dir: -1 | 1) => {
        const swap = idx + dir;
        if (swap < 0 || swap >= entries.length) return;
        const next = [...entries];
        [next[idx], next[swap]] = [next[swap], next[idx]];
        setEntries(next);
    };

    return (
        <div
            className="rounded-lg p-2 space-y-1.5"
            style={{
                background: 'color-mix(in srgb, var(--app-bg) 60%, transparent)',
                border: '1px solid var(--app-border)',
            }}
        >
            <div className="flex items-center gap-1.5">
                <div className="flex flex-col">
                    <button
                        onClick={() => onMove(-1)}
                        disabled={index === 0}
                        className="hover:opacity-70 disabled:opacity-25"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        <ChevronUp size={13} />
                    </button>
                    <button
                        onClick={() => onMove(1)}
                        disabled={index === total - 1}
                        className="hover:opacity-70 disabled:opacity-25"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        <ChevronDown size={13} />
                    </button>
                </div>
                <input
                    value={bar.title ?? ''}
                    placeholder={`Balken ${index + 1}`}
                    onChange={(e) => onUpdate({ title: e.target.value || undefined })}
                    className="flex-1 text-[11px] font-semibold rounded px-2 py-1 focus:outline-none"
                    style={inputStyle}
                />
                <select
                    value={bar.legendSide ?? 'below'}
                    onChange={(e) => onUpdate({ legendSide: e.target.value as EnergyBar['legendSide'] })}
                    className="text-[10px] rounded px-1.5 py-1 focus:outline-none"
                    style={inputStyle}
                    title="Legende"
                >
                    <option value="left">Legende links</option>
                    <option value="right">Legende rechts</option>
                    <option value="below">Legende unten</option>
                </select>
                <button
                    onClick={onRemove}
                    className="hover:opacity-70 shrink-0"
                    style={{ color: 'var(--accent-red, #ef4444)' }}
                    title="Balken entfernen"
                >
                    <X size={14} />
                </button>
            </div>

            <div className="space-y-1">
                {entries.map((e, idx) => (
                    <EntryRow
                        key={e.id}
                        entry={e}
                        adapterState={adapterStates[e.id]}
                        onUpdate={(patch) => updateEntry(e.id, patch)}
                        onRemove={() => removeEntry(e.id)}
                        onMove={(dir) => moveEntry(idx, dir)}
                        onRefreshAdapters={() => onRefreshAdapters(e.id, e.datapointId)}
                        defaultDecimals={defaultDecimals}
                        canMoveUp={idx > 0}
                        canMoveDown={idx < entries.length - 1}
                    />
                ))}
            </div>

            <button
                onClick={addEntry}
                className="w-full flex items-center justify-center gap-1.5 text-[10px] py-1 rounded hover:opacity-80"
                style={inputStyle}
            >
                <Plus size={11} /> Datenpunkt hinzufügen
            </button>
        </div>
    );
}

// ── Main config panel ─────────────────────────────────────────────────────────

export function EnergiebilanzConfig({ config, onConfigChange }: Props) {
    const o = (config.options ?? {}) as unknown as EnergyBalanceOptions;
    const bars = o.bars ?? [];
    const { defaultDecimals } = useGlobalSettingsStore();
    const [adapterStates, setAdapterStates] = useState<Record<string, AdapterState>>({});

    const setO = (patch: Partial<EnergyBalanceOptions>) => onConfigChange({ ...config, options: { ...o, ...patch } });

    const setBars = (next: EnergyBar[]) => setO({ bars: next });
    const updateBar = (id: string, patch: Partial<EnergyBar>) =>
        setBars(bars.map((b) => (b.id === id ? { ...b, ...patch } : b)));
    const removeBar = (id: string) => setBars(bars.filter((b) => b.id !== id));
    const addBar = () => {
        const n = bars.length;
        setBars([
            ...bars,
            {
                id: generateId(),
                title: n === 0 ? 'Produktion' : n === 1 ? 'Verbrauch' : `Balken ${n + 1}`,
                legendSide: n === 1 ? 'right' : 'left',
                entries: [],
            },
        ]);
    };
    const moveBar = (idx: number, dir: -1 | 1) => {
        const swap = idx + dir;
        if (swap < 0 || swap >= bars.length) return;
        const next = [...bars];
        [next[idx], next[swap]] = [next[swap], next[idx]];
        setBars(next);
    };

    // ── History-adapter detection across all entries of all bars ──
    const allEntries = bars.flatMap((b) => b.entries ?? []);
    const detectKey = allEntries.map((e) => `${e.id}:${e.datapointId}`).join(',');

    // patch an entry regardless of which bar it lives in
    const updateBarEntry = (entryId: string, patch: Partial<EnergyEntry>) => {
        setBars(
            bars.map((b) => ({
                ...b,
                entries: (b.entries ?? []).map((e) => (e.id === entryId ? { ...e, ...patch } : e)),
            })),
        );
    };

    const detect = (entryId: string, datapointId: string, force = false) => {
        if (!datapointId || datapointId.includes('{{')) return;
        setAdapterStates((prev) => {
            if (!force && prev[entryId]) return prev;
            return { ...prev, [entryId]: { adapters: [], checking: true } };
        });
        getObjectDirect(datapointId)
            .then((obj) => {
                const custom = obj?.common?.custom;
                const adapters = custom ? detectHistoryAdapters(custom as Record<string, { enabled?: boolean }>) : [];
                setAdapterStates((prev) => ({ ...prev, [entryId]: { adapters, checking: false } }));
                // Auto-select the sole detected adapter when none is chosen yet.
                const entry = allEntries.find((e) => e.id === entryId);
                if (adapters.length === 1 && entry && !entry.historyInstance) {
                    updateBarEntry(entryId, { historyInstance: adapters[0].instance });
                }
            })
            .catch(() => setAdapterStates((prev) => ({ ...prev, [entryId]: { adapters: [], checking: false } })));
    };

    useEffect(() => {
        for (const e of allEntries) {
            if (!e.datapointId || e.datapointId.includes('{{')) continue;
            if (adapterStates[e.id]) continue;
            detect(e.id, e.datapointId);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [detectKey]);

    const range = o.range ?? '24h';

    return (
        <div className="aura-scroll flex flex-col gap-2 overflow-y-auto" style={{ maxHeight: '80vh' }}>
            {/* ── Bars ── */}
            {bars.map((b, idx) => (
                <BarSection
                    key={b.id}
                    bar={b}
                    index={idx}
                    total={bars.length}
                    adapterStates={adapterStates}
                    onUpdate={(patch) => updateBar(b.id, patch)}
                    onRemove={() => removeBar(b.id)}
                    onMove={(dir) => moveBar(idx, dir)}
                    onRefreshAdapters={(entryId, dp) => detect(entryId, dp, true)}
                    defaultDecimals={defaultDecimals}
                />
            ))}
            <button
                onClick={addBar}
                className="w-full flex items-center justify-center gap-1.5 text-xs py-2 rounded-lg hover:opacity-80"
                style={{ background: 'var(--accent)', color: '#fff' }}
            >
                <Plus size={13} /> Balken hinzufügen
            </button>

            <div style={{ height: 1, background: 'var(--app-border)' }} />

            {/* ── Global settings ── */}
            <div className="grid grid-cols-2 gap-2">
                <div>
                    <label className="text-[11px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                        Einheit
                    </label>
                    <input
                        value={o.unit ?? ''}
                        placeholder="kWh"
                        onChange={(e) => setO({ unit: e.target.value || undefined })}
                        className={inputCls}
                        style={inputStyle}
                    />
                </div>
                <div>
                    <label className="text-[11px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                        Nachkommastellen
                    </label>
                    <input
                        type="number"
                        min={0}
                        max={5}
                        value={o.decimals ?? defaultDecimals}
                        onChange={(e) => setO({ decimals: Number(e.target.value) })}
                        className={inputCls}
                        style={inputStyle}
                    />
                </div>
            </div>

            {/* range */}
            <div>
                <label className="text-[11px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                    Zeitraum
                </label>
                <select
                    value={range}
                    onChange={(e) => setO({ range: e.target.value as EChartTimeRange })}
                    className={inputCls}
                    style={inputStyle}
                >
                    {CHART_RANGES.map((r) => (
                        <option key={r} value={r}>
                            {RANGE_LABELS[r]}
                        </option>
                    ))}
                </select>
                {range === 'custom' && (
                    <div className="flex items-center gap-1.5 mt-1.5">
                        <input
                            type="number"
                            min={1}
                            value={o.rangeCustomValue ?? 24}
                            onChange={(e) => setO({ rangeCustomValue: Number(e.target.value) })}
                            className={inputCls}
                            style={inputStyle}
                        />
                        <select
                            value={o.rangeCustomUnit ?? 'h'}
                            onChange={(e) => setO({ rangeCustomUnit: e.target.value as 'h' | 'd' })}
                            className="text-[11px] rounded px-2 py-1 focus:outline-none"
                            style={inputStyle}
                        >
                            <option value="h">Stunden</option>
                            <option value="d">Tage</option>
                        </select>
                    </div>
                )}
            </div>

            {/* toggles */}
            {(
                [
                    ['showBarTitles', 'Balken-Titel anzeigen'],
                    ['showTotals', 'Summen anzeigen'],
                    ['showPercent', 'Prozent-Labels anzeigen'],
                    ['showLegend', 'Legende anzeigen'],
                ] as [keyof EnergyBalanceOptions, string][]
            ).map(([key, label]) => {
                const val = (o[key] as boolean | undefined) !== false;
                return (
                    <div key={key} className="flex items-center justify-between">
                        <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                            {label}
                        </label>
                        <button
                            onClick={() => setO({ [key]: !val } as Partial<EnergyBalanceOptions>)}
                            className="relative w-9 h-5 rounded-full transition-colors"
                            style={{ background: val ? 'var(--accent)' : 'var(--app-border)' }}
                        >
                            <span
                                className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all"
                                style={{ left: val ? '18px' : '2px' }}
                            />
                        </button>
                    </div>
                );
            })}
        </div>
    );
}
