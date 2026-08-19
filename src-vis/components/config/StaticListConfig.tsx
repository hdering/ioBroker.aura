/**
 * StaticListConfig – config panel for the "Statische Liste" widget.
 *
 * Unlike AutoListConfig (filter-based discovery), entries are added
 * manually one at a time via the DatapointPicker (object browser).
 */
import { useState, useEffect, useMemo } from 'react';
import { Plus } from 'lucide-react';
import { Icon } from '@iconify/react';
import type { WidgetConfig } from '../../types';
import { isDivider, type StaticListEntry, type StaticListOptions } from '../widgets/ListWidget';
import type { ListStat } from '../../utils/listStats';
import { ColorField, ConfigSection } from './list/listFieldUi';
import { DatapointPicker } from './DatapointPicker';
import { IconPickerModal } from './IconPickerModal';
import { lookupDatapointEntry, ensureDatapointCache } from '../../hooks/useDatapointList';
import { applyDpNameFilter } from '../../utils/dpNameFilter';
import type { NameSource } from '../../utils/nameFilter';
import { NameDisplayFields } from './NameDisplayFields';
import { ValueTransformFields } from './ValueTransformFields';
import { ColorThresholdsEditor } from './ColorThresholdsEditor';
import { StaticEntryDetail } from './list/StaticEntryDetail';
import { DividerDetail } from './list/DividerDetail';
import { DatapointManagerField } from './list/DatapointManagerField';
import { ListFilterSection } from './list/ListFilterSection';
import type { EditorFilterRow } from './list/ListFilterEditor';
import { RowClickSection } from './RowClickSection';
import { lucidePascalToIconify } from '../../utils/iconifyLoader';
import { NS } from '../../utils/namespace';

function toIconifyId(name: string): string {
    return name.includes(':') ? name : lucidePascalToIconify(name);
}

interface Props {
    config: WidgetConfig;
    onConfigChange: (config: WidgetConfig) => void;
}

// ── Main config panel ─────────────────────────────────────────────────────────

