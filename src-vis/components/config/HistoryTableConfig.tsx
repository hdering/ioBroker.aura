/**
 * HistoryTableConfig — config panel of the history table (#760): which adapter, which rows
 * (last N values or a time window), how the time columns read and how values are formatted.
 */
import { useEffect, useState } from 'react';
import type { WidgetConfig } from '../../types';
import { useT } from '../../i18n';
import { getObjectDirect } from '../../hooks/useIoBroker';
import { detectHistoryAdapters, RANGE_LABELS, type DetectedAdapter } from '../../hooks/useChartHistory';
import { HISTORY_TABLE_MAX_COUNT } from '../../hooks/useHistoryRows';
import {
    HISTORY_TABLE_DEFAULT_COUNT,
    HISTORY_TABLE_DEFAULT_DATE,
    HISTORY_TABLE_DEFAULT_TIME,
    HISTORY_TABLE_RANGES,
    type HistoryTableRange,
} from '../widgets/HistoryTableWidget';
import { RANGE_UNITS, type RangeUnit } from '../../utils/rangeChips';
import type { NumberFormat } from '../../utils/formatValue';
import { ValueFormatRow } from './ValueFormatRow';

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
                        {t('historytable.cfg.count')}
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
                    <p className="text-[10px] mt-1" style={hintSty}>
                        {t('historytable.cfg.rangeHint')}
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
                        placeholder={HISTORY_TABLE_DEFAULT_TIME}
                        onChange={(e) => set({ timeFormat: e.target.value || undefined })}
                        className={fieldCls}
                        style={fieldSty}
                    />
                </div>
            </div>
            <p className="text-[10px] -mt-1" style={hintSty}>
                {t('historytable.cfg.formatHint')}
            </p>
            <div className="flex gap-2">
                {(split
                    ? [
                          ['colDateLabel', 'historytable.col.date'],
                          ['colTimeLabel', 'historytable.col.time'],
                          ['colValueLabel', 'historytable.col.value'],
                      ]
                    : [
                          ['colTimeLabel', 'historytable.col.when'],
                          ['colValueLabel', 'historytable.col.value'],
                      ]
                ).map(([key, fallback]) => (
                    <div key={key} className="flex-1 min-w-0">
                        <label className={labelCls} style={labelSty}>
                            {t('historytable.cfg.header')}
                        </label>
                        <input
                            type="text"
                            value={(o[key] as string | undefined) ?? ''}
                            placeholder={t(fallback as Parameters<typeof t>[0])}
                            onChange={(e) => set({ [key]: e.target.value || undefined })}
                            className={fieldCls}
                            style={fieldSty}
                        />
                    </div>
                ))}
            </div>
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
