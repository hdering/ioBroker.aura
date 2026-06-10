import { useState, useEffect } from 'react';
import {
    RefreshCw,
    Search,
    Check,
    X,
    ChevronDown,
    Settings2,
    ChevronRight,
    ChevronUp,
    Ban,
    Plus,
    PlusCircle,
} from 'lucide-react';
import { MultiSelect } from './MultiSelect';
import { DatapointPicker } from './DatapointPicker';
import { GroupActionConfig } from './GroupActionConfig';
import { EntryControlsConfig } from './EntryControlsConfig';
import type { WidgetConfig } from '../../types';
import { discoverDatapoints, loadFilterOptions } from '../widgets/AutoListWidget';
import type { AutoListOptions, AutoListEntry, DiscoveredDp } from '../widgets/AutoListWidget';
import { useT } from '../../i18n';
import { ensureDatapointCache } from '../../hooks/useDatapointList';
import { useGlobalSettingsStore } from '../../store/globalSettingsStore';
import { NS } from '../../utils/namespace';

const PRESETS_ID: { label: string; value: string }[] = [
    { label: 'endet auf .POWER', value: '/\\.POWER$/i' },
    { label: 'endet auf .STATE', value: '/\\.STATE$/i' },
    { label: 'endet auf .SET', value: '/\\.SET$/i' },
    { label: 'enthält .ENERGY', value: '/\\.ENERGY/i' },
    { label: 'endet auf .ACTUAL', value: '/\\.ACTUAL$/i' },
];

const PRESETS_EXCLUDE: { label: string; value: string }[] = [
    { label: '.info.', value: '.info.' },
    { label: '.connection', value: '.connection' },
    { label: 'powerSave', value: '/powerSaveMode/i' },
    { label: 'powerFactor', value: '/powerFactor/i' },
    { label: '_REMOTE_', value: '_REMOTE_' },
    { label: 'Indikatoren', value: '/\\.indicator\\./i' },
];

function appendPattern(current: string, value: string): string {
    const trimmed = current.trim();
    return trimmed ? `${trimmed}, ${value}` : value;
}