export function StaticListConfig({ config, onConfigChange }: Props) {
    const opts = (config.options ?? { entries: [] }) as unknown as StaticListOptions;
    const entries = opts.entries ?? [];
    const [showPicker, setShowPicker] = useState(false);
    const [statIconPicker, setStatIconPicker] = useState<ListStat | null>(null);
    const [resolvedNames, setResolvedNames] = useState<Record<string, string>>({});

    useEffect(() => {
        ensureDatapointCache().then((cache) => {
            const map: Record<string, string> = {};
            for (const e of cache) map[e.id] = e.name;
            setResolvedNames(map);
        });
    }, []);

    const setOpts = (patch: Partial<StaticListOptions>) => {
        onConfigChange({ ...config, options: { ...opts, ...patch } });
    };

    // Name-filter preview examples — built exactly like ListWidget's getLabel, so the
    // preview in the sub-editor matches what the widget will render.
    const entryKey = entries.map((e) => `${e.id}|${e.label ?? ''}`).join(',');
    const nameSamples: NameSource[] = useMemo(
        () =>
            entries
                .filter((e) => !isDivider(e))
                .slice(0, 6)
                .map((e) => ({
                    id: e.id,
                    name: applyDpNameFilter(e.label || resolvedNames[e.id] || e.id.split('.').pop() || e.id),
                    room: lookupDatapointEntry(e.id)?.rooms[0],
                })),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [entryKey, resolvedNames],
    );

    // What the filter editor evaluates against: every entry with its own second-line
    // datapoints, so a rule can be built from the values that are really there.
    const subDpKey = entries.map((e) => (e.subDps ?? []).map((s) => `${s?.id}|${s?.label ?? ''}`).join('+')).join(',');
    const filterRows = useMemo<EditorFilterRow[]>(
        () =>
            entries
                .filter((e) => !isDivider(e))
                .map((e) => ({
                    id: e.id,
                    label: e.label || resolvedNames[e.id] || e.id.split('.').pop() || e.id,
                    subs: (e.subDps ?? []).filter((s) => !!s?.id).map((s) => ({ id: s.id, label: s.label })),
                })),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [entryKey, subDpKey, resolvedNames],
    );

    const addEntry = (id: string, _name?: string, unit?: string) => {
        if (!id || entries.find((e) => e.id === id)) return;
        const dp = lookupDatapointEntry(id);
        const writable = dp?.write !== false ? undefined : false;
        setOpts({ entries: [...entries, { id, label: undefined, unit: unit || undefined, role: dp?.role, writable }] });
    };

    const removeEntry = (id: string) => setOpts({ entries: entries.filter((e) => e.id !== id) });

    /** Appends a separator row. Its id only has to be unique and stable — it is a React
     *  key and the selection key, never an ioBroker object. */
    const addDivider = () => {
        let n = 1;
        while (entries.some((e) => e.id === `divider:${n}`)) n++;
        setOpts({ entries: [...entries, { id: `divider:${n}`, divider: true }] });
    };

    const updateEntry = (id: string, patch: Partial<StaticListEntry>) =>
        setOpts({ entries: entries.map((e) => (e.id === id ? { ...e, ...patch } : e)) });

    const changeEntryId = (oldId: string, newId: string, unit?: string, role?: string, writable?: boolean) => {
        if (!newId || oldId === newId) return;
        if (entries.some((e) => e.id === newId)) {
            window.alert(`Datenpunkt "${newId}" ist bereits in der Liste.`);
            return;
        }
        setOpts({
            entries: entries.map((e) =>
                e.id === oldId ? { ...e, id: newId, unit: unit ?? e.unit, role: role ?? e.role, writable } : e,
            ),
        });
    };

    // With separators in the list the manual order keeps mattering even while a sort
    // order is active — the sections are placed by hand and only sorted within.
    const hasDividers = entries.some((e) => isDivider(e));

    const reorderEntries = (fromIdx: number, toIdx: number) => {
        if (fromIdx === toIdx) return;
        if (fromIdx < 0 || fromIdx >= entries.length) return;
        if (toIdx < 0 || toIdx >= entries.length) return;
        const next = [...entries];
        const [moved] = next.splice(fromIdx, 1);
        next.splice(toIdx, 0, moved);
        setOpts({ entries: next });
    };

    return (
        <>
            {/* ── Datapoints (own dialog) ── */}
            <DatapointManagerField
                title="Datenpunkte verwalten"
                storageKey="aura-staticlist-dp-modal"
                count={entries.length}
                hint="Datenpunkte hinzufügen, sortieren und im Detail konfigurieren."
                entries={entries}
                resolvedNames={resolvedNames}
                onRemove={removeEntry}
                onRemoveAll={() => setOpts({ entries: [] })}
                onAdd={() => setShowPicker(true)}
                onAddDivider={addDivider}
                onReorder={reorderEntries}
                sortHint={
                    (opts.sortBy ?? 'none') === 'none'
                        ? undefined
                        : hasDividers
                          ? `Sortierung „${opts.sortBy === 'label' ? 'Name' : 'Wert'}“ ist aktiv — sie wirkt innerhalb eines Abschnitts. Die Reihenfolge der Trennlinien und Abschnitte bleibt manuell.`
                          : `Sortierung „${opts.sortBy === 'label' ? 'Name' : 'Wert'}“ ist aktiv — manuelle Reihenfolge wirkt erst, wenn Sortierung auf „Keine“ steht.`
                }
                keepDraggable={hasDividers}
                renderDetail={(id, api) => {
                    const found = entries.find((e) => e.id === id)!;
                    if (isDivider(found))
                        return <DividerDetail entry={found} onUpdate={(patch) => updateEntry(id, patch)} />;
                    return (
                        <StaticEntryDetail
                            entry={entries.find((e) => e.id === id)!}
                            listConfig={config}
                            onUpdate={(patch) => updateEntry(id, patch)}
                            onChangeId={(newId, unit, role, writable) => {
                                changeEntryId(id, newId, unit, role, writable);
                                // The id is the selection key - follow it, or the detail
                                // pane would empty out mid-edit.
                                api.select(newId);
                            }}
                        />
                    );
                }}
                tabs={[
                    {
                        key: 'rowclick',
                        label: 'Klick auf Zeile',
                        node: <RowClickSection config={config} opts={opts} onChange={setOpts} />,
                    },
                    {
                        key: 'names',
                        label: 'Namen',
                        node: (
                            <NameDisplayFields
                                pattern={opts.namePattern}
                                rules={opts.nameFilters}
                                samples={nameSamples}
                                sampleTotal={entries.length}
                                onChange={setOpts}
                                inline
                            />
                        ),
                    },
                ]}
            />

            <ConfigSection title="Anzeige" defaultOpen>
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

                <div className="flex items-center justify-between">
                    <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        Raum anzeigen
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
            </ConfigSection>
            <ConfigSection title="Werte & Farben">
                {/* ── Wert-Umrechnung / Zeit (global) ── */}
                <div>
                    <label className="text-[11px] mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>
                        Wert-Umrechnung / Zeit (global)
                    </label>
                    <ValueTransformFields
                        factor={opts.valueFactor}
                        offset={opts.valueOffset}
                        presetId={opts.valueTransform}
                        timeFormat={opts.valueTimeFormat}
                        timePattern={opts.valueTimePattern}
                        allowTimeFormat
                        dpId={entries[0]?.id}
                        onPatch={setOpts}
                        inputClassName="w-full text-[10px] rounded px-2 py-1 focus:outline-none"
                    />
                    <p className="text-[9px] mt-1" style={{ color: 'var(--text-secondary)', opacity: 0.65 }}>
                        Gilt für jeden Datenpunkt ohne eigene Umrechnung (Datenpunkte verwalten → ƒx).
                    </p>
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
                {/* ── Farbschwellen (global) ── */}
                <div>
                    <ColorThresholdsEditor
                        label="Farbschwellen (global)"
                        thresholds={opts.colorThresholds ?? []}
                        onChange={(next) => setOpts({ colorThresholds: next.length ? next : undefined })}
                    />
                    <p className="text-[9px] mt-1" style={{ color: 'var(--text-secondary)', opacity: 0.65 }}>
                        Färbt den Werttext jedes Datenpunkts ohne eigene Skala (Datenpunkte verwalten → Farbschwellen).
                    </p>
                </div>
            </ConfigSection>
            <ConfigSection title="Statistik">
                <div>
                    <div className="flex items-center justify-between">
                        <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                            Statistik anzeigen
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
                        <div
                            className="mt-1.5 ml-1 pl-2 space-y-1.5"
                            style={{ borderLeft: '2px solid color-mix(in srgb, var(--accent) 45%, transparent)' }}
                        >
                            <div>
                                <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                                    Werte
                                </label>
                                <div className="flex flex-wrap gap-1">
                                    {(
                                        [
                                            ['sum', 'Summe'],
                                            ['avg', 'Mittelwert'],
                                            ['min', 'Minimum'],
                                            ['max', 'Maximum'],
                                        ] as const
                                    ).map(([key, lbl]) => {
                                        const sel = (opts.sumStats ?? ['sum']) as ('sum' | 'avg' | 'min' | 'max')[];
                                        const active = sel.includes(key);
                                        return (
                                            <button
                                                key={key}
                                                onClick={() => {
                                                    const cur = (opts.sumStats ?? ['sum']) as (
                                                        | 'sum'
                                                        | 'avg'
                                                        | 'min'
                                                        | 'max'
                                                    )[];
                                                    const next = cur.includes(key)
                                                        ? cur.filter((s) => s !== key)
                                                        : [...cur, key];
                                                    setOpts({ sumStats: next.length ? next : undefined });
                                                }}
                                                className="text-[10px] px-2 py-1 rounded-full transition-colors"
                                                style={{
                                                    background: active ? 'var(--accent)' : 'var(--app-bg)',
                                                    color: active ? '#fff' : 'var(--text-secondary)',
                                                    border: '1px solid var(--app-border)',
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
                                    Präfix / Icon / Text
                                </label>
                                <div className="grid grid-cols-2 gap-1.5">
                                    {(
                                        [
                                            ['sum', 'Summe', 'Σ'],
                                            ['avg', 'Mittelwert', 'ø'],
                                            ['min', 'Minimum', '↓'],
                                            ['max', 'Maximum', '↑'],
                                        ] as const
                                    )
                                        .filter(([key]) =>
                                            ((opts.sumStats ?? ['sum']) as ('sum' | 'avg' | 'min' | 'max')[]).includes(
                                                key,
                                            ),
                                        )
                                        .map(([key, lbl, sym]) => (
                                            <div key={key}>
                                                <label
                                                    className="text-[9px] block mb-0.5"
                                                    style={{ color: 'var(--text-secondary)' }}
                                                >
                                                    {lbl}
                                                </label>
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        onClick={() => setStatIconPicker(key)}
                                                        title={opts.statIcons?.[key] || 'Icon wählen'}
                                                        className="shrink-0 flex items-center justify-center rounded hover:opacity-80"
                                                        style={{
                                                            background: 'var(--app-bg)',
                                                            color: 'var(--text-primary)',
                                                            border: '1px solid var(--app-border)',
                                                            width: 26,
                                                            height: 26,
                                                        }}
                                                    >
                                                        {opts.statIcons?.[key] ? (
                                                            <Icon
                                                                icon={toIconifyId(opts.statIcons[key]!)}
                                                                width={14}
                                                                height={14}
                                                            />
                                                        ) : (
                                                            <Plus
                                                                size={12}
                                                                style={{ color: 'var(--text-secondary)', opacity: 0.6 }}
                                                            />
                                                        )}
                                                    </button>
                                                    <input
                                                        className="flex-1 min-w-0 text-[10px] rounded px-2 py-1 focus:outline-none"
                                                        style={{
                                                            background: 'var(--app-bg)',
                                                            color: 'var(--text-primary)',
                                                            border: '1px solid var(--app-border)',
                                                        }}
                                                        placeholder={sym}
                                                        value={
                                                            opts.statLabels?.[key] ??
                                                            (key === 'sum' ? (opts.sumLabel ?? '') : '')
                                                        }
                                                        onChange={(e) =>
                                                            setOpts({
                                                                statLabels: {
                                                                    ...opts.statLabels,
                                                                    [key]: e.target.value || undefined,
                                                                },
                                                            })
                                                        }
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-1.5">
                                <div>
                                    <label
                                        className="text-[9px] block mb-0.5"
                                        style={{ color: 'var(--text-secondary)' }}
                                    >
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
                                    <label
                                        className="text-[9px] block mb-0.5"
                                        style={{ color: 'var(--text-secondary)' }}
                                    >
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
                            {statIconPicker && (
                                <IconPickerModal
                                    current={opts.statIcons?.[statIconPicker] ?? ''}
                                    onSelect={(name) => {
                                        setOpts({
                                            statIcons: { ...opts.statIcons, [statIconPicker]: name || undefined },
                                        });
                                        setStatIconPicker(null);
                                    }}
                                    onClose={() => setStatIconPicker(null)}
                                />
                            )}
                        </div>
                    )}
                </div>
            </ConfigSection>
            <ConfigSection title="Filter & Sortierung">
                <ListFilterSection
                    opts={opts}
                    setOpts={setOpts}
                    rows={filterRows}
                    storageKey="aura-staticlist-filter-modal"
                    showChipToggle
                />

                {/* ── Sortierung ── */}
                <div>
                    <label className="text-[11px] mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>
                        Sortierung
                    </label>
                    {/* Only worth saying once a separator exists — otherwise it describes
                        a case the user has not built. */}
                    {hasDividers && (
                        <p className="text-[10px] mb-1.5" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                            Mit Trennlinien wird <strong>innerhalb</strong> eines Abschnitts sortiert — die Abschnitte
                            selbst bleiben in ihrer Reihenfolge stehen.
                        </p>
                    )}
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
            </ConfigSection>
            <ConfigSection title="Veröffentlichen">
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
            </ConfigSection>
            {/* ── DatapointPicker (multi-select) ── */}
            {showPicker && (
                <DatapointPicker
                    currentValue=""
                    onSelect={(id, unit, name) => {
                        addEntry(id, name, unit);
                        setShowPicker(false);
                    }}
                    onClose={() => setShowPicker(false)}
                    multiSelect
                    onMultiSelect={(picks) => {
                        const newEntries = picks
                            .filter((p) => !!p.id && !entries.find((e) => e.id === p.id))
                            .map((p) => ({
                                id: p.id,
                                label: undefined,
                                unit: p.unit || undefined,
                                role: p.role,
                                writable: p.write !== false ? undefined : false,
                            }));
                        if (newEntries.length > 0) setOpts({ entries: [...entries, ...newEntries] });
                        setShowPicker(false);
                    }}
                />
            )}
        </>
    );
}
