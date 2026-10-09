import { useCallback, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, History, Loader } from 'lucide-react';
import { useIoBroker, type HistoryEntry } from '../../hooks/useIoBroker';
import { useContentAutoHeight } from '../../hooks/useContentAutoHeight';
import {
    HISTORY_TABLE_MAX_COUNT,
    HISTORY_TABLE_RANGE_CAP,
    useHistoryRows,
    type HistoryTableMode,
} from '../../hooks/useHistoryRows';
import { useGlobalSettingsStore } from '../../store/globalSettingsStore';
import { useT } from '../../i18n';
import type { WidgetProps } from '../../types';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { formatNum, type NumberFormat } from '../../utils/formatValue';
import { applyValueTransform } from '../../utils/valueTransform';
import { applyTimeFormat, formatTimeDisplay, hasTimeDisplay, TIME_DASH } from '../../utils/timeDisplay';
import { cellText } from '../../utils/jsonTableFormat';
import { sortJsonRows, usableJsonSortRules, type JsonSortRule } from '../../utils/jsonTableSort';
import { parseCommonStates, parseValueLabels } from '../../utils/chartAxis';
import { unitSpanMs, type RangeUnit } from '../../utils/rangeChips';
import { HeaderGroup, HeaderSlotsInline, HeaderSlotsRow2, TitleRow } from '../layout/HeaderSlotsContext';

export type HistoryTableRange = '1h' | '6h' | '24h' | '7d' | '30d' | 'custom';
export const HISTORY_TABLE_RANGES: HistoryTableRange[] = ['1h', '6h', '24h', '7d', '30d', 'custom'];
const RANGE_MS: Record<Exclude<HistoryTableRange, 'custom'>, number> = {
    '1h': 3_600_000,
    '6h': 21_600_000,
    '24h': 86_400_000,
    '7d': 604_800_000,
    '30d': 2_592_000_000,
};

/** Length of the "range" window in ms. Calendar months/years shift with "now". */
export function historyRangeMs(range: HistoryTableRange, customVal: number, customUnit: RangeUnit): number {
    return range === 'custom' ? unitSpanMs(customVal, customUnit) : (RANGE_MS[range] ?? RANGE_MS['24h']);
}

export const HISTORY_TABLE_DEFAULT_DATE = 'dd.MM.yyyy';
export const HISTORY_TABLE_DEFAULT_TIME = 'HH:mm:ss';
export const HISTORY_TABLE_DEFAULT_COUNT = 20;

/** Column ids: the date column only exists with timeColumns "split", "time" is the combined one otherwise. */
export type HistoryColumnKey = 'date' | 'time' | 'value';

/** Per-column look of the history table (options.columns) — the JSON table's column options minus
 *  what only a JSON cell has (image, HTML, icons). The titles stay in colDateLabel/colTimeLabel/colValueLabel. */
export interface HistoryColumnDef {
    /** Which column: 'date' (only with timeColumns "split"), 'time' (date + time, or the time with "split"), 'value'. */
    key: HistoryColumnKey;
    hidden?: boolean; // hide the column; it can still be sorted by
    /** Fixed column width in px. Unset → auto (the value column takes the rest). */
    width?: number;
    /** Allow the cell text to wrap onto multiple lines (default: one line). */
    wrap?: boolean;
    /** Horizontal alignment of header + cells. Default 'left', the value column 'right'. */
    align?: 'left' | 'center' | 'right';
    /** Background colour of the column's data cells (hex, rgba(), CSS var or light/dark pair). Wins over the zebra stripe. */
    cellBg?: string;
    /** Text colour of the column's data cells. Unset = theme colour (secondary for the time columns). */
    cellColor?: string;
    prefix?: string; // text before every non-empty cell value
    suffix?: string; // text after every non-empty cell value (after the unit)
    /** Value column only: render the value as time/date (see TIME_DISPLAY_PRESETS) — for datapoints that store a timestamp. */
    valueTimeFormat?: string;
    valueTimePattern?: string; // token pattern, only used when valueTimeFormat is 'custom'
    order?: number; // lower = further left
}

