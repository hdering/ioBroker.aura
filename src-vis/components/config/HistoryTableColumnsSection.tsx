/**
 * Column block of the history table panel (#760): a button that opens a dialog with one card per
 * column — the JSON table's column options for the fixed columns Datum / Uhrzeit / Wert: title,
 * order, hide, width, alignment, wrap, colours, prefix/suffix and, for the value column, a date
 * format for datapoints that store a timestamp. Number format, unit and conversion of the values
 * stay in the panel, they apply to the value column as a whole already.
 */
import { useRef, useState } from 'react';
import { AlignCenter, AlignLeft, AlignRight, ChevronDown, ChevronUp, Columns3, X } from 'lucide-react';
import { ConfigModal } from './ConfigModal';
import { ColorPicker } from '../common/ColorPicker';
import { useT } from '../../i18n';
import { TIME_DISPLAY_PRESETS, hasTimeDisplay } from '../../utils/timeDisplay';
import { historyColumns, type HistoryColumnDef, type HistoryColumnKey } from '../widgets/HistoryTableWidget';

const fieldCls = 'w-full text-xs rounded-lg px-2 py-1 focus:outline-none';
const fieldSty: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};
const smallSty: React.CSSProperties = { color: 'var(--text-secondary)' };
const hintSty: React.CSSProperties = { color: 'var(--text-secondary)', opacity: 0.7 };

function Toggle({ value, onToggle }: { value: boolean; onToggle: () => void }) {
    return (
        <button
            type="button"
            onClick={onToggle}
            className="relative w-9 h-5 rounded-full transition-colors shrink-0"
            style={{ background: value ? 'var(--accent)' : 'var(--app-border)' }}
        >
            <span
                className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                style={{ left: value ? '18px' : '2px' }}
            />
        </button>
    );
}

/** True once a column carries anything but its position. */
function isCustomized(c: HistoryColumnDef): boolean {
    return Object.entries(c).some(([k, v]) => k !== 'key' && k !== 'order' && v !== undefined);
}

export function HistoryTableColumnsSection({
    options: o,
    split,
    labels,
    onChange,
}: {
    options: Record<string, unknown>;
    split: boolean;
    /** Display title per column, as the widget shows it. */
    labels: Record<HistoryColumnKey, string>;
    onChange: (patch: Record<string, unknown>) => void;
}) {
    const t = useT();
    const [open, setOpen] = useState(false);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const columns = historyColumns(o.columns as HistoryColumnDef[] | undefined, split);
    const customized = columns.filter(isCustomized).length;
    const summary = columns.map((c) => (c.hidden ? `(${labels[c.key]})` : labels[c.key])).join(' · ');

    return (
        <>
            <div>
                <button
                    ref={buttonRef}
                    type="button"
                    onClick={() => setOpen(true)}
                    data-testid="historytable-columns"
                    className="w-full flex items-center justify-between gap-2 text-xs rounded-lg px-2.5 py-2 hover:opacity-80 transition-opacity"
                    style={{
                        background: customized ? 'var(--accent)' : 'var(--app-bg)',
                        border: `1px solid ${customized ? 'transparent' : 'var(--app-border)'}`,
                        color: customized ? '#fff' : 'var(--text-primary)',
                    }}
                >
                    <span className="flex items-center gap-1.5">
                        <Columns3 size={13} /> {t('historytable.cfg.columns')}
                    </span>
                    <span
                        className="text-[10px] px-1.5 py-0.5 rounded-full"
                        style={{
                            background: customized ? 'rgba(255,255,255,0.25)' : 'var(--app-border)',
                            color: customized ? '#fff' : 'var(--text-secondary)',
                        }}
                    >
                        {customized}
                    </span>
                </button>
                <p className="text-[11px] mt-1" style={{ color: 'var(--text-secondary)', opacity: 0.8 }}>
                    {summary}
                </p>
            </div>

            {open && (
                <ConfigModal
                    title={t('historytable.cfg.columns')}
                    maxWidth={560}
                    maxHeight={760}
                    padded
                    storageKey="aura-historytable-columns-modal"
                    onClose={() => {
                        setOpen(false);
                        buttonRef.current?.focus();
                    }}
                >
                    <HistoryColumnsEditor options={o} split={split} labels={labels} onChange={onChange} />
                </ConfigModal>
            )}
        </>
    );
}

