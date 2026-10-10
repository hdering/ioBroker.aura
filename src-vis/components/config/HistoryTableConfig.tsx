/**
 * HistoryTableConfig — config panel of the history table (#760): which adapter, which rows
 * (last N values or a time window), how the time columns read and how values are formatted.
 */
import { useEffect, useMemo, useState } from 'react';
import type { WidgetConfig } from '../../types';
import { useT } from '../../i18n';
import { getObjectDirect, useIoBroker } from '../../hooks/useIoBroker';
import { detectHistoryAdapters, RANGE_LABELS, type DetectedAdapter } from '../../hooks/useChartHistory';
import {
    HISTORY_GRID_AGGREGATES,
    HISTORY_GRID_STEPS,
    HISTORY_TABLE_MAX_COUNT,
    HISTORY_TABLE_RANGE_CAP,
    useHistoryRows,
} from '../../hooks/useHistoryRows';
import {
    HISTORY_SORT_KEYS,
    HISTORY_TABLE_DEFAULT_COUNT,
    HISTORY_TABLE_DEFAULT_DATE,
    HISTORY_TABLE_DEFAULT_TIME,
    HISTORY_TABLE_GRID_TIME,
    HISTORY_TABLE_RANGES,
    historyColumns,
    historyGridOf,
    historyRangeMs,
    historySortRows,
    historyTableRows,
    type HistoryColumnDef,
    type HistoryColumnKey,
    type HistoryTableRange,
} from '../widgets/HistoryTableWidget';
import { RANGE_UNITS, type RangeUnit } from '../../utils/rangeChips';
import type { NumberFormat } from '../../utils/formatValue';
import type { JsonSortRule } from '../../utils/jsonTableSort';
import { ValueFormatRow } from './ValueFormatRow';
import { HistoryTableColumnsSection } from './HistoryTableColumnsSection';
import { JsonTableSortSection } from './JsonTableSortSection';

interface Props {
    config: WidgetConfig;
    onConfigChange: (config: WidgetConfig) => void;
}

const fieldCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none';
const fieldSty: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};
const labelCls = 'text-[11px] mb-1 block';
const labelSty: React.CSSProperties = { color: 'var(--text-secondary)' };
const hintSty: React.CSSProperties = { color: 'var(--text-secondary)', opacity: 0.7 };

function Segmented<T extends string>({
    value,
    options,
    onChange,
}: {
    value: T;
    options: { id: T; label: string }[];
    onChange: (v: T) => void;
}) {
    return (
        <div className="flex gap-1 flex-wrap">
            {options.map((opt) => {
                const on = opt.id === value;
                return (
                    <button
                        key={opt.id}
                        type="button"
                        onClick={() => onChange(opt.id)}
                        className="flex-1 text-[11px] py-1 px-1.5 rounded-md transition-opacity hover:opacity-80"
                        style={{
                            background: on ? 'var(--accent)' : 'var(--app-bg)',
                            color: on ? '#fff' : 'var(--text-secondary)',
                            border: `1px solid ${on ? 'var(--accent)' : 'var(--app-border)'}`,
                            minWidth: 36,
                        }}
                    >
                        {opt.label}
                    </button>
                );
            })}
        </div>
    );
}

