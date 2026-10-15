/**
 * Special days of the Zeitschaltuhr — holidays / vacation picked with a date
 * field instead of typing JSON into the object browser (#785).
 *
 * Opened from the widget in the frontend. Each change is written straight to the
 * special-day datapoint (holidaysDp / vacationDp) — the list lives there, not in
 * the dashboard config, so every timer reading the same datapoint sees it at once.
 * A datapoint that holds a flag (true/false, e.g. from the feiertage adapter) is
 * only shown, never overwritten; see utils/specialDays.ts.
 */
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Trash2, Plus, CalendarOff, Plane, PartyPopper, Info } from 'lucide-react';
import { usePortalTarget, usePortalThemeVars } from '../../contexts/PortalTargetContext';
import { useDatapoint } from '../../hooks/useDatapoint';
import { useIoBroker } from '../../hooks/useIoBroker';
import { useEscapeLayer } from '../../utils/escapeStack';
import { DateTimeInput } from '../common/DateTimeInput';
import {
    hasEntry,
    makeEntry,
    parseSpecialDaysValue,
    serializeEntries,
    sortEntries,
    todayKey,
    type SpecialDayEntry,
} from '../../utils/specialDays';

export type SpecialDaysKind = 'vacation' | 'holidays';

export interface SpecialDaysSource {
    kind: SpecialDaysKind;
    dp: string;
    /** Admin switch — false shows the list without add / delete. */
    editable: boolean;
}

interface Props {
    sources: SpecialDaysSource[];
    onClose: () => void;
}

const KIND_LABEL: Record<SpecialDaysKind, string> = { vacation: 'Urlaub', holidays: 'Feiertage' };
const KIND_ICON: Record<SpecialDaysKind, typeof Plane> = { vacation: Plane, holidays: PartyPopper };

const inputCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none';
const inputStyle: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};
const labelCls = 'text-[11px] block mb-1';
const labelStyle: React.CSSProperties = { color: 'var(--text-secondary)' };

function fmtDay(key: string): string {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });
}

function fmtEntry(e: SpecialDayEntry): string {
    return e.from === e.to ? fmtDay(e.from) : `${fmtDay(e.from)} – ${fmtDay(e.to)}`;
}

function dayCount(e: SpecialDayEntry): number {
    const [a, b] = [e.from, e.to].map((k) => {
        const [y, m, d] = k.split('-').map(Number);
        return Date.UTC(y, m - 1, d);
    });
    return Math.round((b - a) / 86_400_000) + 1;
}

function Notice({ children }: { children: React.ReactNode }) {
    return (
        <div
            className="flex gap-2 rounded-lg px-2.5 py-2 text-[11px]"
            style={{
                background: 'var(--app-bg)',
                border: '1px solid var(--app-border)',
                color: 'var(--text-secondary)',
            }}
        >
            <Info size={13} className="shrink-0 mt-px" />
            <div>{children}</div>
        </div>
    );
}