/** Keys a sort rule can read: the moment ("time", also behind the date column) and the value. */
export const HISTORY_SORT_KEYS = ['time', 'value'];

/** The columns the current time layout has, in their configured order, hidden ones included. */
export function historyColumns(columns: HistoryColumnDef[] | undefined, split: boolean): HistoryColumnDef[] {
    const keys: HistoryColumnKey[] = split ? ['date', 'time', 'value'] : ['time', 'value'];
    const defs = new Map((columns ?? []).map((c) => [c.key, c]));
    return keys.map((key, i) => ({ order: i, ...defs.get(key), key })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/**
 * Rows in display order: repeats folded, the last N cut off, then newest or oldest first —
 * that order stays as the tie-breaker behind the sort rules (the sort is stable).
 */
export function historyTableRows(
    list: HistoryEntry[],
    opts: { hideDuplicates: boolean; mode: HistoryTableMode; count: number; newestFirst: boolean },
    rules: JsonSortRule[] = [],
): HistoryEntry[] {
    let out = opts.hideDuplicates ? dropRepeats(list) : list;
    if (opts.mode === 'count') out = out.slice(-opts.count);
    out = opts.newestFirst ? [...out].reverse() : out;
    if (!rules.length) return out;
    return sortJsonRows(historySortRows(out), rules).map((r) => r.entry);
}

/** Rows as the sort chain reads them: the moment and the raw value under the rule's column keys. */
export function historySortRows(rows: HistoryEntry[]) {
    return rows.map((entry) => ({ time: entry.ts as unknown, value: entry.val as unknown, entry }));
}

/** Sample rows for a {{placeholder}} datapoint in the popup editor, which has no history to load. */
function previewRows(now: number): HistoryEntry[] {
    return Array.from({ length: 8 }, (_, i) => ({
        ts: now - (8 - i) * 1_800_000,
        val: Math.round((20 + Math.sin(i) * 2) * 10) / 10,
    }));
}

/** Keeps the first row of every run of equal values — the moment the value changed to it. */
function dropRepeats(rows: HistoryEntry[]): HistoryEntry[] {
    const out: HistoryEntry[] = [];
    for (const r of rows) if (!out.length || out[out.length - 1].val !== r.val) out.push(r);
    return out;
}

export function HistoryTableWidget({ config, editMode }: WidgetProps) {
    const { subscribe, connected } = useIoBroker();
    const t = useT();
    const o = config.options ?? {};
    const showTitle = o.showTitle !== false;
    const showIcon = o.showIcon !== false;
    const iconSize = (o.iconSize as number) || 20;
    const titleAlign = (o.titleAlign as string) ?? 'left';
    const WidgetIcon = getWidgetIcon(o.icon as string | undefined, History);

    const mode: HistoryTableMode = o.historyMode === 'range' ? 'range' : 'count';
    const count = Math.min(
        HISTORY_TABLE_MAX_COUNT,
        Math.max(1, Math.round(Number(o.historyCount) || HISTORY_TABLE_DEFAULT_COUNT)),
    );
    const range = (o.historyRange as HistoryTableRange | undefined) ?? '24h';
    const customVal = (o.historyRangeCustomValue as number | undefined) ?? 24;
    const customUnit = (o.historyRangeCustomUnit as RangeUnit | undefined) ?? 'h';
    // Calendar months/years shift with "now" — computed once per setting so the request stays stable.
    const rangeMs = useMemo(() => historyRangeMs(range, customVal, customUnit), [range, customVal, customUnit]);
    const hideDuplicates = o.hideDuplicates === true;
    // Repeats fold away after loading, so the "last N" fetch asks for more to still fill N rows.
    const fetchCount = hideDuplicates ? Math.min(HISTORY_TABLE_RANGE_CAP, count * 5) : count;

    const split = o.timeColumns === 'split';
    const dateFormat = (o.dateFormat as string | undefined) || HISTORY_TABLE_DEFAULT_DATE;
    const timeFormat = (o.timeFormat as string | undefined) || HISTORY_TABLE_DEFAULT_TIME;
    const newestFirst = o.sortOrder !== 'asc';
    const sortable = o.sortable === true;
    const showHeader = o.showHeader !== false;
    const striped = o.striped !== false;
    const fs = (o.fontSize as number) ?? 12;

    const { defaultDecimals, numberFormat: globalNumFmt } = useGlobalSettingsStore();
    const decimals = o.decimals as number | undefined;
    const numFmt = (o.numberFormat as NumberFormat | undefined) ?? globalNumFmt;
    const unit = (o.unit as string | undefined)?.trim();
    const valueFactor = o.valueFactor as number | undefined;
    const valueOffset = o.valueOffset as number | undefined;

    const isTemplate = !!config.datapoint?.startsWith('{{');
    const data = useHistoryRows(
        config.datapoint,
        o.historyInstance as string | undefined,
        mode,
        fetchCount,
        rangeMs,
        connected,
        subscribe,
    );

    const { fit: autoHeight, measureRef } = useContentAutoHeight(config);
    const rootRef = useCallback((el: HTMLDivElement | null) => measureRef(el), [measureRef]);

    // The clicked header; null falls back to the configured rule chain (same cycle as the JSON table).
    const [sortOverride, setSortOverride] = useState<JsonSortRule | null>(null);
    const sortRules = useMemo(
        () => usableJsonSortRules(o.sortRules as JsonSortRule[] | undefined, HISTORY_SORT_KEYS),
        [o.sortRules],
    );
    const override = sortable && sortOverride ? sortOverride : null;
    const activeRules = useMemo(
        () => (override ? [override, ...sortRules.filter((r) => r.column !== override.column)] : sortRules),
        [override, sortRules],
    );
    /** The rule the header arrow shows — the one that decides first. */
    const sort = activeRules[0] ?? null;
    // Cycle a header through asc → desc → configured order, like the JSON table.
    const toggleSort = (key: string) => {
        const lead = sortRules[0];
        const own = sortRules.find((r) => r.column === key);
        const order: 'asc' | 'desc' | null =
            !sort || sort.column !== key
                ? 'asc'
                : (sort.order ?? 'asc') === 'asc'
                  ? 'desc'
                  : lead?.column === key
                    ? 'asc'
                    : null;
        if (order === null || (lead?.column === key && (lead.order ?? 'asc') === order)) setSortOverride(null);
        else setSortOverride({ column: key, order, mode: own?.mode, empty: own?.empty });
    };

    const isPreview = editMode && isTemplate;
    const rows = useMemo(
        () =>
            historyTableRows(
                isPreview ? previewRows(Date.now()) : data.rows,
                { hideDuplicates, mode, count, newestFirst },
                activeRules,
            ),
        [isPreview, data.rows, hideDuplicates, mode, count, newestFirst, activeRules],
    );

    // Own texts first, then the ones the datapoint declares in common.states.
    const labels = useMemo(() => {
        const own = parseValueLabels(o.valueLabels as string | undefined);
        return own.size > 0 ? own : parseCommonStates(data.states);
    }, [o.valueLabels, data.states]);
    const stringStates = useMemo(() => {
        const s = data.states;
        return s && typeof s === 'object' && !Array.isArray(s) ? (s as Record<string, unknown>) : null;
    }, [data.states]);

    const formatValue = (val: HistoryEntry['val'], col: HistoryColumnDef): string => {
        if (val === null || val === undefined) return cellText(val);
        if (typeof val === 'boolean') return labels.get(val ? 1 : 0) ?? cellText(val);
        if (typeof val === 'number') {
            const label = labels.get(val);
            if (label) return label;
            const v = applyValueTransform(val, valueFactor, valueOffset) as number;
            // A datapoint that stores a moment (last run, last motion …) reads as a date, not as ms.
            if (hasTimeDisplay(col.valueTimeFormat)) {
                return formatTimeDisplay(v, col.valueTimeFormat, t, col.valueTimePattern) ?? TIME_DASH;
            }
            // Unset decimals: whole numbers stay whole, everything else follows the global default.
            const d = decimals ?? (Number.isInteger(v) ? 0 : defaultDecimals);
            return `${formatNum(v, d, numFmt)}${unit ? ` ${unit}` : ''}`;
        }
        const text = stringStates?.[val];
        if (typeof text === 'string' || typeof text === 'number') return String(text);
        if (hasTimeDisplay(col.valueTimeFormat)) {
            return formatTimeDisplay(val, col.valueTimeFormat, t, col.valueTimePattern) ?? TIME_DASH;
        }
        return String(val);
    };

    const headerLabel: Record<HistoryColumnKey, string> = {
        date: (o.colDateLabel as string | undefined) || t('historytable.col.date'),
        time: (o.colTimeLabel as string | undefined) || t(split ? 'historytable.col.time' : 'historytable.col.when'),
        value: (o.colValueLabel as string | undefined) || t('historytable.col.value'),
    };
    const columns = historyColumns(o.columns as HistoryColumnDef[] | undefined, split).filter((c) => !c.hidden);
    const sortKeyOf = (key: HistoryColumnKey) => (key === 'value' ? 'value' : 'time');
    // In split mode date and time sort by the same moment — the arrow sits on the first of the two.
    const arrowKey = sort ? columns.find((c) => sortKeyOf(c.key) === sort.column)?.key : undefined;
    const alignOf = (c: HistoryColumnDef) => c.align ?? (c.key === 'value' ? 'right' : 'left');
    const hasWidth = (c: HistoryColumnDef) => !!(c.width && c.width > 0);
    // The value column takes the free width; without it the last column does.
    const fillKey = columns.some((c) => c.key === 'value') ? 'value' : columns[columns.length - 1]?.key;

    const pad = `${Math.round(fs * 0.25)}px ${Math.round(fs * 0.6)}px`;
    const cellBorder = '1px solid color-mix(in srgb, var(--app-border) 50%, transparent)';

    const title = (showTitle || showIcon) && (
        <TitleRow align={titleAlign} className="flex items-center gap-1 shrink-0 min-w-0">
            {showIcon && (
                <WidgetIcon
                    className="aura-widget-icon"
                    size={iconSize}
                    style={{ '--aura-icon-color': 'var(--text-secondary)', flexShrink: 0 }}
                />
            )}
            {showTitle && (
                <p
                    className="aura-widget-title text-xs truncate flex-1 min-w-0"
                    style={{
                        '--aura-title-color': 'var(--text-secondary)',
                        textAlign: titleAlign as React.CSSProperties['textAlign'],
                    }}
                >
                    {config.title}
                </p>
            )}
            {data.loading && !isPreview && (
                <Loader size={12} className="animate-spin shrink-0" style={{ color: 'var(--text-secondary)' }} />
            )}
            <HeaderSlotsInline />
        </TitleRow>
    );

    const notice = !config.datapoint
        ? t('historytable.noDatapoint')
        : !isPreview && !isTemplate && !data.instance && !data.loading
          ? t('historytable.noAdapter')
          : null;

    return (
        <div ref={rootRef} className={`aura-widget-row flex flex-col gap-1 ${autoHeight ? '' : 'h-full'}`}>
            <HeaderGroup>
                {title}
                <HeaderSlotsRow2 />
            </HeaderGroup>
            {notice ? (
                <div
                    className="flex flex-col items-center justify-center flex-1 gap-2 py-2 text-center"
                    style={{ color: 'var(--text-secondary)' }}
                >
                    <History size={24} strokeWidth={1} />
                    <span className="text-xs opacity-60">{notice}</span>
                </div>
            ) : (
                <div className={autoHeight ? 'overflow-x-auto min-w-0' : 'flex-1 overflow-auto min-h-0 min-w-0'}>
                    {/* Same row geometry as the JSON table (`lineHeight: normal`, padding from the
                        font size) — see #678 for why the document's leading cuts rows. */}
                    <table
                        className="border-collapse"
                        style={{ fontSize: fs, lineHeight: 'normal', width: '100%', tableLayout: 'auto' }}
                    >
                        {showHeader && (
                            <thead>
                                <tr>
                                    {columns.map((col) => {
                                        const isSorted = sortable && arrowKey === col.key;
                                        return (
                                            <th
                                                key={col.key}
                                                data-col={col.key}
                                                onClick={sortable ? () => toggleSort(sortKeyOf(col.key)) : undefined}
                                                className="whitespace-nowrap sticky top-0"
                                                style={{
                                                    padding: `${Math.round(fs * 0.3)}px ${Math.round(fs * 0.6)}px`,
                                                    textAlign: alignOf(col),
                                                    width: hasWidth(col) ? col.width : undefined,
                                                    cursor: sortable ? 'pointer' : undefined,
                                                    userSelect: sortable ? 'none' : undefined,
                                                    background: 'var(--widget-bg, var(--app-surface))',
                                                    color: 'var(--text-secondary)',
                                                    fontWeight: 600,
                                                    borderBottom: '2px solid var(--app-border)',
                                                    zIndex: 1,
                                                }}
                                            >
                                                {headerLabel[col.key]}
                                                {/* Reserve the arrow slot on every sortable header so the
                                                    label doesn't shift when a sort indicator appears. */}
                                                {sortable && (
                                                    <span
                                                        style={{
                                                            display: 'inline-flex',
                                                            verticalAlign: 'middle',
                                                            marginLeft: 3,
                                                            width: Math.round(fs * 0.9),
                                                            visibility: isSorted ? 'visible' : 'hidden',
                                                        }}
                                                    >
                                                        {sort?.order === 'desc' ? (
                                                            <ArrowDown size={Math.round(fs * 0.9)} />
                                                        ) : (
                                                            <ArrowUp size={Math.round(fs * 0.9)} />
                                                        )}
                                                    </span>
                                                )}
                                            </th>
                                        );
                                    })}
                                </tr>
                            </thead>
                        )}
                        <tbody>
                            {rows.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={columns.length}
                                        className="text-center py-4"
                                        style={{ color: 'var(--text-secondary)', fontSize: fs - 1 }}
                                    >
                                        {data.loading ? t('historytable.loading') : t('historytable.empty')}
                                    </td>
                                </tr>
                            ) : (
                                rows.map((r, ri) => {
                                    const d = new Date(r.ts);
                                    const cellOf = (col: HistoryColumnDef): string => {
                                        if (col.key === 'value') return formatValue(r.val, col);
                                        if (col.key === 'date') return applyTimeFormat(d, dateFormat, t);
                                        return applyTimeFormat(
                                            d,
                                            split ? timeFormat : `${dateFormat} ${timeFormat}`,
                                            t,
                                        );
                                    };
                                    return (
                                        <tr
                                            key={r.ts}
                                            style={{
                                                background:
                                                    striped && ri % 2 === 1
                                                        ? 'color-mix(in srgb, var(--app-bg) 60%, transparent)'
                                                        : 'transparent',
                                            }}
                                        >
                                            {columns.map((col) => {
                                                const text = cellOf(col);
                                                // Prefix/suffix decorate real values only — the "–" placeholder stays bare.
                                                const hasValue =
                                                    col.key !== 'value' || (r.val !== null && r.val !== undefined);
                                                return (
                                                    <td
                                                        key={col.key}
                                                        data-col={col.key}
                                                        style={{
                                                            padding: pad,
                                                            color:
                                                                col.cellColor ||
                                                                (col.key === 'value'
                                                                    ? 'var(--text-primary)'
                                                                    : 'var(--text-secondary)'),
                                                            background: col.cellBg || undefined,
                                                            borderBottom: cellBorder,
                                                            textAlign: alignOf(col),
                                                            whiteSpace: col.wrap ? 'normal' : 'nowrap',
                                                            overflowWrap: col.wrap ? 'anywhere' : undefined,
                                                            fontVariantNumeric: 'tabular-nums',
                                                            width: hasWidth(col)
                                                                ? col.width
                                                                : col.key === fillKey
                                                                  ? '100%'
                                                                  : undefined,
                                                        }}
                                                    >
                                                        {hasValue && (col.prefix || col.suffix)
                                                            ? `${col.prefix ?? ''}${text}${col.suffix ?? ''}`
                                                            : text}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            )}
            {data.truncated && mode === 'range' && (
                <p className="shrink-0 text-right" style={{ fontSize: fs - 2, color: 'var(--text-secondary)' }}>
                    {t('historytable.truncated', { n: HISTORY_TABLE_RANGE_CAP })}
                </p>
            )}
        </div>
    );
}