function Check({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
    return (
        <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="rounded" />
            <span className="text-[11px]" style={labelSty}>
                {label}
            </span>
        </label>
    );
}

/**
 * Sort chain of the history table (#760): the JSON table's rule dialog over the two keys a row
 * has — the moment and the value. Loads the rows itself so the dialog previews the real order.
 */
function HistorySortBlock({
    config,
    labels,
    onChange,
}: {
    config: WidgetConfig;
    labels: Record<HistoryColumnKey, string>;
    onChange: (patch: Record<string, unknown>) => void;
}) {
    const t = useT();
    const { subscribe, connected } = useIoBroker();
    const o = config.options ?? {};
    const mode = o.historyMode === 'range' ? 'range' : 'count';
    const count = Math.min(
        HISTORY_TABLE_MAX_COUNT,
        Math.max(1, Math.round(Number(o.historyCount) || HISTORY_TABLE_DEFAULT_COUNT)),
    );
    const hideDuplicates = o.hideDuplicates === true;
    const rangeMs = historyRangeMs(
        (o.historyRange as HistoryTableRange | undefined) ?? '24h',
        (o.historyRangeCustomValue as number | undefined) ?? 24,
        (o.historyRangeCustomUnit as RangeUnit | undefined) ?? 'h',
    );
    const isTemplate = !!config.datapoint?.startsWith('{{');
    const grid = useMemo(() => historyGridOf(o), [o.historyInterval, o.historyAggregate]); // eslint-disable-line react-hooks/exhaustive-deps
    const data = useHistoryRows(
        isTemplate ? undefined : config.datapoint,
        o.historyInstance as string | undefined,
        mode,
        hideDuplicates ? Math.min(HISTORY_TABLE_RANGE_CAP, count * 5) : count,
        rangeMs,
        connected,
        subscribe,
        grid,
    );
    // Rows in the widget's base order, before any rule — the dialog applies the rules itself.
    const rows = useMemo(
        () =>
            historySortRows(
                historyTableRows(data.rows, { hideDuplicates, mode, count, newestFirst: o.sortOrder !== 'asc' }),
            ),
        [data.rows, hideDuplicates, mode, count, o.sortOrder],
    );
    const split = o.timeColumns === 'split';
    const valueCol = historyColumns(o.columns as HistoryColumnDef[] | undefined, split).find((c) => c.key === 'value');
    const dateFormat = (o.dateFormat as string | undefined) || HISTORY_TABLE_DEFAULT_DATE;
    const timeFormat =
        (o.timeFormat as string | undefined) || (grid ? HISTORY_TABLE_GRID_TIME : HISTORY_TABLE_DEFAULT_TIME);
    // The moment is one key even with split columns, so it carries both titles.
    const timeLabel = split ? `${labels.date} / ${labels.time}` : labels.time;
    return (
        <JsonTableSortSection
            rules={(o.sortRules as JsonSortRule[] | undefined) ?? []}
            onChange={(next) => onChange({ sortRules: next })}
            keys={HISTORY_SORT_KEYS}
            colDefs={[
                {
                    key: 'time',
                    label: timeLabel,
                    valueTimeFormat: 'custom',
                    valueTimePattern: `${dateFormat} ${timeFormat}`,
                },
                {
                    key: 'value',
                    label: labels.value,
                    decimals: o.decimals as number | undefined,
                    valueFactor: o.valueFactor as number | undefined,
                    valueOffset: o.valueOffset as number | undefined,
                    valueTimeFormat: valueCol?.valueTimeFormat,
                    valueTimePattern: valueCol?.valueTimePattern,
                },
            ]}
            rows={rows}
            storageKey="aura-historytable-sort-modal"
            emptyRowsText={t('historytable.cfg.sortNoRows')}
        />
    );
}

export function HistoryTableConfig({ config, onConfigChange }: Props) {
    const t = useT();
    const o = config.options ?? {};
    const set = (patch: Record<string, unknown>) => onConfigChange({ ...config, options: { ...o, ...patch } });
    const dp = config.datapoint;
    const isTemplate = !!dp?.startsWith('{{');

    const [adapters, setAdapters] = useState<DetectedAdapter[]>([]);
    const [checking, setChecking] = useState(false);
    useEffect(() => {
        if (!dp || isTemplate) {
            setAdapters([]);
            return;
        }
        setChecking(true);
        getObjectDirect(dp)
            .then((obj) => {
                const custom = obj?.common?.custom;
                const detected = custom ? detectHistoryAdapters(custom as Record<string, { enabled?: boolean }>) : [];
                setAdapters(detected);
                setChecking(false);
                if (detected.length === 1 && !o.historyInstance) set({ historyInstance: detected[0].instance });
            })
            .catch(() => setChecking(false));
    }, [dp]); // eslint-disable-line react-hooks/exhaustive-deps

    const instance = o.historyInstance as string | undefined;
    const mode = o.historyMode === 'range' ? 'range' : 'count';
    const range = (o.historyRange as HistoryTableRange | undefined) ?? '24h';
    const customVal = (o.historyRangeCustomValue as number | undefined) ?? 24;
    const customUnit = (o.historyRangeCustomUnit as RangeUnit | undefined) ?? 'h';
    const split = o.timeColumns === 'split';
    const grid = historyGridOf(o);
    const labels: Record<HistoryColumnKey, string> = {
        date: (o.colDateLabel as string | undefined) || t('historytable.col.date'),
        time: (o.colTimeLabel as string | undefined) || t(split ? 'historytable.col.time' : 'historytable.col.when'),
        value: (o.colValueLabel as string | undefined) || t('historytable.col.value'),
    };

    return (
        <>
            <div className="h-px my-1" style={{ background: 'var(--app-border)' }} />
            <p className="text-[11px] font-semibold mb-1.5" style={labelSty}>
                {t('wf.history.title')}
            </p>

            {/* Adapter */}
            {isTemplate ? (
                <div>
                    <label className={labelCls} style={labelSty}>
                        {t('wf.history.instance')}
                    </label>
                    <input
                        type="text"
                        placeholder="history.0"
                        value={instance ?? ''}
                        onChange={(e) => set({ historyInstance: e.target.value || undefined })}
                        className={fieldCls}
                        style={fieldSty}
                    />
                </div>
            ) : checking ? (
                <p className="text-[11px]" style={labelSty}>
                    {t('wf.history.checking')}
                </p>
            ) : adapters.length === 0 ? (
                <p className="text-[11px]" style={labelSty}>
                    {dp ? t('historytable.noAdapter') : t('historytable.noDatapoint')}
                </p>
            ) : (
                <div>
                    <label className={labelCls} style={labelSty}>
                        {t('wf.history.instance')}
                    </label>
                    <select
                        value={instance ?? ''}
                        onChange={(e) => set({ historyInstance: e.target.value || undefined })}
                        className={fieldCls}
                        style={fieldSty}
                    >
                        <option value="">{t('historytable.cfg.autoInstance')}</option>
                        {adapters.map((a) => (
                            <option key={a.instance} value={a.instance}>
                                {a.label}
                            </option>
                        ))}
                    </select>
                </div>
            )}

            {/* Welche Zeilen */}
            <div>
                <label className={labelCls} style={labelSty}>
                    {t('historytable.cfg.mode')}
                </label>
                <Segmented
                    value={mode}
                    options={[
                        { id: 'count', label: t('historytable.cfg.modeCount') },
                        { id: 'range', label: t('historytable.cfg.modeRange') },
                    ]}
                    onChange={(v) => set({ historyMode: v })}
                />
            </div>
            {mode === 'count' ? (
                <div>
                    <label className={labelCls} style={labelSty}>
                        {t(grid ? 'historytable.cfg.countGrid' : 'historytable.cfg.count')}
                    </label>
                    <input
                        type="number"
                        min={1}
                        max={HISTORY_TABLE_MAX_COUNT}
                        value={(o.historyCount as number | undefined) ?? HISTORY_TABLE_DEFAULT_COUNT}
                        onChange={(e) =>
                            set({
                                historyCount: Math.min(
                                    HISTORY_TABLE_MAX_COUNT,
                                    Math.max(1, Math.round(Number(e.target.value)) || 1),
                                ),
                            })
                        }
                        className={fieldCls}
                        style={fieldSty}
                    />
                </div>
            ) : (
                <div>
                    <label className={labelCls} style={labelSty}>
                        {t('wf.history.timeRange')}
                    </label>
                    <Segmented
                        value={range}
                        options={HISTORY_TABLE_RANGES.map((r) => ({ id: r, label: RANGE_LABELS[r] }))}
                        onChange={(v) => set({ historyRange: v })}
                    />
                    {range === 'custom' && (
                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                            <input
                                type="number"
                                min={1}
                                max={999}
                                value={customVal}
                                onChange={(e) =>
                                    set({ historyRangeCustomValue: Math.max(1, Number(e.target.value) || 1) })
                                }
                                className="w-16 text-xs rounded-md px-2 py-1 text-center focus:outline-none"
                                style={fieldSty}
                            />
                            {RANGE_UNITS.map((u) => (
                                <button
                                    key={u}
                                    type="button"
                                    onClick={() => set({ historyRangeCustomUnit: u })}
                                    className="text-[11px] px-2 py-1 rounded-md transition-opacity hover:opacity-80"
                                    style={{
                                        background: customUnit === u ? 'var(--accent)' : 'var(--app-bg)',
                                        color: customUnit === u ? '#fff' : 'var(--text-secondary)',
                                        border: `1px solid ${customUnit === u ? 'var(--accent)' : 'var(--app-border)'}`,
                                    }}
                                >
                                    {t(`rangeChips.unit.${u}`)}
                                </button>
                            ))}
                        </div>
                    )}
                    {!grid && (
                        <p className="text-[10px] mt-1" style={hintSty}>
                            {t('historytable.cfg.rangeHint')}
                        </p>
                    )}
                </div>
            )}
            <div>
                <label className={labelCls} style={labelSty}>
                    {t('historytable.cfg.interval')}
                </label>
                <select
                    value={grid?.stepMs ?? 0}
                    onChange={(e) => set({ historyInterval: Number(e.target.value) || undefined })}
                    className={fieldCls}
                    style={fieldSty}
                >
                    <option value={0}>{t('historytable.cfg.intervalOff')}</option>
                    {HISTORY_GRID_STEPS.map((ms) => (
                        <option key={ms} value={ms}>
                            {ms < 3_600_000
                                ? t('historytable.cfg.stepMin', { n: ms / 60_000 })
                                : ms < 86_400_000
                                  ? t('historytable.cfg.stepHour', { n: ms / 3_600_000 })
                                  : t('historytable.cfg.stepDay')}
                        </option>
                    ))}
                </select>
                <p className="text-[10px] mt-1" style={hintSty}>
                    {t('historytable.cfg.intervalHint')}
                </p>
            </div>
            {grid && (
                <div>
                    <label className={labelCls} style={labelSty}>
                        {t('historytable.cfg.aggregate')}
                    </label>
                    <Segmented
                        value={grid.aggregate}
                        options={HISTORY_GRID_AGGREGATES.map((a) => ({ id: a, label: t(`historytable.cfg.agg.${a}`) }))}
                        onChange={(v) => set({ historyAggregate: v })}
                    />
                    <p className="text-[10px] mt-1" style={hintSty}>
                        {t(
                            grid.aggregate === 'last'
                                ? 'historytable.cfg.aggLastHint'
                                : 'historytable.cfg.aggNumberHint',
                        )}
                    </p>
                </div>
            )}
            <Check
                checked={o.hideDuplicates === true}
                onChange={(v) => set({ hideDuplicates: v })}
                label={t('historytable.cfg.hideDuplicates')}
            />

            {/* Spalten */}
            <div className="h-px my-1" style={{ background: 'var(--app-border)' }} />
            <div>
                <label className={labelCls} style={labelSty}>
                    {t('historytable.cfg.timeColumns')}
                </label>
                <Segmented
                    value={split ? 'split' : 'combined'}
                    options={[
                        { id: 'combined', label: t('historytable.cfg.combined') },
                        { id: 'split', label: t('historytable.cfg.split') },
                    ]}
                    onChange={(v) => set({ timeColumns: v })}
                />
            </div>
            <div className="flex gap-2">
                <div className="flex-1 min-w-0">
                    <label className={labelCls} style={labelSty}>
                        {t('historytable.cfg.dateFormat')}
                    </label>
                    <input
                        type="text"
                        value={(o.dateFormat as string | undefined) ?? ''}
                        placeholder={HISTORY_TABLE_DEFAULT_DATE}
                        onChange={(e) => set({ dateFormat: e.target.value || undefined })}
                        className={fieldCls}
                        style={fieldSty}
                    />
                </div>
                <div className="flex-1 min-w-0">
                    <label className={labelCls} style={labelSty}>
                        {t('historytable.cfg.timeFormat')}
                    </label>
                    <input
                        type="text"
                        value={(o.timeFormat as string | undefined) ?? ''}
                        placeholder={grid ? HISTORY_TABLE_GRID_TIME : HISTORY_TABLE_DEFAULT_TIME}
                        onChange={(e) => set({ timeFormat: e.target.value || undefined })}
                        className={fieldCls}
                        style={fieldSty}
                    />
                </div>
            </div>
            <p className="text-[10px] -mt-1" style={hintSty}>
                {t('historytable.cfg.formatHint')}
            </p>
            <HistoryTableColumnsSection options={o} split={split} labels={labels} onChange={set} />
            <div>
                <label className={labelCls} style={labelSty}>
                    {t('historytable.cfg.sortOrder')}
                </label>
                <Segmented
                    value={o.sortOrder === 'asc' ? 'asc' : 'desc'}
                    options={[
                        { id: 'desc', label: t('historytable.cfg.newestFirst') },
                        { id: 'asc', label: t('historytable.cfg.oldestFirst') },
                    ]}
                    onChange={(v) => set({ sortOrder: v })}
                />
            </div>
            <HistorySortBlock config={config} labels={labels} onChange={set} />
            <p className="text-[10px] -mt-1" style={hintSty}>
                {t('historytable.cfg.sortHint')}
            </p>
            <Check
                checked={o.sortable === true}
                onChange={(v) => set({ sortable: v || undefined })}
                label={t('historytable.cfg.sortable')}
            />

            {/* Werte */}
            <div className="h-px my-1" style={{ background: 'var(--app-border)' }} />
            <ValueFormatRow
                unit={o.unit as string | undefined}
                unitPlaceholder="z.B. °C, %, W"
                onUnitChange={(v) => set({ unit: v })}
                decimals={o.decimals as number | undefined}
                numberFormat={o.numberFormat as NumberFormat | undefined}
                onChange={(patch) => set(patch)}
            />
            <div>
                <label className={labelCls} style={labelSty}>
                    {t('historytable.cfg.valueLabels')}
                </label>
                <input
                    type="text"
                    value={(o.valueLabels as string | undefined) ?? ''}
                    placeholder="0=Aus; 1=An"
                    onChange={(e) => set({ valueLabels: e.target.value || undefined })}
                    className={fieldCls}
                    style={fieldSty}
                />
                <p className="text-[10px] mt-1" style={hintSty}>
                    {t('historytable.cfg.valueLabelsHint')}
                </p>
            </div>

            {/* Darstellung */}
            <div className="h-px my-1" style={{ background: 'var(--app-border)' }} />
            <div>
                <label className={labelCls} style={labelSty}>
                    {t('historytable.cfg.fontSize')}
                </label>
                <input
                    type="number"
                    min={8}
                    max={32}
                    value={(o.fontSize as number | undefined) ?? 12}
                    onChange={(e) => set({ fontSize: Math.min(32, Math.max(8, Number(e.target.value) || 12)) })}
                    className={fieldCls}
                    style={fieldSty}
                />
            </div>
            <Check
                checked={o.showHeader !== false}
                onChange={(v) => set({ showHeader: v })}
                label={t('historytable.cfg.showHeader')}
            />
            <Check
                checked={o.striped !== false}
                onChange={(v) => set({ striped: v })}
                label={t('historytable.cfg.striped')}
            />
        </>
    );
}