function SpecialDaysPanel({ source }: { source: SpecialDaysSource }) {
    const { value } = useDatapoint(source.dp);
    const { setState } = useIoBroker();
    // Our last write until the datapoint reports back — a second click before the
    // echo arrives must build on the list it sees, not on the stale value.
    const [written, setWritten] = useState<string | null>(null);
    useEffect(() => setWritten(null), [value]);
    const shown = written ?? value;
    const parsed = useMemo(() => parseSpecialDaysValue(shown), [shown]);
    const today = todayKey();
    const [from, setFrom] = useState(today);
    const [to, setTo] = useState('');
    const [error, setError] = useState('');

    if (parsed.kind === 'flag') {
        return (
            <Notice>
                Dieser Datenpunkt meldet nur, ob <b>heute</b> ein{' '}
                {source.kind === 'vacation' ? 'Urlaubstag' : 'Feiertag'} ist (zurzeit:{' '}
                <b>{parsed.today ? 'ja' : 'nein'}</b>). Er wird von einem Adapter oder Skript gesetzt und lässt sich
                hier nicht bearbeiten.
            </Notice>
        );
    }
    if (parsed.kind === 'invalid') {
        return (
            <Notice>
                Der Wert von <code className="font-mono">{source.dp}</code> ist keine Liste von Tagen und wird hier
                nicht überschrieben.
            </Notice>
        );
    }

    const entries = sortEntries(parsed.entries);
    const upcoming = entries.filter((e) => e.to >= today);
    const past = entries.filter((e) => e.to < today);
    const editable = source.editable;

    const write = (next: SpecialDayEntry[]) => {
        const json = serializeEntries(next, parsed.skipped);
        setWritten(json);
        setState(source.dp, json);
    };

    const add = () => {
        const e = makeEntry(from, to);
        if (!e) {
            setError('Bitte ein Datum wählen.');
            return;
        }
        if (hasEntry(entries, e)) {
            setError('Dieser Eintrag ist schon in der Liste.');
            return;
        }
        setError('');
        write([...entries, e]);
        setTo('');
    };

    const remove = (e: SpecialDayEntry) => write(entries.filter((x) => x !== e));

    const row = (e: SpecialDayEntry, isPast: boolean) => {
        const active = e.from <= today && e.to >= today;
        const n = dayCount(e);
        return (
            <div
                key={`${e.from}/${e.to}`}
                className="flex items-center gap-2 rounded-lg px-2.5 py-1.5"
                style={{
                    background: 'var(--app-bg)',
                    border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                    opacity: isPast ? 0.55 : 1,
                }}
            >
                <span className="text-xs flex-1 min-w-0 truncate" style={{ color: 'var(--text-primary)' }}>
                    {fmtEntry(e)}
                </span>
                {active && (
                    <span
                        className="text-[10px] font-semibold rounded px-1 py-0.5 shrink-0"
                        style={{ color: 'var(--accent)', border: '1px solid var(--accent)' }}
                    >
                        heute
                    </span>
                )}
                {n > 1 && (
                    <span className="text-[10px] shrink-0" style={{ color: 'var(--text-secondary)' }}>
                        {n} Tage
                    </span>
                )}
                {editable && (
                    <button
                        onClick={() => remove(e)}
                        className="shrink-0 hover:opacity-70 p-0.5"
                        style={{ color: 'var(--text-secondary)' }}
                        title="Eintrag entfernen"
                        aria-label="Eintrag entfernen"
                    >
                        <Trash2 size={13} />
                    </button>
                )}
            </div>
        );
    };

    return (
        <div className="space-y-3">
            {editable ? (
                <div className="space-y-1.5">
                    <div className="flex gap-2">
                        <div className="flex-1 min-w-0">
                            <label className={labelCls} style={labelStyle}>
                                {to ? 'Von' : 'Tag'}
                            </label>
                            <DateTimeInput
                                kind="date"
                                wrapClassName="w-full"
                                value={from}
                                onValue={(v) => {
                                    setFrom(v);
                                    setError('');
                                }}
                                className={inputCls}
                                style={inputStyle}
                            />
                        </div>
                        <div className="flex-1 min-w-0">
                            <label className={labelCls} style={labelStyle}>
                                Bis (optional)
                            </label>
                            <DateTimeInput
                                kind="date"
                                wrapClassName="w-full"
                                value={to}
                                min={from || undefined}
                                onValue={(v) => {
                                    setTo(v);
                                    setError('');
                                }}
                                className={inputCls}
                                style={inputStyle}
                            />
                        </div>
                    </div>
                    <button
                        onClick={add}
                        className="w-full flex items-center justify-center gap-1.5 py-2 text-xs rounded-lg hover:opacity-90"
                        style={{ background: 'var(--accent)', color: '#fff' }}
                    >
                        <Plus size={13} /> {to && to !== from ? 'Zeitraum hinzufügen' : 'Tag hinzufügen'}
                    </button>
                    {error && (
                        <p className="text-[11px]" style={{ color: 'var(--accent-red)' }}>
                            {error}
                        </p>
                    )}
                </div>
            ) : (
                <Notice>Die Liste ist schreibgeschützt (Einstellung im Admin).</Notice>
            )}

            <div className="space-y-1">
                {upcoming.length === 0 && (
                    <p className="text-[11px] italic text-center py-2" style={{ color: 'var(--text-secondary)' }}>
                        Keine anstehenden Einträge
                    </p>
                )}
                {upcoming.map((e) => row(e, false))}
            </div>

            {past.length > 0 && (
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <p className="text-[11px] flex-1" style={labelStyle}>
                            Vergangen ({past.length})
                        </p>
                        {editable && (
                            <button
                                onClick={() => write(upcoming)}
                                className="text-[11px] hover:opacity-70"
                                style={{ color: 'var(--text-secondary)' }}
                            >
                                Alle entfernen
                            </button>
                        )}
                    </div>
                    {past.map((e) => row(e, true))}
                </div>
            )}

            {parsed.skipped.length > 0 && (
                <Notice>
                    {parsed.skipped.length} Eintrag/Einträge im Datenpunkt sind kein gültiges Datum und werden ignoriert
                    (bleiben aber erhalten).
                </Notice>
            )}

            <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                Gespeichert in <code className="font-mono">{source.dp}</code> — gilt für jede Zeitschaltuhr mit diesem
                Datenpunkt.
            </p>
        </div>
    );
}

