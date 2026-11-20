import { ArrowDown, ArrowUp, RotateCcw } from 'lucide-react';
import {
    ROW_PART_LABELS,
    defaultRowParts,
    isDefaultRowParts,
    resolveRowParts,
    type ResolvedRowPart,
    type StatusOverviewOptions,
    type StatusRowPart,
    type StatusRowPartKey,
    type StatusRowSlot,
} from '../../utils/statusOverview';
import { Unavailable } from './Unavailable';

/** Parts whose visibility already has its own option — the checkbox writes that one. */
const VISIBILITY_OPTION: Partial<Record<StatusRowPartKey, 'showRoom' | 'showSince' | 'batteryTypeEnabled'>> = {
    room: 'showRoom',
    since: 'showSince',
    batteryType: 'batteryTypeEnabled',
};

const SLOT_LABELS: Record<StatusRowSlot, string> = {
    start: 'links',
    meta: 'hinter dem Namen',
    end: 'rechts',
};
/** Zweizeilig reads the sides as lines. */
const SLOT_LABELS_2L: Record<StatusRowSlot, string> = {
    start: 'Zeile 1',
    meta: 'Zeile 2',
    end: 'rechts',
};

const btnStyle: React.CSSProperties = {
    color: 'var(--text-secondary)',
    border: '1px solid var(--app-border)',
    background: 'var(--app-bg)',
};

/**
 * "Zeilenaufbau" of the Statusübersicht (option rowParts, #1003): order, side and
 * visibility of the row parts for the layouts Standard, Kompakt and Tabelle.
 * Stores nothing while the row is the built-in one.
 */
