import { useState } from 'react';
import { Database, Plus, Trash2 } from 'lucide-react';
import { useT } from '../../../i18n';
import { ColorPicker } from '../../common/ColorPicker';
import { DatapointPicker } from '../DatapointPicker';
import { Unavailable } from '../Unavailable';
import { DEFAULT_REF_LINE_COLOR, type EChartRefLine } from '../../../utils/chartRefLines';
import { inputCls, inputStyle } from './chartShared';

const LINE_TYPES = ['dashed', 'dotted', 'solid'] as const;

const newId = () => `rl-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** A typed number, or undefined for an empty / unreadable field. */
const num = (raw: string): number | undefined => {
    const v = Number(raw.replace(',', '.'));
    return raw.trim() === '' || !Number.isFinite(v) ? undefined : v;
};

/**
 * "Linien" tab of the chart's "Datenpunkte verwalten" dialog (issue #959): horizontal reference
 * lines at a fixed value or a datapoint's value, optionally a band up to a second value.
 */
export function ChartRefLinesPanel({
    lines,
    isComparison,
    hasRightAxis,
    onChange,
}: {
    lines: EChartRefLine[];
    isComparison: boolean;
    /** Some series sits on the right axis — without one a line there falls back to the left. */
    hasRightAxis: boolean;
    onChange: (lines: EChartRefLine[]) => void;
}) {
    const t = useT();
    // Which datapoint field the picker fills: line id + key.
    const [picking, setPicking] = useState<{ id: string; key: 'valueDp' | 'valueToDp' } | null>(null);
    const update = (id: string, patch: Partial<EChartRefLine>) =>
        onChange(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    const pickingLine = picking ? lines.find((l) => l.id === picking.id) : undefined;

    return (
        <Unavailable reason={isComparison ? t('echart.refUnavailComparison') : undefined}>
            <div className="flex flex-col gap-3 max-w-[620px]" data-testid="echart-ref-lines">
                <p className="text-[10px] leading-snug" style={{ color: 'var(--text-secondary)' }}>
                    {t('echart.refHint')}
                </p>
                {lines.map((l) => (
                    <div
                        key={l.id}
                        className="rounded-lg p-2.5 flex flex-col gap-2"
                        style={{ border: '1px solid var(--app-border)', background: 'var(--app-bg)' }}
                        data-testid="echart-ref-line"
                    >
                        <div className="flex gap-2 items-end">
                            <div className="flex-1 min-w-0">
                                <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                                    {t('echart.refLabel')}
                                </label>
                                <input
                                    type="text"
                                    value={l.label ?? ''}
                                    onChange={(e) => update(l.id, { label: e.target.value || undefined })}
                                    placeholder={t('echart.refLabelPlaceholder')}
                                    className={inputCls}
                                    style={inputStyle}
                                    data-testid="echart-ref-label"
                                />
                            </div>
                            <label
                                className="flex items-center gap-1.5 text-[11px] pb-2 shrink-0 cursor-pointer"
                                style={{ color: 'var(--text-secondary)' }}
                            >
                                <input
                                    type="checkbox"
                                    checked={l.showValue === true}
                                    onChange={(e) => update(l.id, { showValue: e.target.checked || undefined })}
                                    data-testid="echart-ref-showValue"
                                />
                                {t('echart.refShowValue')}
                            </label>
                            <button
                                onClick={() => onChange(lines.filter((x) => x.id !== l.id))}
                                className="p-2 rounded-lg hover:opacity-80 shrink-0"
                                style={{ color: 'var(--accent-red, #ef4444)' }}
                                title={t('echart.refRemove')}
                                data-testid="echart-ref-remove"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>

                        {(
                            [
                                ['value', 'valueDp', t('echart.refValue')],
                                ['valueTo', 'valueToDp', t('echart.refValueTo')],
                            ] as const
                        ).map(([key, dpKey, label]) => (
                            <div key={key}>
                                <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                                    {label}
                                </label>
                                <div className="flex gap-1">
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        defaultValue={l[key] ?? ''}
                                        key={`${l.id}-${key}-${l[key] ?? ''}`}
                                        onBlur={(e) => update(l.id, { [key]: num(e.target.value) })}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                                        }}
                                        placeholder={key === 'valueTo' ? t('echart.refValueToPlaceholder') : '21'}
                                        className={`${inputCls} !w-24 shrink-0`}
                                        style={inputStyle}
                                        data-testid={`echart-ref-${key}`}
                                    />
                                    <input
                                        type="text"
                                        value={l[dpKey] ?? ''}
                                        onChange={(e) => update(l.id, { [dpKey]: e.target.value.trim() || undefined })}
                                        placeholder={t('echart.refDpPlaceholder')}
                                        className="flex-1 min-w-0 text-xs rounded-lg px-2.5 py-2 font-mono focus:outline-none"
                                        style={inputStyle}
                                        data-testid={`echart-ref-${dpKey}`}
                                    />
                                    <button
                                        onClick={() => setPicking({ id: l.id, key: dpKey })}
                                        className="px-2 rounded-lg hover:opacity-80 shrink-0"
                                        style={{
                                            background: 'var(--app-surface)',
                                            color: 'var(--text-secondary)',
                                            border: '1px solid var(--app-border)',
                                        }}
                                        title={t('echart.refPickDp')}
                                    >
                                        <Database size={13} />
                                    </button>
                                </div>
                            </div>
                        ))}

                        <div className="flex gap-2 items-end flex-wrap">
                            <div>
                                <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                                    {t('echart.yAxis')}
                                </label>
                                <div className="flex gap-1">
                                    {([0, 1] as const).map((axis) => {
                                        const active = (l.axis === 1 ? 1 : 0) === axis;
                                        return (
                                            <button
                                                key={axis}
                                                onClick={() => update(l.id, { axis: axis === 1 ? 1 : undefined })}
                                                className="text-[11px] px-3 py-1.5 rounded-md hover:opacity-80"
                                                style={{
                                                    background: active ? 'var(--accent)' : 'var(--app-surface)',
                                                    color: active ? '#fff' : 'var(--text-secondary)',
                                                    border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                                                }}
                                                data-testid={`echart-ref-axis-${axis}`}
                                            >
                                                {axis === 0 ? t('echart.yLeft') : t('echart.yRight')}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                            <div>
                                <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                                    {t('echart.color')}
                                </label>
                                <ColorPicker
                                    value={l.color ?? DEFAULT_REF_LINE_COLOR}
                                    onChange={(v) => update(l.id, { color: v })}
                                    className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent"
                                />
                            </div>
                            <div>
                                <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                                    {t('echart.refLineType')}
                                </label>
                                <select
                                    value={l.lineType ?? 'dashed'}
                                    onChange={(e) =>
                                        update(l.id, {
                                            lineType:
                                                e.target.value === 'dashed'
                                                    ? undefined
                                                    : (e.target.value as EChartRefLine['lineType']),
                                        })
                                    }
                                    className="text-xs rounded-lg px-2 py-2 focus:outline-none"
                                    style={inputStyle}
                                    data-testid="echart-ref-lineType"
                                >
                                    {LINE_TYPES.map((lt) => (
                                        <option key={lt} value={lt}>
                                            {t(`echart.refLineType.${lt}`)}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        {l.axis === 1 && !hasRightAxis && (
                            <p className="text-[10px] leading-tight" style={{ color: 'var(--text-secondary)' }}>
                                {t('echart.refRightFallback')}
                            </p>
                        )}
                    </div>
                ))}
                <button
                    onClick={() => onChange([...lines, { id: newId() }])}
                    className="flex items-center justify-center gap-1.5 text-xs py-2 rounded-lg hover:opacity-80"
                    style={{ background: 'var(--accent)', color: '#fff' }}
                    data-testid="echart-ref-add"
                >
                    <Plus size={13} />
                    {t('echart.refAdd')}
                </button>
            </div>
            {picking && (
                <DatapointPicker
                    currentValue={pickingLine?.[picking.key] ?? ''}
                    onSelect={(id) => {
                        update(picking.id, { [picking.key]: id });
                        setPicking(null);
                    }}
                    onClose={() => setPicking(null)}
                />
            )}
        </Unavailable>
    );
}
