import { useState } from 'react';
import { ChevronLeft, Plus, X } from 'lucide-react';
import { useT } from '../../i18n';
import {
    BUCKET_CODE,
    INTERVAL_CODES,
    parseBucketCode,
    parseRangeChips,
    RANGE_UNITS,
    type RangeUnit,
} from '../../utils/rangeChips';
import type { DeltaBucketSetting } from '../../hooks/useMultiSeriesData';

const btnStyle = {
    background: 'var(--app-bg)',
    color: 'var(--text-secondary)',
    border: '1px solid var(--app-border)',
};

/**
 * Editor for the frontend range chips of the chart widgets (`rangeChips`, issue #709).
 *
 * Empty list = the widget's built-in chips. "Own list" seeds it with what the widget shows today,
 * so switching over starts from the familiar set instead of from nothing.
 */
export function RangeChipsEditor({
    value,
    defaults,
    onChange,
    withInterval = false,
}: {
    value: unknown;
    /** Tokens the widget offers without a list — the seed for "own list". */
    defaults: string[];
    onChange: (next: string[] | undefined) => void;
    /** Offer a bar interval per chip (`2y/M`) — only the advanced chart has `delta` series (#1036). */
    withInterval?: boolean;
}) {
    const t = useT();
    const chips = parseRangeChips(value);
    const [num, setNum] = useState(3);
    const [unit, setUnit] = useState<RangeUnit>('M');
    const [interval, setBucketChoice] = useState<DeltaBucketSetting | ''>('');

    // Stored as normalised tokens; a caption or interval set by hand (MCP, import) survives edits.
    const tokens = Array.isArray(value) ? (value as unknown[]).filter((v): v is string => typeof v === 'string') : [];
    const tokenOf = (key: string) => tokens.find((tok) => parseRangeChips([tok])[0]?.key === key) ?? key;
    const keys = chips.map((c) => c.key);
    const toks = keys.map(tokenOf);
    const write = (next: string[]) => onChange(next.length > 0 ? next : undefined);
    const add = (token: string) => {
        const key = parseRangeChips([token])[0]?.key;
        if (key && !keys.includes(key)) write([...toks, token]);
    };
    const moveLeft = (i: number) => {
        const next = [...toks];
        [next[i - 1], next[i]] = [next[i], next[i - 1]];
        write(next);
    };
    const withBucket = (base: string) => (withInterval && interval ? `${base}/${BUCKET_CODE[interval]}` : base);

    return (
        <div className="mt-2" data-testid="range-chips-editor">
            <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                {t('rangeChips.title')}
            </label>
            {chips.length === 0 ? (
                <div className="flex items-center gap-2">
                    <span className="text-[11px] flex-1" style={{ color: 'var(--text-secondary)', opacity: 0.8 }}>
                        {t('rangeChips.builtIn')}
                    </span>
                    <button
                        type="button"
                        onClick={() => onChange(parseRangeChips(defaults).map((c) => c.key))}
                        className="text-[11px] px-2 py-1 rounded-md hover:opacity-80"
                        style={btnStyle}
                    >
                        {t('rangeChips.ownList')}
                    </button>
                </div>
            ) : (
                <>
                    <div className="flex gap-1 flex-wrap">
                        {chips.map((c, i) => (
                            <span
                                key={c.key}
                                className="inline-flex items-center gap-0.5 text-[11px] pl-1 pr-0.5 py-0.5 rounded-md"
                                style={{
                                    background: 'var(--accent)',
                                    color: '#fff',
                                }}
                            >
                                {i > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => moveLeft(i)}
                                        className="hover:opacity-70"
                                        title={t('rangeChips.moveLeft')}
                                        aria-label={t('rangeChips.moveLeft')}
                                    >
                                        <ChevronLeft size={11} />
                                    </button>
                                )}
                                <span className="px-0.5">
                                    {c.label}
                                    {withInterval && c.bucket && (
                                        <span style={{ opacity: 0.75 }}> · {t(`echart.interval.${c.bucket}`)}</span>
                                    )}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => write(toks.filter((_, j) => j !== i))}
                                    className="hover:opacity-70"
                                    title={t('rangeChips.remove')}
                                    aria-label={t('rangeChips.remove')}
                                >
                                    <X size={11} />
                                </button>
                            </span>
                        ))}
                    </div>
                    <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                        <input
                            type="number"
                            min={1}
                            max={999}
                            value={num}
                            onChange={(e) => setNum(Math.min(999, Math.max(1, Number(e.target.value) || 1)))}
                            className="w-14 text-xs rounded-md px-2 py-1 text-center focus:outline-none"
                            style={{ ...btnStyle, color: 'var(--text-primary)' }}
                            aria-label={t('rangeChips.value')}
                        />
                        <select
                            value={unit}
                            onChange={(e) => setUnit(e.target.value as RangeUnit)}
                            className="text-xs rounded-md px-1.5 py-1 focus:outline-none"
                            style={{ ...btnStyle, color: 'var(--text-primary)' }}
                            aria-label={t('rangeChips.unit')}
                        >
                            {RANGE_UNITS.map((u) => (
                                <option key={u} value={u}>
                                    {t(`rangeChips.unit.${u}`)}
                                </option>
                            ))}
                        </select>
                        {withInterval && (
                            <select
                                value={interval}
                                onChange={(e) => setBucketChoice(e.target.value as DeltaBucketSetting | '')}
                                className="text-xs rounded-md px-1.5 py-1 focus:outline-none"
                                style={{ ...btnStyle, color: 'var(--text-primary)' }}
                                aria-label={t('rangeChips.interval')}
                                title={t('rangeChips.intervalHint')}
                                data-testid="range-chips-interval"
                            >
                                <option value="">{t('rangeChips.intervalSeries')}</option>
                                {INTERVAL_CODES.map((code) => {
                                    const b = parseBucketCode(code)!;
                                    return (
                                        <option key={code} value={b}>
                                            {t(`echart.interval.${b}`)}
                                        </option>
                                    );
                                })}
                            </select>
                        )}
                        <button
                            type="button"
                            onClick={() => add(withBucket(`${num}${unit}`))}
                            className="inline-flex items-center gap-0.5 text-[11px] px-2 py-1 rounded-md hover:opacity-80"
                            style={btnStyle}
                        >
                            <Plus size={11} />
                            {t('rangeChips.add')}
                        </button>
                        {!keys.includes('total') && (
                            <button
                                type="button"
                                onClick={() => add(withBucket('total'))}
                                className="inline-flex items-center gap-0.5 text-[11px] px-2 py-1 rounded-md hover:opacity-80"
                                style={btnStyle}
                            >
                                <Plus size={11} />
                                {t('rangeChips.total')}
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => onChange(undefined)}
                            className="text-[11px] px-2 py-1 rounded-md hover:opacity-80 ml-auto"
                            style={btnStyle}
                        >
                            {t('rangeChips.reset')}
                        </button>
                    </div>
                    <p className="text-[10px] mt-1" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                        {t('rangeChips.hint')}
                    </p>
                </>
            )}
        </div>
    );
}