export function StatusRowPartsEditor({
    opts,
    layout,
    set,
}: {
    opts: StatusOverviewOptions;
    layout: string;
    set: (patch: Partial<StatusOverviewOptions>) => void;
}) {
    const base = defaultRowParts(layout);
    const parts = resolveRowParts(opts.rowParts, base);
    const isTable = layout === 'table';
    const isTwoLine = layout === 'twoline';
    const applies = layout === 'default' || layout === 'compact' || isTable || isTwoLine;
    const slotLabels = isTwoLine ? SLOT_LABELS_2L : SLOT_LABELS;

    const write = (next: ResolvedRowPart[]) => {
        if (isDefaultRowParts(next, base)) {
            set({ rowParts: undefined });
            return;
        }
        set({
            rowParts: next.map(
                (p): StatusRowPart => ({ key: p.key, slot: p.slot, ...(p.hidden ? { hidden: true } : {}) }),
            ),
        });
    };
    const move = (i: number, dir: -1 | 1) => {
        const j = i + dir;
        if (j < 0 || j >= parts.length) return;
        const next = [...parts];
        [next[i], next[j]] = [next[j], next[i]];
        write(next);
    };
    const isOn = (p: ResolvedRowPart) => {
        const opt = VISIBILITY_OPTION[p.key];
        return opt ? opts[opt] !== false : !p.hidden;
    };
    const toggle = (i: number) => {
        const p = parts[i];
        const opt = VISIBILITY_OPTION[p.key];
        if (opt) {
            set({ [opt]: opts[opt] === false ? undefined : false });
            return;
        }
        write(parts.map((q, k) => (k === i ? { ...q, hidden: !q.hidden } : q)));
    };
    const setSlot = (i: number, slot: StatusRowSlot) => write(parts.map((q, k) => (k === i ? { ...q, slot } : q)));

    return (
        <Unavailable reason={applies ? undefined : 'Nur in den Layouts Standard, Kompakt, Tabelle und Zweizeilig'}>
            <div className="space-y-1">
                <p className="text-[11px] leading-snug" style={{ color: 'var(--text-secondary)' }}>
                    {isTable
                        ? 'Jede sichtbare Angabe ist eine Spalte, in dieser Reihenfolge. Wird das Widget schmal, fallen zuerst Raum, „seit …“ und Merk-Hinweise weg, dann der Batterietyp.'
                        : isTwoLine
                          ? 'Reihenfolge und Platz der Angaben: Zeile 1 hinter dem Namen, Zeile 2 darunter oder rechts vor den Knöpfen. Das Symbol ist der farbige Punkt.'
                          : 'Reihenfolge und Seite der Angaben in einer Zeile. „Hinter dem Namen“ hängt die Angabe gedämpft an den Namen an.'}
                </p>
                {isTable && (
                    <label
                        className="aura-status-theadtoggle flex items-center gap-1.5 text-xs select-none pb-1"
                        style={{ color: 'var(--text-primary)' }}
                    >
                        <input
                            type="checkbox"
                            checked={opts.tableHeader !== false}
                            onChange={() => set({ tableHeader: opts.tableHeader === false ? undefined : false })}
                            style={{ accentColor: 'var(--accent)' }}
                        />
                        Kopfzeile mit Spaltennamen
                    </label>
                )}
                {parts.map((p, i) => {
                    const on = isOn(p);
                    const fixed = p.key === 'name';
                    return (
                        <div
                            key={p.key}
                            className="aura-status-part flex items-center gap-1.5 rounded-lg px-1.5 py-1"
                            data-part={p.key}
                            style={{ border: '1px solid var(--app-border)' }}
                        >
                            <button
                                type="button"
                                className="rounded p-0.5 disabled:opacity-30"
                                style={btnStyle}
                                disabled={i === 0}
                                onClick={() => move(i, -1)}
                                aria-label={`${ROW_PART_LABELS[p.key]} nach oben`}
                            >
                                <ArrowUp size={12} />
                            </button>
                            <button
                                type="button"
                                className="rounded p-0.5 disabled:opacity-30"
                                style={btnStyle}
                                disabled={i === parts.length - 1}
                                onClick={() => move(i, 1)}
                                aria-label={`${ROW_PART_LABELS[p.key]} nach unten`}
                            >
                                <ArrowDown size={12} />
                            </button>
                            <label
                                className="flex items-center gap-1.5 flex-1 min-w-0 text-xs select-none"
                                style={{ color: 'var(--text-primary)', opacity: on ? 1 : 0.55 }}
                                title={fixed ? 'Der Name wird immer angezeigt' : undefined}
                            >
                                <input
                                    type="checkbox"
                                    checked={on}
                                    disabled={fixed}
                                    onChange={() => toggle(i)}
                                    style={{ accentColor: 'var(--accent)' }}
                                />
                                <span className="truncate">{ROW_PART_LABELS[p.key]}</span>
                            </label>
                            <select
                                value={p.slot}
                                disabled={isTable}
                                title={isTable ? 'In der Tabelle zählt nur die Reihenfolge' : undefined}
                                onChange={(e) => setSlot(i, e.target.value as StatusRowSlot)}
                                className="w-36 shrink-0 text-[11px] rounded-md px-1.5 py-1 focus:outline-none disabled:opacity-45"
                                style={{
                                    background: 'var(--app-bg)',
                                    color: 'var(--text-primary)',
                                    border: '1px solid var(--app-border)',
                                }}
                            >
                                {(Object.keys(slotLabels) as StatusRowSlot[])
                                    .filter((s) => !(fixed && s === 'meta'))
                                    .map((s) => (
                                        <option key={s} value={s}>
                                            {slotLabels[s]}
                                        </option>
                                    ))}
                            </select>
                        </div>
                    );
                })}
                {opts.rowParts && (
                    <button
                        type="button"
                        onClick={() => write(base.map((d) => ({ key: d.key, slot: d.slot, hidden: false })))}
                        className="inline-flex items-center gap-1 text-[11px] rounded-md px-2 py-1 hover:opacity-80"
                        style={btnStyle}
                    >
                        <RotateCcw size={11} /> Standard-Reihenfolge
                    </button>
                )}
            </div>
        </Unavailable>
    );
}