export function TimerSpecialDaysModal({ sources, onClose }: Props) {
    const [active, setActive] = useState<SpecialDaysKind>(sources[0]?.kind ?? 'vacation');
    const current = sources.find((s) => s.kind === active) ?? sources[0];
    const portal = usePortalTarget();
    const themeVars = usePortalThemeVars();
    useEscapeLayer(onClose);

    if (!current) return null;

    // Same portal setup as TimerEventModal: tag the root so the frontend theme vars apply.
    return createPortal(
        <div
            data-aura-app="frontend"
            className="fixed inset-0 z-[9000] flex items-center justify-center p-3"
            style={{ background: 'rgba(0,0,0,0.5)', color: 'var(--text-primary)', ...themeVars }}
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div
                className="rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] flex flex-col"
                style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
            >
                <div
                    className="flex items-center gap-2 px-4 py-3 border-b"
                    style={{ borderColor: 'var(--app-border)' }}
                >
                    <CalendarOff size={15} style={{ color: 'var(--text-secondary)' }} />
                    <p className="text-sm font-semibold flex-1" style={{ color: 'var(--text-primary)' }}>
                        Ausnahmetage
                    </p>
                    <button
                        onClick={onClose}
                        className="hover:opacity-70"
                        style={{ color: 'var(--text-secondary)' }}
                        aria-label="Schließen"
                    >
                        <X size={16} />
                    </button>
                </div>

                {sources.length > 1 && (
                    <div className="flex gap-1 px-4 pt-3">
                        {sources.map(({ kind }) => {
                            const on = kind === current.kind;
                            const Icon = KIND_ICON[kind];
                            return (
                                <button
                                    key={kind}
                                    onClick={() => setActive(kind)}
                                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] rounded-lg transition-colors"
                                    style={{
                                        background: on ? 'var(--accent)' : 'var(--app-bg)',
                                        color: on ? '#fff' : 'var(--text-secondary)',
                                        border: `1px solid ${on ? 'var(--accent)' : 'var(--app-border)'}`,
                                    }}
                                >
                                    <Icon size={12} /> {KIND_LABEL[kind]}
                                </button>
                            );
                        })}
                    </div>
                )}

                <div className="px-4 py-3 overflow-y-auto">
                    {/* key: a fresh panel (own date fields, own subscription) per datapoint */}
                    <SpecialDaysPanel key={current.kind} source={current} />
                </div>
            </div>
        </div>,
        portal,
    );
}
