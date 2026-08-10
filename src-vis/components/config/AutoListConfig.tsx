import { useState, useEffect, useMemo } from 'react';
import { Plus } from 'lucide-react';
import { ValueFormatRow } from './ValueFormatRow';
import type { WidgetConfig } from '../../types';
import type { AutoListOptions, AutoListEntry } from '../widgets/AutoListWidget';
import { useT } from '../../i18n';
import { ensureDatapointCache } from '../../hooks/useDatapointList';
import { applyDpNameFilter } from '../../utils/dpNameFilter';
import type { NameSource } from '../../utils/nameFilter';
import { NameDisplayFields } from './NameDisplayFields';
import { AutoEntryDetail } from './list/AutoEntryDetail';
import { AutoDiscoveryPanel } from './list/AutoDiscoveryPanel';
import { DatapointManagerField } from './list/DatapointManagerField';
import { useDpDiscovery } from '../../hooks/useDpDiscovery';
import { RowClickSection } from './RowClickSection';
import { NS } from '../../utils/namespace';
import { ColorField, ConfigSection } from './list/listFieldUi';
import { Icon } from '@iconify/react';
import { IconPickerModal } from './IconPickerModal';
import { lucidePascalToIconify } from '../../utils/iconifyLoader';
import type { ListStat } from '../../utils/listStats';

function toIconifyId(name: string): string {
    return name.includes(':') ? name : lucidePascalToIconify(name);
}

// ── Per-entry config row ───────────────────────────────────────────────────────

// ── Main config panel ──────────────────────────────────────────────────────────

interface Props {
    config: WidgetConfig;
    onConfigChange: (config: WidgetConfig) => void;
}