function ColorField({
    label,
    value,
    fallback,
    onChange,
}: {
    label: string;
    value: string | undefined;
    fallback: string;
    onChange: (v: string | undefined) => void;
}) {
    return (
        <div>
            <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                {label}
            </label>
            <div className="flex items-center gap-1">
                <input
                    type="color"
                    value={value?.match(/#[0-9a-fA-F]{6}/)?.[0] ?? fallback}
                    onChange={(e) => onChange(e.target.value)}
                    className="w-7 h-6 rounded cursor-pointer shrink-0"
                    style={{ border: '1px solid var(--app-border)', padding: '1px' }}
                />
                {value ? (
                    <button
                        onClick={() => onChange(undefined)}
                        title="Zurücksetzen"
                        className="text-[9px] px-1.5 py-0.5 rounded hover:opacity-70"
                        style={{
                            background: 'var(--app-bg)',
                            color: 'var(--text-secondary)',
                            border: '1px solid var(--app-border)',
                        }}
                    >
                        Reset
                    </button>
                ) : (
                    <span className="text-[9px] opacity-60" style={{ color: 'var(--text-secondary)' }}>
                        —
                    </span>
                )}
            </div>
        </div>
    );
}

function PresetChips({ presets, onAdd }: { presets: { label: string; value: string }[]; onAdd: (v: string) => void }) {
    return (
        <div className="flex flex-wrap gap-1 mt-1">
            {presets.map((p) => (
                <button
                    key={p.value}
                    type="button"
                    onClick={() => onAdd(p.value)}
                    title={p.value}
                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] hover:opacity-80 transition-opacity"
                    style={{ background: 'var(--app-border)', color: 'var(--text-secondary)' }}
                >
                    <PlusCircle size={8} />
                    {p.label}
                </button>
            ))}
        </div>
    );
}

// ── Per-entry config row ───────────────────────────────────────────────────────

function EntryConfigRow({
    entry,
    resolvedName,
    onUpdate,
    onRemove,
}: {
    entry: AutoListEntry;
    resolvedName?: string;
    onUpdate: (patch: Partial<AutoListEntry>) => void;
    onRemove: () => void;
}) {
    const t = useT();
    const [expanded, setExpanded] = useState(false);
    const iSty = {
        background: 'var(--app-bg)',
        color: 'var(--text-primary)',
        border: '1px solid var(--app-border)',
    } as React.CSSProperties;
    const iCls = 'w-full text-[10px] rounded px-2 py-1 focus:outline-none font-mono';

    return (
        <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--app-border)' }}>
            {/* Header row */}
            <div className="flex items-center gap-1.5 px-2 py-1.5" style={{ background: 'var(--app-bg)' }}>
                <button
                    onClick={() => setExpanded((e) => !e)}
                    className="shrink-0 hover:opacity-70 transition-transform"
                    style={{ color: 'var(--text-secondary)', transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
                >
                    <ChevronRight size={11} />
                </button>
                <span className="flex-1 text-[10px] truncate" style={{ color: 'var(--text-primary)' }}>
                    {entry.label || resolvedName || entry.id.split('.').pop() || entry.id}
                </span>
                <button
                    onClick={() => setExpanded((e) => !e)}
                    className="shrink-0 hover:opacity-70 p-0.5"
                    style={{ color: 'var(--text-secondary)' }}
                    title={t('autolist.settings')}
                >
                    <Settings2 size={10} />
                </button>
                <button
                    onClick={onRemove}
                    className="shrink-0 hover:opacity-70"
                    style={{ color: 'var(--text-secondary)' }}
                >
                    <X size={11} />
                </button>
            </div>

            {/* Expanded config */}
            {expanded && (
                <div
                    className="px-2.5 pb-2.5 pt-1 space-y-1.5"
                    style={{ borderTop: '1px solid var(--app-border)', background: 'var(--app-surface)' }}
                >
                    <div className="text-[9px] font-mono truncate mb-1" style={{ color: 'var(--text-secondary)' }}>
                        {entry.id}
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                        <div>
                            <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                                {t('endpoints.dp.label')}
                            </label>
                            <input
                                className={iCls}
                                style={iSty}
                                placeholder={t('autolist.auto')}
                                value={entry.label ?? ''}
                                onChange={(e) => onUpdate({ label: e.target.value || undefined })}
                            />
                        </div>
                        <div>
                            <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                                {t('endpoints.dp.unit')}
                            </label>
                            <input
                                className={iCls}
                                style={iSty}
                                placeholder={t('endpoints.dp.unitPh')}
                                value={entry.unit ?? ''}
                                onChange={(e) => onUpdate({ unit: e.target.value || undefined })}
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                        <div>
                            <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                                {t('autolist.trueText')}
                            </label>
                            <input
                                className={iCls}
                                style={iSty}
                                placeholder="AN"
                                value={entry.trueLabel ?? ''}
                                onChange={(e) => onUpdate({ trueLabel: e.target.value || undefined })}
                            />
                        </div>
                        <div>
                            <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                                {t('autolist.falseText')}
                            </label>
                            <input
                                className={iCls}
                                style={iSty}
                                placeholder="AUS"
                                value={entry.falseLabel ?? ''}
                                onChange={(e) => onUpdate({ falseLabel: e.target.value || undefined })}
                            />
                        </div>
                    </div>
                    <EntryControlsConfig entry={entry} onUpdate={onUpdate} />
                    <div className="grid grid-cols-2 gap-1.5">
                        <ColorField
                            label="Textfarbe AN"
                            value={entry.activeColor}
                            fallback="#22c55e"
                            onChange={(v) => onUpdate({ activeColor: v })}
                        />
                        <ColorField
                            label="Textfarbe AUS"
                            value={entry.inactiveColor}
                            fallback="#94a3b8"
                            onChange={(v) => onUpdate({ inactiveColor: v })}
                        />
                        <ColorField
                            label="Hintergrund AN"
                            value={entry.activeBg}
                            fallback="#22c55e"
                            onChange={(v) => onUpdate({ activeBg: v })}
                        />
                        <ColorField
                            label="Hintergrund AUS"
                            value={entry.inactiveBg}
                            fallback="#1f2937"
                            onChange={(v) => onUpdate({ inactiveBg: v })}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Main config panel ──────────────────────────────────────────────────────────

interface Props {
    config: WidgetConfig;
    onConfigChange: (config: WidgetConfig) => void;
}

function toArr(csv?: string): string[] {
    return csv
        ? csv
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
        : [];
}
function toCsv(arr: string[]): string | undefined {
    return arr.length ? arr.join(', ') : undefined;
}

export function AutoListConfig({ config, onConfigChange }: Props) {
    const t = useT();
    const opts = (config.options ?? { entries: [] }) as unknown as AutoListOptions;
    const { defaultDecimals } = useGlobalSettingsStore();

    // Filter options loaded from ioBroker
    const [availRoles, setAvailRoles] = useState<string[]>([]);
    const [availRooms, setAvailRooms] = useState<string[]>([]);
    const [availFuncs, setAvailFuncs] = useState<string[]>([]);
    const [availTypes, setAvailTypes] = useState<string[]>([]);
    const [availAdapters, setAvailAdapters] = useState<string[]>([]);
    const [optLoading, setOptLoading] = useState(true);
    const [resolvedNames, setResolvedNames] = useState<Record<string, string>>({});

    useEffect(() => {
        loadFilterOptions().then(({ roles, rooms, funcs, types, adapters }) => {
            setAvailRoles(roles);
            setAvailRooms(rooms);
            setAvailFuncs(funcs);
            setAvailTypes(types);
            setAvailAdapters(adapters);
            setOptLoading(false);
        });
        ensureDatapointCache().then((cache) => {
            const map: Record<string, string> = {};
            for (const e of cache) map[e.id] = e.name;
            setResolvedNames(map);
        });
    }, []);

    // Filter state
    const [selRoles, setSelRoles] = useState<string[]>(toArr(opts.filterRoles));
    const [selRooms, setSelRooms] = useState<string[]>(toArr(opts.filterRooms));
    const [selFuncs, setSelFuncs] = useState<string[]>(toArr(opts.filterFuncs));
    const [selTypes, setSelTypes] = useState<string[]>(toArr(opts.filterTypes));
    const [selAdapters, setSelAdapters] = useState<string[]>(toArr(opts.filterAdapters));
    const [idPat, setIdPat] = useState(opts.filterIdPattern ?? '');

    // Exclude state
    const [excludePats, setExcludePats] = useState(opts.excludeIdPatterns ?? '');
    const [excludeIds, setExcludeIds] = useState<string[]>(opts.excludeIds ?? []);
    const [showExcludePicker, setShowExcludePicker] = useState(false);

    // Search results – reset whenever any filter changes
    const [results, setResults] = useState<DiscoveredDp[]>([]);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(false);
    const [searched, setSearched] = useState(false);
    const [showOthers, setShowOthers] = useState(false);

    // Reset search results when any filter value changes
    const resetSearch = () => {
        setResults([]);
        setSelected(new Set());
        setSearched(false);
        setShowOthers(false);
    };

    const setOpts = (patch: Partial<AutoListOptions>) => {
        onConfigChange({ ...config, options: { ...opts, ...patch } });
    };

    const search = async () => {
        setLoading(true);
        try {
            const found = await discoverDatapoints({
                filterAdapters: toCsv(selAdapters),
                filterRoles: toCsv(selRoles),
                filterIdPattern: idPat || undefined,
                filterRooms: toCsv(selRooms),
                filterFuncs: toCsv(selFuncs),
                filterTypes: toCsv(selTypes),
                excludeIdPatterns: excludePats || undefined,
                excludeIds: excludeIds.length ? excludeIds : undefined,
            });
            setResults(found);
            setSearched(true);
            const relevantFound = found.filter((d) => d.isRelevant);
            if (relevantFound.length > 0) {
                setSelected(new Set(relevantFound.map((d) => d.id)));
                setShowOthers(false);
            } else {
                // No relevant DPs → select all and show them so the user sees what was found
                setSelected(new Set(found.map((d) => d.id)));
                setShowOthers(true);
            }
        } finally {
            setLoading(false);
        }
    };

    // Apply merges new entries with existing ones to preserve custom labels/units
    const apply = () => {
        const discovered = new Map(results.map((d) => [d.id, d]));
        const existingMap = new Map((opts.entries ?? []).map((e) => [e.id, e]));
        const entries: AutoListEntry[] = [...selected].map((id) => {
            const existing = existingMap.get(id);
            if (existing) return existing; // preserve user-edited label/unit/trueLabel/falseLabel
            const dp = discovered.get(id);
            return { id, label: undefined, rooms: dp?.rooms, unit: dp?.unit, role: dp?.role, writable: dp?.write };
        });
        setOpts({
            entries,
            filterAdapters: toCsv(selAdapters),
            filterRoles: toCsv(selRoles),
            filterIdPattern: idPat || undefined,
            filterRooms: toCsv(selRooms),
            filterFuncs: toCsv(selFuncs),
            filterTypes: toCsv(selTypes),
            excludeIdPatterns: excludePats || undefined,
            excludeIds: excludeIds.length ? excludeIds : undefined,
        });
    };

    const toggle = (id: string) =>
        setSelected((prev) => {
            const s = new Set(prev);
            s.has(id) ? s.delete(id) : s.add(id);
            return s;
        });

    const removeEntry = (id: string) => setOpts({ entries: (opts.entries ?? []).filter((e) => e.id !== id) });

    const updateEntry = (id: string, patch: Partial<AutoListEntry>) =>
        setOpts({ entries: (opts.entries ?? []).map((e) => (e.id === id ? { ...e, ...patch } : e)) });

    const iSty = {
        background: 'var(--app-bg)',
        color: 'var(--text-primary)',
        border: '1px solid var(--app-border)',
    } as React.CSSProperties;
    const iCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none';
    const canSearch =
        selRoles.length > 0 ||
        selRooms.length > 0 ||
        selFuncs.length > 0 ||
        selTypes.length > 0 ||
        selAdapters.length > 0 ||
        !!idPat;

    return (
        <>
            {/* ── Filters ── */}
            <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                    <MultiSelect
                        label="Adapter"
                        options={availAdapters}
                        selected={selAdapters}
                        onChange={(v) => {
                            setSelAdapters(v);
                            resetSearch();
                        }}
                        loading={optLoading}
                    />
                </div>
                <MultiSelect
                    label={t('autolist.roles')}
                    options={availRoles}
                    selected={selRoles}
                    onChange={(v) => {
                        setSelRoles(v);
                        resetSearch();
                    }}
                    loading={optLoading}
                />
                <MultiSelect
                    label={t('autolist.room')}
                    options={availRooms}
                    selected={selRooms}
                    onChange={(v) => {
                        setSelRooms(v);
                        resetSearch();
                    }}
                    loading={optLoading}
                />
                <MultiSelect
                    label={t('autolist.func')}
                    options={availFuncs}
                    selected={selFuncs}
                    onChange={(v) => {
                        setSelFuncs(v);
                        resetSearch();
                    }}
                    loading={optLoading}
                />
                <div>
                    <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                        {t('autolist.idContains')} <span className="opacity-60">(kommagetrennt, OR)</span>
                    </label>
                    <input
                        className={iCls}
                        style={iSty}
                        placeholder="shelly, /\.POWER$/i"
                        value={idPat}
                        onChange={(e) => {
                            setIdPat(e.target.value);
                            resetSearch();
                        }}
                        onKeyDown={(e) => e.key === 'Enter' && canSearch && search()}
                    />
                    <p className="text-[9px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                        Text = Teilstring · <span className="font-mono">/regex/flags</span> möglich
                    </p>
                    <PresetChips
                        presets={PRESETS_ID}
                        onAdd={(v) => {
                            setIdPat((p) => appendPattern(p, v));
                            resetSearch();
                        }}
                    />
                </div>
                <div className="col-span-2">
                    <MultiSelect
                        label="Typen"
                        options={availTypes}
                        selected={selTypes}
                        onChange={(v) => {
                            setSelTypes(v);
                            resetSearch();
                        }}
                        loading={optLoading}
                    />
                </div>
            </div>

            {/* ── Exclude section ── */}
            <div className="space-y-2 pt-0.5">
                <div className="flex items-center gap-1.5">
                    <Ban size={10} style={{ color: 'var(--text-secondary)' }} />
                    <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        Ausschlüsse
                    </span>
                </div>
                <div>
                    <label className="text-[10px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                        ID-Muster ausschließen <span className="opacity-60">(kommagetrennt)</span>
                    </label>
                    <input
                        className={iCls}
                        style={iSty}
                        placeholder=".info., .connection, /powerSaveMode/i"
                        value={excludePats}
                        onChange={(e) => {
                            setExcludePats(e.target.value);
                            resetSearch();
                        }}
                    />
                    <p className="text-[9px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                        Text = Teilstring · <span className="font-mono">/regex/flags</span> möglich
                    </p>
                    <PresetChips
                        presets={PRESETS_EXCLUDE}
                        onAdd={(v) => {
                            setExcludePats((p) => appendPattern(p, v));
                            resetSearch();
                        }}
                    />
                </div>
                <div>
                    <div className="flex items-center justify-between mb-1">
                        <label className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                            DPs gezielt ausschließen{' '}
                            {excludeIds.length > 0 && <span className="opacity-60">({excludeIds.length})</span>}
                        </label>
                        <button
                            type="button"
                            onClick={() => setShowExcludePicker(true)}
                            className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded hover:opacity-80"
                            style={{ background: 'var(--app-border)', color: 'var(--text-secondary)' }}
                        >
                            <Plus size={9} /> Auswählen
                        </button>
                    </div>
                    {excludeIds.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                            {excludeIds.map((id) => (
                                <span
                                    key={id}
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono"
                                    style={{
                                        background: 'color-mix(in srgb, #ef4444 12%, transparent)',
                                        color: '#ef4444',
                                        border: '1px solid color-mix(in srgb, #ef4444 30%, transparent)',
                                    }}
                                >
                                    <span className="max-w-[120px] truncate">{id.split('.').slice(-2).join('.')}</span>
                                    <button
                                        onClick={() => {
                                            setExcludeIds((prev) => prev.filter((x) => x !== id));
                                            resetSearch();
                                        }}
                                        className="hover:opacity-70 shrink-0"
                                    >
                                        <X size={8} />
                                    </button>
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <button
                onClick={search}
                disabled={loading || !canSearch}
                className="w-full flex items-center justify-center gap-1.5 text-xs py-2 rounded-lg hover:opacity-80 disabled:opacity-40"
                style={{ background: 'var(--accent)', color: '#fff' }}
            >
                {loading ? <RefreshCw size={11} className="animate-spin" /> : <Search size={11} />}
                {t('autolist.search')}
            </button>

            {/* ── Search results ── */}
            {searched && results.length === 0 && (
                <p className="text-[11px] text-center py-2" style={{ color: 'var(--text-secondary)' }}>
                    {t('autolist.noneFound')}
                </p>
            )}
            {searched &&
                results.length > 0 &&
                (() => {
                    const relevant = results.filter((d) => d.isRelevant);
                    const others = results.filter((d) => !d.isRelevant);
                    const DpRow = ({ dp, dimmed }: { dp: DiscoveredDp; dimmed?: boolean }) => (
                        <label
                            key={dp.id}
                            className="flex items-center gap-2 px-2.5 py-2 rounded cursor-pointer hover:opacity-90"
                            style={{
                                background: selected.has(dp.id)
                                    ? 'color-mix(in srgb, var(--accent) 10%, transparent)'
                                    : 'transparent',
                                opacity: dimmed ? 0.55 : 1,
                            }}
                        >
                            <div
                                className="w-3.5 h-3.5 rounded shrink-0 flex items-center justify-center"
                                style={{ background: selected.has(dp.id) ? 'var(--accent)' : 'var(--app-border)' }}
                            >
                                {selected.has(dp.id) && <Check size={9} color="#fff" />}
                            </div>
                            <input
                                type="checkbox"
                                className="sr-only"
                                checked={selected.has(dp.id)}
                                onChange={() => toggle(dp.id)}
                            />
                            <div className="min-w-0 flex-1">
                                <div className="text-xs truncate" style={{ color: 'var(--text-primary)' }}>
                                    {dp.name}
                                    {dp.unit && (
                                        <span className="ml-1 text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                                            [{dp.unit}]
                                        </span>
                                    )}
                                </div>
                                <div
                                    className="text-[10px] truncate font-mono"
                                    style={{ color: 'var(--text-secondary)' }}
                                >
                                    {dp.id}
                                    {dp.rooms.length > 0 ? ` · ${dp.rooms[0]}` : ''}
                                </div>
                            </div>
                        </label>
                    );
                    return (
                        <>
                            <div className="flex items-center justify-between">
                                <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                                    {t('autolist.found', { count: results.length, selected: selected.size })}
                                </span>
                                <div className="flex gap-2">
                                    <button
                                        className="text-[10px] hover:opacity-70"
                                        style={{ color: 'var(--accent)' }}
                                        onClick={() => {
                                            setSelected(new Set(results.map((d) => d.id)));
                                            setShowOthers(true);
                                        }}
                                    >
                                        {t('common.all')}
                                    </button>
                                    <button
                                        className="text-[10px] hover:opacity-70"
                                        style={{ color: 'var(--text-secondary)' }}
                                        onClick={() => setSelected(new Set())}
                                    >
                                        {t('common.none')}
                                    </button>
                                </div>
                            </div>
                            <div className="aura-scroll space-y-0.5 max-h-56 overflow-y-auto -mx-1 px-1">
                                {relevant.map((dp) => (
                                    <DpRow key={dp.id} dp={dp} />
                                ))}
                                {others.length > 0 && (
                                    <>
                                        <button
                                            onClick={() => setShowOthers((v) => !v)}
                                            className="w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[10px] hover:opacity-80 transition-opacity mt-1"
                                            style={{ background: 'var(--app-border)', color: 'var(--text-secondary)' }}
                                        >
                                            {showOthers ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                                            <span>Weitere Datenpunkte ({others.length})</span>
                                        </button>
                                        {showOthers && others.map((dp) => <DpRow key={dp.id} dp={dp} dimmed />)}
                                    </>
                                )}
                            </div>
                            <button
                                onClick={apply}
                                disabled={selected.size === 0}
                                className="w-full flex items-center justify-center gap-1.5 text-xs py-2 rounded-lg hover:opacity-80 disabled:opacity-40"
                                style={{ background: 'var(--accent-green)', color: '#fff' }}
                            >
                                <Check size={11} /> {t('autolist.apply', { count: selected.size })}
                            </button>
                        </>
                    );
                })()}

            {/* ── Divider ── */}
            <div style={{ height: 1, background: 'var(--app-border)' }} />

            {/* ── Current entries ── */}
            <div>
                <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        {t('autolist.datapoints')} {(opts.entries ?? []).length > 0 && `(${opts.entries.length})`}
                    </label>
                    {(opts.entries ?? []).length > 0 && (
                        <button
                            onClick={() => setOpts({ entries: [] })}
                            className="text-[10px] hover:opacity-70"
                            style={{ color: 'var(--accent-red, #ef4444)' }}
                        >
                            Alle löschen
                        </button>
                    )}
                </div>
                {(opts.entries ?? []).length > 0 && (
                    <div className="aura-scroll space-y-1 max-h-72 overflow-y-auto mb-1.5">
                        {opts.entries.map((e) => (
                            <EntryConfigRow
                                key={e.id}
                                entry={e}
                                resolvedName={resolvedNames[e.id]}
                                onUpdate={(patch) => updateEntry(e.id, patch)}
                                onRemove={() => removeEntry(e.id)}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* ── Settings ── */}
            <div style={{ height: 1, background: 'var(--app-border)' }} />
            <div>
                <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                    {t('autolist.syncMin')}
                </label>
                <input
                    type="number"
                    min={1}
                    className={iCls}
                    style={iSty}
                    value={opts.syncIntervalMin ?? 5}
                    onChange={(e) => setOpts({ syncIntervalMin: Number(e.target.value) })}
                />
            </div>
            <div>
                <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                    Kommastellen
                </label>
                <div className="flex items-center gap-2">
                    <input
                        type="number"
                        min={0}
                        max={6}
                        step={1}
                        className={iCls}
                        style={{ ...iSty, opacity: opts.decimals === undefined ? 0.4 : 1 }}
                        disabled={opts.decimals === undefined}
                        value={opts.decimals ?? defaultDecimals}
                        onChange={(e) => setOpts({ decimals: Number(e.target.value) })}
                    />
                    <button
                        onClick={() => setOpts({ decimals: opts.decimals === undefined ? defaultDecimals : undefined })}
                        className="shrink-0 px-2 py-1 rounded text-[10px] font-bold transition-colors"
                        style={{
                            background: opts.decimals === undefined ? 'var(--accent)' : 'var(--app-border)',
                            color: opts.decimals === undefined ? '#fff' : 'var(--text-secondary)',
                        }}
                        title="Globale Einstellung verwenden"
                    >
                        Global
                    </button>
                </div>
            </div>
            <GroupActionConfig opts={opts} setOpts={setOpts} />

            <div className="flex items-center justify-between">
                <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    Anzahl anzeigen
                </label>
                <button
                    onClick={() => setOpts({ showCount: !(opts.showCount ?? true) })}
                    className="relative w-9 h-5 rounded-full transition-colors"
                    style={{ background: (opts.showCount ?? true) ? 'var(--accent)' : 'var(--app-border)' }}
                >
                    <span
                        className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all"
                        style={{ left: (opts.showCount ?? true) ? '18px' : '2px' }}
                    />
                </button>
            </div>
            <div>
                <div className="flex items-center justify-between">
                    <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        Summe anzeigen
                    </label>
                    <button
                        onClick={() => setOpts({ showSum: !(opts.showSum ?? false) })}
                        className="relative w-9 h-5 rounded-full transition-colors"
                        style={{ background: (opts.showSum ?? false) ? 'var(--accent)' : 'var(--app-border)' }}
                    >
                        <span
                            className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all"
                            style={{ left: (opts.showSum ?? false) ? '18px' : '2px' }}
                        />
                    </button>
                </div>
                {opts.showSum && (
                    <div className="mt-1.5 space-y-1.5">
                        <div>
                            <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                                Präfix (z.B. Σ, Summe, Gesamt)
                            </label>
                            <input
                                className="w-full text-[10px] rounded px-2 py-1 focus:outline-none"
                                style={{
                                    background: 'var(--app-bg)',
                                    color: 'var(--text-primary)',
                                    border: '1px solid var(--app-border)',
                                }}
                                placeholder="Σ"
                                value={opts.sumLabel ?? ''}
                                onChange={(e) => setOpts({ sumLabel: e.target.value || undefined })}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                            <div>
                                <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                                    Ausrichtung
                                </label>
                                <div
                                    className="flex rounded-lg overflow-hidden"
                                    style={{ border: '1px solid var(--app-border)' }}
                                >
                                    {(['left', 'center', 'right'] as const).map((v) => {
                                        const lbl = v === 'left' ? 'Links' : v === 'center' ? 'Mitte' : 'Rechts';
                                        const active = (opts.sumAlign ?? 'left') === v;
                                        return (
                                            <button
                                                key={v}
                                                onClick={() => setOpts({ sumAlign: v === 'left' ? undefined : v })}
                                                className="flex-1 text-[10px] py-1 transition-colors"
                                                style={{
                                                    background: active ? 'var(--accent)' : 'var(--app-bg)',
                                                    color: active ? '#fff' : 'var(--text-secondary)',
                                                    borderRight:
                                                        v !== 'right' ? '1px solid var(--app-border)' : undefined,
                                                }}
                                            >
                                                {lbl}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                            <div>
                                <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                                    Schriftgröße (px)
                                </label>
                                <input
                                    type="number"
                                    min={8}
                                    max={96}
                                    className="w-full text-[10px] rounded px-2 py-1 focus:outline-none tabular-nums"
                                    style={{
                                        background: 'var(--app-bg)',
                                        color: 'var(--text-primary)',
                                        border: '1px solid var(--app-border)',
                                    }}
                                    placeholder="10"
                                    value={opts.sumFontSize ?? ''}
                                    onChange={(e) => {
                                        const n = parseInt(e.target.value, 10);
                                        setOpts({ sumFontSize: isFinite(n) && n > 0 ? n : undefined });
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>
            <div className="flex items-center justify-between">
                <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    {t('autolist.showRoom')}
                </label>
                <button
                    onClick={() => setOpts({ showRoom: !(opts.showRoom ?? false) })}
                    className="relative w-9 h-5 rounded-full transition-colors"
                    style={{ background: (opts.showRoom ?? false) ? 'var(--accent)' : 'var(--app-border)' }}
                >
                    <span
                        className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all"
                        style={{ left: (opts.showRoom ?? false) ? '18px' : '2px' }}
                    />
                </button>
            </div>
            <div className="flex items-center justify-between">
                <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    DP-ID anzeigen
                </label>
                <button
                    onClick={() => setOpts({ showId: !(opts.showId ?? false) })}
                    className="relative w-9 h-5 rounded-full transition-colors"
                    style={{ background: (opts.showId ?? false) ? 'var(--accent)' : 'var(--app-border)' }}
                >
                    <span
                        className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all"
                        style={{ left: (opts.showId ?? false) ? '18px' : '2px' }}
                    />
                </button>
            </div>
            <div className="flex items-center justify-between">
                <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    Trennlinien anzeigen
                </label>
                <button
                    onClick={() => setOpts({ showDividers: !(opts.showDividers ?? true) })}
                    className="relative w-9 h-5 rounded-full transition-colors"
                    style={{ background: (opts.showDividers ?? true) ? 'var(--accent)' : 'var(--app-border)' }}
                >
                    <span
                        className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all"
                        style={{ left: (opts.showDividers ?? true) ? '18px' : '2px' }}
                    />
                </button>
            </div>
            <div>
                <div className="flex items-center justify-between">
                    <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        Lange Texte umbrechen
                    </label>
                    <button
                        onClick={() => setOpts({ wrapText: !(opts.wrapText ?? false) })}
                        className="relative w-9 h-5 rounded-full transition-colors"
                        style={{ background: (opts.wrapText ?? false) ? 'var(--accent)' : 'var(--app-border)' }}
                    >
                        <span
                            className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all"
                            style={{ left: (opts.wrapText ?? false) ? '18px' : '2px' }}
                        />
                    </button>
                </div>
                {opts.wrapText && (
                    <div className="mt-1.5 flex items-center gap-2">
                        <label className="text-[10px] shrink-0" style={{ color: 'var(--text-secondary)' }}>
                            Label-Mindestbreite
                        </label>
                        <input
                            type="range"
                            min={10}
                            max={90}
                            step={5}
                            value={Math.max(10, Math.min(90, opts.labelMinPercent ?? 50))}
                            onChange={(e) => setOpts({ labelMinPercent: Number(e.target.value) })}
                            className="flex-1 h-1"
                            style={{ accentColor: 'var(--accent)' }}
                        />
                        <span
                            className="text-[10px] tabular-nums w-9 text-right"
                            style={{ color: 'var(--text-secondary)' }}
                        >
                            {Math.max(10, Math.min(90, opts.labelMinPercent ?? 50))}%
                        </span>
                    </div>
                )}
            </div>
            <div className="flex items-center justify-between">
                <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    Letzte Änderung pro Eintrag
                </label>
                <button
                    onClick={() => setOpts({ showEntryLastChange: !opts.showEntryLastChange })}
                    className="relative w-9 h-5 rounded-full transition-colors"
                    style={{ background: opts.showEntryLastChange ? 'var(--accent)' : 'var(--app-border)' }}
                >
                    <span
                        className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all"
                        style={{ left: opts.showEntryLastChange ? '18px' : '2px' }}
                    />
                </button>
            </div>
            <div className="flex items-center justify-between">
                <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    Nur relevante DPs (Auto-Sync)
                </label>
                <button
                    onClick={() => setOpts({ filterRelevant: !(opts.filterRelevant ?? false) })}
                    className="relative w-9 h-5 rounded-full transition-colors"
                    style={{ background: (opts.filterRelevant ?? false) ? 'var(--accent)' : 'var(--app-border)' }}
                >
                    <span
                        className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all"
                        style={{ left: (opts.filterRelevant ?? false) ? '18px' : '2px' }}
                    />
                </button>
            </div>
            <div>
                <label className="text-[11px] mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>
                    Anzeige-Filter (Backend)
                </label>
                <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--app-border)' }}>
                    {(['all', 'active', 'inactive'] as const).map((v) => {
                        const label =
                            v === 'all'
                                ? 'Alle'
                                : v === 'active'
                                  ? opts.filterActiveLabel || 'Nur aktive'
                                  : opts.filterInactiveLabel || 'Nur inaktive';
                        const active = (opts.backendValueFilter ?? 'all') === v;
                        return (
                            <button
                                key={v}
                                onClick={() => setOpts({ backendValueFilter: v === 'all' ? undefined : v })}
                                className="flex-1 text-[11px] py-1.5 transition-colors"
                                style={{
                                    background: active ? 'var(--accent)' : 'var(--app-bg)',
                                    color: active ? '#fff' : 'var(--text-secondary)',
                                    borderRight: v !== 'inactive' ? '1px solid var(--app-border)' : undefined,
                                }}
                            >
                                {label}
                            </button>
                        );
                    })}
                </div>
            </div>
            <div>
                <label className="text-[11px] mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>
                    Anzeige-Filter (Frontend)
                </label>
                <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--app-border)' }}>
                    {(['all', 'active', 'inactive'] as const).map((v) => {
                        const label =
                            v === 'all'
                                ? 'Alle'
                                : v === 'active'
                                  ? opts.filterActiveLabel || 'Nur aktive'
                                  : opts.filterInactiveLabel || 'Nur inaktive';
                        const active = (opts.valueFilter ?? 'all') === v;
                        return (
                            <button
                                key={v}
                                onClick={() => setOpts({ valueFilter: v })}
                                className="flex-1 text-[11px] py-1.5 transition-colors"
                                style={{
                                    background: active ? 'var(--accent)' : 'var(--app-bg)',
                                    color: active ? '#fff' : 'var(--text-secondary)',
                                    borderRight: v !== 'inactive' ? '1px solid var(--app-border)' : undefined,
                                }}
                            >
                                {label}
                            </button>
                        );
                    })}
                </div>
                <div className="grid grid-cols-2 gap-1.5 mt-1.5">
                    <div>
                        <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                            Label &quot;aktiv&quot;
                        </label>
                        <input
                            className="w-full text-[10px] rounded px-2 py-1 focus:outline-none"
                            style={{
                                background: 'var(--app-bg)',
                                color: 'var(--text-primary)',
                                border: '1px solid var(--app-border)',
                            }}
                            placeholder="Nur aktive"
                            value={opts.filterActiveLabel ?? ''}
                            onChange={(e) => setOpts({ filterActiveLabel: e.target.value || undefined })}
                        />
                    </div>
                    <div>
                        <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                            Label &quot;inaktiv&quot;
                        </label>
                        <input
                            className="w-full text-[10px] rounded px-2 py-1 focus:outline-none"
                            style={{
                                background: 'var(--app-bg)',
                                color: 'var(--text-primary)',
                                border: '1px solid var(--app-border)',
                            }}
                            placeholder="Nur inaktive"
                            value={opts.filterInactiveLabel ?? ''}
                            onChange={(e) => setOpts({ filterInactiveLabel: e.target.value || undefined })}
                        />
                    </div>
                </div>
            </div>
            <div>
                <div className="flex items-center justify-between">
                    <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        Anzahl im Backend veröffentlichen
                    </label>
                    <button
                        onClick={() => setOpts({ publishCount: !(opts.publishCount ?? false) })}
                        className="relative w-9 h-5 rounded-full transition-colors"
                        style={{ background: (opts.publishCount ?? false) ? 'var(--accent)' : 'var(--app-border)' }}
                    >
                        <span
                            className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all"
                            style={{ left: (opts.publishCount ?? false) ? '18px' : '2px' }}
                        />
                    </button>
                </div>
                {opts.publishCount && (
                    <p
                        className="text-[9px] mt-1 font-mono truncate"
                        style={{ color: 'var(--text-secondary)', opacity: 0.7 }}
                    >
                        {NS}.lists.{config.id}.count
                    </p>
                )}
            </div>

            {/* ── Darstellung AN/AUS (global) ── */}
            <div>
                <label className="text-[11px] mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>
                    Darstellung AN/AUS (global)
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                    <div>
                        <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                            Text AN
                        </label>
                        <input
                            className="w-full text-[10px] rounded px-2 py-1 focus:outline-none"
                            style={{
                                background: 'var(--app-bg)',
                                color: 'var(--text-primary)',
                                border: '1px solid var(--app-border)',
                            }}
                            placeholder="AN"
                            value={opts.trueText ?? ''}
                            onChange={(e) => setOpts({ trueText: e.target.value || undefined })}
                        />
                    </div>
                    <div>
                        <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                            Text AUS
                        </label>
                        <input
                            className="w-full text-[10px] rounded px-2 py-1 focus:outline-none"
                            style={{
                                background: 'var(--app-bg)',
                                color: 'var(--text-primary)',
                                border: '1px solid var(--app-border)',
                            }}
                            placeholder="AUS"
                            value={opts.falseText ?? ''}
                            onChange={(e) => setOpts({ falseText: e.target.value || undefined })}
                        />
                    </div>
                    <ColorField
                        label="Textfarbe AN"
                        value={opts.activeColor}
                        fallback="#22c55e"
                        onChange={(v) => setOpts({ activeColor: v })}
                    />
                    <ColorField
                        label="Textfarbe AUS"
                        value={opts.inactiveColor}
                        fallback="#94a3b8"
                        onChange={(v) => setOpts({ inactiveColor: v })}
                    />
                    <ColorField
                        label="Hintergrund AN"
                        value={opts.activeBg}
                        fallback="#22c55e"
                        onChange={(v) => setOpts({ activeBg: v })}
                    />
                    <ColorField
                        label="Hintergrund AUS"
                        value={opts.inactiveBg}
                        fallback="#1f2937"
                        onChange={(v) => setOpts({ inactiveBg: v })}
                    />
                </div>
                <p className="text-[9px] mt-1" style={{ color: 'var(--text-secondary)', opacity: 0.65 }}>
                    Defaults pro Widget. Pro DP überschreibbar.
                </p>
            </div>

            {/* ── Sortierung ── */}
            <div>
                <label className="text-[11px] mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>
                    Sortierung
                </label>
                <div className="flex gap-1">
                    {(['none', 'label', 'value'] as const).map((v) => {
                        const lbl = v === 'none' ? 'Keine' : v === 'label' ? 'Name' : 'Wert';
                        const active = (opts.sortBy ?? 'none') === v;
                        return (
                            <button
                                key={v}
                                onClick={() =>
                                    setOpts({
                                        sortBy: v === 'none' ? undefined : v,
                                        ...(v === 'none' ? { sortBy2: undefined, sortOrder2: undefined } : {}),
                                    })
                                }
                                className="flex-1 text-[11px] py-1.5 rounded-lg transition-colors"
                                style={{
                                    background: active ? 'var(--accent)' : 'var(--app-bg)',
                                    color: active ? '#fff' : 'var(--text-secondary)',
                                    border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                                }}
                            >
                                {lbl}
                            </button>
                        );
                    })}
                </div>
                {(opts.sortBy ?? 'none') !== 'none' && (
                    <div className="flex gap-1 mt-1">
                        {(['asc', 'desc'] as const).map((v) => {
                            const lbl = v === 'asc' ? '↑ Aufsteigend' : '↓ Absteigend';
                            const active = (opts.sortOrder ?? 'asc') === v;
                            return (
                                <button
                                    key={v}
                                    onClick={() => setOpts({ sortOrder: v })}
                                    className="flex-1 text-[11px] py-1.5 rounded-lg transition-colors"
                                    style={{
                                        background: active ? 'var(--accent)' : 'var(--app-bg)',
                                        color: active ? '#fff' : 'var(--text-secondary)',
                                        border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                                    }}
                                >
                                    {lbl}
                                </button>
                            );
                        })}
                    </div>
                )}
                {(opts.sortBy ?? 'none') !== 'none' && (
                    <>
                        <label className="text-[10px] mt-2 mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                            Danach sortieren <span className="opacity-60">(bei Gleichheit)</span>
                        </label>
                        <div className="flex gap-1">
                            {(['none', 'label', 'value'] as const).map((v) => {
                                const lbl = v === 'none' ? 'Keine' : v === 'label' ? 'Name' : 'Wert';
                                const disabled = v !== 'none' && v === opts.sortBy;
                                const active = (opts.sortBy2 ?? 'none') === v;
                                return (
                                    <button
                                        key={v}
                                        disabled={disabled}
                                        title={disabled ? 'Schon als 1. Sortierung gewählt' : undefined}
                                        onClick={() => setOpts({ sortBy2: v === 'none' ? undefined : v })}
                                        className="flex-1 text-[11px] py-1.5 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                        style={{
                                            background: active ? 'var(--accent)' : 'var(--app-bg)',
                                            color: active ? '#fff' : 'var(--text-secondary)',
                                            border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                                        }}
                                    >
                                        {lbl}
                                    </button>
                                );
                            })}
                        </div>
                        {(opts.sortBy2 ?? 'none') !== 'none' && (
                            <div className="flex gap-1 mt-1">
                                {(['asc', 'desc'] as const).map((v) => {
                                    const lbl = v === 'asc' ? '↑ Aufsteigend' : '↓ Absteigend';
                                    const active = (opts.sortOrder2 ?? 'asc') === v;
                                    return (
                                        <button
                                            key={v}
                                            onClick={() => setOpts({ sortOrder2: v })}
                                            className="flex-1 text-[11px] py-1.5 rounded-lg transition-colors"
                                            style={{
                                                background: active ? 'var(--accent)' : 'var(--app-bg)',
                                                color: active ? '#fff' : 'var(--text-secondary)',
                                                border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                                            }}
                                        >
                                            {lbl}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* ── Layout: Karte – Kartenbreite ── */}
            {config.layout === 'card' && (
                <div>
                    <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                        Kachel-Mindestbreite (px)
                    </label>
                    <input
                        type="number"
                        min={60}
                        max={400}
                        step={10}
                        className={iCls}
                        style={iSty}
                        value={opts.cardMinWidth ?? 90}
                        onChange={(e) => setOpts({ cardMinWidth: Number(e.target.value) || undefined })}
                    />
                    <p className="text-[9px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                        Mindestbreite je Kachel – größere Werte = weniger Spalten
                    </p>
                </div>
            )}

            {/* ── DatapointPicker for exclude blacklist ── */}
            {showExcludePicker && (
                <DatapointPicker
                    currentValue=""
                    onSelect={() => setShowExcludePicker(false)}
                    onClose={() => setShowExcludePicker(false)}
                    multiSelect
                    onMultiSelect={(picks) => {
                        setExcludeIds((prev) => {
                            const next = new Set(prev);
                            picks.forEach((p) => next.add(p.id));
                            return [...next];
                        });
                        resetSearch();
                        setShowExcludePicker(false);
                    }}
                />
            )}
        </>
    );
}