function HistoryColumnsEditor({
    options: o,
    split,
    labels,
    onChange,
}: {
    options: Record<string, unknown>;
    split: boolean;
    labels: Record<HistoryColumnKey, string>;
    onChange: (patch: Record<string, unknown>) => void;
}) {
    const t = useT();
    const stored = (o.columns as HistoryColumnDef[] | undefined) ?? [];
    const columns = historyColumns(stored, split);
    // Colours have no flag of their own — the switch reads them, and a switch turned on
    // before a colour is picked is remembered here until then.
    const [colorOpen, setColorOpen] = useState<Partial<Record<HistoryColumnKey, boolean>>>({});
    const colorShown = (c: HistoryColumnDef) => colorOpen[c.key] ?? !!(c.cellBg || c.cellColor);

    /** Writes the visible columns back in their shown order; a column of the other time layout stays as it is. */
    const commit = (next: HistoryColumnDef[]) => {
        const shown = new Set(next.map((c) => c.key));
        const defaults = historyColumns(undefined, split).map((c) => c.key);
        // A shown column with nothing set and its default position needs no entry.
        const kept = [
            ...next
                .map((c, i) => ({ ...c, order: i }))
                .filter((c) => isCustomized(c) || c.order !== defaults.indexOf(c.key)),
            ...stored.filter((c) => !shown.has(c.key)),
        ];
        onChange({ columns: kept.length ? kept : undefined });
    };
    const update = (key: HistoryColumnKey, patch: Partial<HistoryColumnDef>) =>
        commit(columns.map((c) => (c.key === key ? { ...c, ...patch } : c)));
    const move = (idx: number, dir: -1 | 1) => {
        const to = idx + dir;
        if (to < 0 || to >= columns.length) return;
        const next = [...columns];
        [next[idx], next[to]] = [next[to], next[idx]];
        commit(next);
    };
    const labelKey: Record<HistoryColumnKey, string> = {
        date: 'colDateLabel',
        time: 'colTimeLabel',
        value: 'colValueLabel',
    };
    const defaultLabel: Record<HistoryColumnKey, string> = {
        date: t('historytable.col.date'),
        time: t(split ? 'historytable.col.time' : 'historytable.col.when'),
        value: t('historytable.col.value'),
    };

    return (
        <div className="space-y-2">
            <p className="text-[11px]" style={smallSty}>
                {t('historytable.cfg.columnsHint')}
            </p>
            {columns.map((col, idx) => {
                const isValue = col.key === 'value';
                const timeOn = hasTimeDisplay(col.valueTimeFormat);
                return (
                    <div
                        key={col.key}
                        data-testid={`historytable-col-${col.key}`}
                        className="rounded-lg p-2 flex flex-col gap-1.5"
                        style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}
                    >
                        <div className="flex items-center gap-1">
                            <span
                                className="text-[11px] font-medium flex-1 truncate"
                                style={{ color: 'var(--text-primary)', opacity: col.hidden ? 0.5 : 1 }}
                            >
                                {labels[col.key]}
                            </span>
                            <button
                                type="button"
                                onClick={() => move(idx, -1)}
                                disabled={idx === 0}
                                className="p-0.5 rounded hover:opacity-70 disabled:opacity-25"
                                style={smallSty}
                            >
                                <ChevronUp size={12} />
                            </button>
                            <button
                                type="button"
                                onClick={() => move(idx, 1)}
                                disabled={idx === columns.length - 1}
                                className="p-0.5 rounded hover:opacity-70 disabled:opacity-25"
                                style={smallSty}
                            >
                                <ChevronDown size={12} />
                            </button>
                        </div>
                        <input
                            type="text"
                            value={(o[labelKey[col.key]] as string | undefined) ?? ''}
                            placeholder={defaultLabel[col.key]}
                            onChange={(e) => onChange({ [labelKey[col.key]]: e.target.value || undefined })}
                            className={fieldCls}
                            style={fieldSty}
                            title={t('historytable.cfg.header')}
                        />
                        <div className="flex items-center gap-3 flex-wrap">
                            <label className="flex items-center gap-1.5 cursor-pointer">
                                <Toggle
                                    value={col.hidden ?? false}
                                    onToggle={() => update(col.key, { hidden: col.hidden ? undefined : true })}
                                />
                                <span className="text-[10px]" style={smallSty}>
                                    {t('historytable.cfg.colHidden')}
                                </span>
                            </label>
                            <label className="flex items-center gap-1.5 cursor-pointer">
                                <Toggle
                                    value={col.wrap ?? false}
                                    onToggle={() => update(col.key, { wrap: col.wrap ? undefined : true })}
                                />
                                <span className="text-[10px]" style={smallSty}>
                                    {t('historytable.cfg.colWrap')}
                                </span>
                            </label>
                            <label className="flex items-center gap-1.5 cursor-pointer">
                                <Toggle
                                    value={colorShown(col)}
                                    onToggle={() => {
                                        const on = !colorShown(col);
                                        setColorOpen((prev) => ({ ...prev, [col.key]: on }));
                                        if (!on) update(col.key, { cellBg: undefined, cellColor: undefined });
                                    }}
                                />
                                <span className="text-[10px]" style={smallSty}>
                                    {t('historytable.cfg.colColors')}
                                </span>
                            </label>
                            {isValue && (
                                <label className="flex items-center gap-1.5 cursor-pointer">
                                    <Toggle
                                        value={timeOn}
                                        onToggle={() =>
                                            update(
                                                col.key,
                                                timeOn
                                                    ? { valueTimeFormat: undefined, valueTimePattern: undefined }
                                                    : { valueTimeFormat: 'datetime' },
                                            )
                                        }
                                    />
                                    <span className="text-[10px]" style={smallSty}>
                                        {t('historytable.cfg.colTime')}
                                    </span>
                                </label>
                            )}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <div className="flex items-center gap-1">
                                <label className="text-[10px]" style={smallSty}>
                                    {t('historytable.cfg.colWidth')}
                                </label>
                                <input
                                    type="number"
                                    min={0}
                                    max={2000}
                                    value={col.width ?? ''}
                                    onChange={(e) => update(col.key, { width: Number(e.target.value) || undefined })}
                                    placeholder="auto"
                                    className="text-xs rounded-lg px-2 py-1 focus:outline-none w-16"
                                    style={fieldSty}
                                />
                                <span className="text-[10px]" style={smallSty}>
                                    px
                                </span>
                            </div>
                            <div className="flex items-center gap-0.5">
                                {(
                                    [
                                        ['left', AlignLeft],
                                        ['center', AlignCenter],
                                        ['right', AlignRight],
                                    ] as const
                                ).map(([val, Ico]) => {
                                    const def = isValue ? 'right' : 'left';
                                    const active = (col.align ?? def) === val;
                                    return (
                                        <button
                                            key={val}
                                            type="button"
                                            onClick={() => update(col.key, { align: val === def ? undefined : val })}
                                            className="p-1 rounded transition-colors"
                                            style={{
                                                background: active ? 'var(--accent)' : 'var(--app-border)',
                                                color: active ? '#fff' : 'var(--text-secondary)',
                                            }}
                                            title={t('historytable.cfg.colAlign')}
                                        >
                                            <Ico size={12} />
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {(
                                [
                                    ['prefix', 'historytable.cfg.colPrefix'],
                                    ['suffix', 'historytable.cfg.colSuffix'],
                                ] as const
                            ).map(([field, label]) => (
                                <div key={field} className="flex-1 min-w-0">
                                    <label className="text-[10px] block mb-1" style={smallSty}>
                                        {t(label)}
                                    </label>
                                    <input
                                        type="text"
                                        value={col[field] ?? ''}
                                        onChange={(e) => update(col.key, { [field]: e.target.value || undefined })}
                                        className={fieldCls}
                                        style={fieldSty}
                                    />
                                </div>
                            ))}
                        </div>
                        {colorShown(col) && (
                            <div className="flex items-center gap-3 flex-wrap">
                                {(
                                    [
                                        ['cellBg', 'historytable.cfg.colBg', '#6366f1'],
                                        ['cellColor', 'historytable.cfg.colText', '#ffffff'],
                                    ] as const
                                ).map(([field, label, fallback]) => (
                                    <div key={field} className="flex items-center gap-1.5">
                                        <ColorPicker
                                            value={col[field] || fallback}
                                            unset={!col[field]}
                                            onChange={(v) => update(col.key, { [field]: v || undefined })}
                                            className="w-8 h-7 rounded cursor-pointer shrink-0"
                                            style={{ border: '1px solid var(--app-border)', padding: '1px' }}
                                        />
                                        <span className="text-[10px]" style={smallSty}>
                                            {t(label)}
                                        </span>
                                        {col[field] && (
                                            <button
                                                type="button"
                                                onClick={() => update(col.key, { [field]: undefined })}
                                                className="p-0.5 rounded hover:opacity-70"
                                                style={smallSty}
                                                title={t('historytable.cfg.removeColor')}
                                            >
                                                <X size={11} />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                        {isValue && timeOn && (
                            <div
                                className="rounded-lg p-1.5 flex flex-col gap-1.5"
                                style={{ border: '1px solid var(--app-border)' }}
                            >
                                <select
                                    value={col.valueTimeFormat}
                                    onChange={(e) =>
                                        update(col.key, {
                                            valueTimeFormat: e.target.value,
                                            valueTimePattern:
                                                e.target.value === 'custom'
                                                    ? (col.valueTimePattern ?? 'dd.MM.yyyy HH:mm')
                                                    : undefined,
                                        })
                                    }
                                    className={fieldCls}
                                    style={fieldSty}
                                >
                                    {TIME_DISPLAY_PRESETS.filter((pr) => pr.id !== 'none').map((pr) => (
                                        <option key={pr.id} value={pr.id}>
                                            {pr.label}
                                        </option>
                                    ))}
                                    <option value="custom">{t('historytable.cfg.colCustomPattern')}</option>
                                </select>
                                {col.valueTimeFormat === 'custom' && (
                                    <input
                                        type="text"
                                        value={col.valueTimePattern ?? ''}
                                        onChange={(e) =>
                                            update(col.key, { valueTimePattern: e.target.value || undefined })
                                        }
                                        placeholder="dd.MM.yyyy HH:mm"
                                        className={`${fieldCls} font-mono`}
                                        style={fieldSty}
                                    />
                                )}
                                <p className="text-[9px]" style={hintSty}>
                                    {t('historytable.cfg.colTimeHint')}
                                </p>
                            </div>
                        )}
                        {isValue && (
                            <p className="text-[9px]" style={hintSty}>
                                {t('historytable.cfg.colNumberHint')}
                            </p>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