export function AutoListConfig({ config, onConfigChange }: Props) {
    const t = useT();
    const opts = (config.options ?? { entries: [] }) as unknown as AutoListOptions;

    const [statIconPicker, setStatIconPicker] = useState<ListStat | null>(null);
    const [resolvedNames, setResolvedNames] = useState<Record<string, string>>({});

    useEffect(() => {
        ensureDatapointCache().then((cache) => {
            const map: Record<string, string> = {};
            for (const e of cache) map[e.id] = e.name;
            setResolvedNames(map);
        });
    }, []);

    const setOpts = (patch: Partial<AutoListOptions>) => {
        onConfigChange({ ...config, options: { ...opts, ...patch } });
    };

    // Datapoint search state. Owned here, not by the dialog, so filter drafts and
    // results survive closing it - and so the uncached filter-option scan runs once.
    const discovery = useDpDiscovery(opts, setOpts);

    const iSty = {
        background: 'var(--app-bg)',
        color: 'var(--text-primary)',
        border: '1px solid var(--app-border)',
    } as React.CSSProperties;
    const iCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none';

    // Name-filter preview examples — built exactly like AutoListWidget's getLabel, so the
    // preview in the sub-editor matches what the widget will render.
    const nameEntries = opts.entries ?? [];
    const nameEntryKey = nameEntries.map((e) => `${e.id}|${e.label ?? ''}`).join(',');
    const nameSamples: NameSource[] = useMemo(
        () =>
            nameEntries.slice(0, 6).map((e) => ({
                id: e.id,
                name: applyDpNameFilter(e.label || resolvedNames[e.id] || e.id.split('.').pop() || e.id),
                room: e.rooms?.[0],
            })),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [nameEntryKey, resolvedNames],
    );

    const removeEntry = (id: string) => setOpts({ entries: (opts.entries ?? []).filter((e) => e.id !== id) });

    const updateEntry = (id: string, patch: Partial<AutoListEntry>) =>
        setOpts({ entries: (opts.entries ?? []).map((e) => (e.id === id ? { ...e, ...patch } : e)) });

    return (
        <>
            {/* -- Datapoints (own dialog) -- */}
            <DatapointManagerField
                title="Datenpunkte verwalten"
                storageKey="aura-autolist-dp-modal"
                count={(opts.entries ?? []).length}
                hint="Datenpunkte suchen, übernehmen und im Detail konfigurieren."
                entries={opts.entries ?? []}
                resolvedNames={resolvedNames}
                entriesTabIndex={1}
                onRemove={removeEntry}
                onRemoveAll={() => setOpts({ entries: [] })}
                emptyState={'Noch keine Datenpunkte – im Tab „Suchen & Filter“ welche finden.'}
                renderDetail={(id) => (
                    <AutoEntryDetail
                        entry={(opts.entries ?? []).find((e) => e.id === id)!}
                        listConfig={config}
                        onUpdate={(patch) => updateEntry(id, patch)}
                    />
                )}
                tabs={[
                    {
                        key: 'discovery',
                        label: 'Suchen & Filter',
                        node: (api) => (
                            <AutoDiscoveryPanel
                                opts={opts}
                                onOptsChange={setOpts}
                                discovery={discovery}
                                onApplied={(firstNewId) => {
                                    if (firstNewId) api.select(firstNewId);
                                    api.goToEntries();
                                }}
                            />
                        ),
                    },
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
                                sampleTotal={(opts.entries ?? []).length}
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
                <div>
                    <div className="flex items-center justify-between">
                        <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                            Nach Raum gruppieren
                        </label>
                        <button
                            onClick={() => setOpts({ groupByRoom: !(opts.groupByRoom ?? false) })}
                            className="relative w-9 h-5 rounded-full transition-colors"
                            style={{ background: (opts.groupByRoom ?? false) ? 'var(--accent)' : 'var(--app-border)' }}
                        >
                            <span
                                className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all"
                                style={{ left: (opts.groupByRoom ?? false) ? '18px' : '2px' }}
                            />
                        </button>
                    </div>
                    {opts.groupByRoom && (
                        <div className="mt-1.5">
                            <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                                Überschrift ohne Raum
                            </label>
                            <input
                                className="w-full text-[10px] rounded px-2 py-1 focus:outline-none"
                                style={{
                                    background: 'var(--app-bg)',
                                    color: 'var(--text-primary)',
                                    border: '1px solid var(--app-border)',
                                }}
                                placeholder="Ohne Raum"
                                value={opts.noRoomLabel ?? ''}
                                onChange={(e) => setOpts({ noRoomLabel: e.target.value || undefined })}
                            />
                            <p className="text-[9px] mt-0.5" style={{ color: 'var(--text-secondary)', opacity: 0.65 }}>
                                Raumname wird als Abschnitts-Überschrift angezeigt; DPs darunter gruppiert.
                            </p>
                            <div className="mt-2">
                                <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                                    Überschrift – Schriftgröße (px)
                                </label>
                                <input
                                    type="number"
                                    min={8}
                                    max={32}
                                    className="w-full text-[10px] rounded px-2 py-1 focus:outline-none tabular-nums"
                                    style={{
                                        background: 'var(--app-bg)',
                                        color: 'var(--text-primary)',
                                        border: '1px solid var(--app-border)',
                                    }}
                                    placeholder="10"
                                    value={opts.roomHeaderFontSize ?? ''}
                                    onChange={(e) => {
                                        const n = parseInt(e.target.value, 10);
                                        setOpts({ roomHeaderFontSize: isFinite(n) && n > 0 ? n : undefined });
                                    }}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-1.5 mt-1.5">
                                <ColorField
                                    label="Überschrift – Textfarbe"
                                    value={opts.roomHeaderColor}
                                    fallback="#94a3b8"
                                    onChange={(v) => setOpts({ roomHeaderColor: v })}
                                />
                                <ColorField
                                    label="Überschrift – Hintergrund"
                                    value={opts.roomHeaderBg}
                                    fallback="#1f2937"
                                    onChange={(v) => setOpts({ roomHeaderBg: v })}
                                />
                            </div>
                        </div>
                    )}
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
            </ConfigSection>
            <ConfigSection title="Werte & Farben">
                <ValueFormatRow decimals={opts.decimals} numberFormat={opts.numberFormat} onChange={setOpts} />
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
        </>
    );
}
