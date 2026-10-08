import { useCallback, useMemo } from 'react';
import { History, Loader } from 'lucide-react';
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
import { applyTimeFormat } from '../../utils/timeDisplay';
import { cellText } from '../../utils/jsonTableFormat';
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

export const HISTORY_TABLE_DEFAULT_DATE = 'dd.MM.yyyy';
export const HISTORY_TABLE_DEFAULT_TIME = 'HH:mm:ss';
export const HISTORY_TABLE_DEFAULT_COUNT = 20;

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
    const rangeMs = useMemo(
        () => (range === 'custom' ? unitSpanMs(customVal, customUnit) : (RANGE_MS[range] ?? RANGE_MS['24h'])),
        [range, customVal, customUnit],
    );
    const hideDuplicates = o.hideDuplicates === true;
    // Repeats fold away after loading, so the "last N" fetch asks for more to still fill N rows.
    const fetchCount = hideDuplicates ? Math.min(HISTORY_TABLE_RANGE_CAP, count * 5) : count;

    const split = o.timeColumns === 'split';
    const dateFormat = (o.dateFormat as string | undefined) || HISTORY_TABLE_DEFAULT_DATE;
    const timeFormat = (o.timeFormat as string | undefined) || HISTORY_TABLE_DEFAULT_TIME;
    const newestFirst = o.sortOrder !== 'asc';
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

    const isPreview = editMode && isTemplate;
    const rows = useMemo(() => {
        let list = isPreview ? previewRows(Date.now()) : data.rows;
        if (hideDuplicates) list = dropRepeats(list);
        if (mode === 'count') list = list.slice(-count);
        return newestFirst ? [...list].reverse() : list;
    }, [isPreview, data.rows, hideDuplicates, mode, count, newestFirst]);

    // Own texts first, then the ones the datapoint declares in common.states.
    const labels = useMemo(() => {
        const own = parseValueLabels(o.valueLabels as string | undefined);
        return own.size > 0 ? own : parseCommonStates(data.states);
    }, [o.valueLabels, data.states]);
    const stringStates = useMemo(() => {
        const s = data.states;
        return s && typeof s === 'object' && !Array.isArray(s) ? (s as Record<string, unknown>) : null;
    }, [data.states]);

    const formatValue = (val: HistoryEntry['val']): string => {
        if (val === null || val === undefined) return cellText(val);
        if (typeof val === 'boolean') return labels.get(val ? 1 : 0) ?? cellText(val);
        if (typeof val === 'number') {
            const label = labels.get(val);
            if (label) return label;
            const v = applyValueTransform(val, valueFactor, valueOffset) as number;
            // Unset decimals: whole numbers stay whole, everything else follows the global default.
            const d = decimals ?? (Number.isInteger(v) ? 0 : defaultDecimals);
            return `${formatNum(v, d, numFmt)}${unit ? ` ${unit}` : ''}`;
        }
        const text = stringStates?.[val];
        return typeof text === 'string' || typeof text === 'number' ? String(text) : String(val);
    };

    const colTime =
        (o.colTimeLabel as string | undefined) || t(split ? 'historytable.col.time' : 'historytable.col.when');
    const colDate = (o.colDateLabel as string | undefined) || t('historytable.col.date');
    const colValue = (o.colValueLabel as string | undefined) || t('historytable.col.value');
    const columns = split ? [colDate, colTime, colValue] : [colTime, colValue];

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
                                    {columns.map((label, ci) => (
                                        <th
                                            key={ci}
                                            className="whitespace-nowrap sticky top-0"
                                            style={{
                                                padding: `${Math.round(fs * 0.3)}px ${Math.round(fs * 0.6)}px`,
                                                textAlign: ci === columns.length - 1 ? 'right' : 'left',
                                                background: 'var(--widget-bg, var(--app-surface))',
                                                color: 'var(--text-secondary)',
                                                fontWeight: 600,
                                                borderBottom: '2px solid var(--app-border)',
                                                zIndex: 1,
                                            }}
                                        >
                                            {label}
                                        </th>
                                    ))}
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
                                    const timeCells = split
                                        ? [applyTimeFormat(d, dateFormat, t), applyTimeFormat(d, timeFormat, t)]
                                        : [applyTimeFormat(d, `${dateFormat} ${timeFormat}`, t)];
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
                                            {timeCells.map((text, ci) => (
                                                <td
                                                    key={ci}
                                                    style={{
                                                        padding: pad,
                                                        color: 'var(--text-secondary)',
                                                        borderBottom: cellBorder,
                                                        whiteSpace: 'nowrap',
                                                        fontVariantNumeric: 'tabular-nums',
                                                    }}
                                                >
                                                    {text}
                                                </td>
                                            ))}
                                            <td
                                                style={{
                                                    padding: pad,
                                                    color: 'var(--text-primary)',
                                                    borderBottom: cellBorder,
                                                    textAlign: 'right',
                                                    whiteSpace: 'nowrap',
                                                    fontVariantNumeric: 'tabular-nums',
                                                    width: '100%',
                                                }}
                                            >
                                                {formatValue(r.val)}
                                            </td>
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
