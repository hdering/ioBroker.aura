import { useEffect, useMemo, useState } from 'react';
import { Check, CheckCheck, Search, Send, Trash2, X } from 'lucide-react';
import { getStateDirect, setStateDirect } from '../../hooks/useIoBroker';
import { NS } from '../../utils/namespace';
import {
    MessageBuilder,
    MESSAGE_ALIGNS,
    MESSAGE_APPEARANCES,
    MESSAGE_POSITIONS,
    MESSAGE_SEVERITIES,
    draftToPayload,
    emptyDraft,
    type MessageDraft,
} from '../../components/config/MessageBuilder';
import { MessageDetail } from '../../components/messages/MessageDetail';
import { ToastLayer } from '../../components/messages/ToastLayer';
import { SEVERITY_COLOR } from '../../components/messages/MessageToast';
import { stripMessageHtml } from '../../components/messages/MessageHtml';
import { useMessagesStore, startMessagesRuntime, DEFAULT_MAX_VISIBLE } from '../../store/messagesStore';
import { useConnectionStore } from '../../store/connectionStore';
import type { AuraMessage, MessageAlign, MessageAppearance, MessagePosition, MessageSeverity } from '../../types';

// ── Shared styles (mirrors AdminPopups) ───────────────────────────────────────

const inputCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none';
const inputStyle: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};
const labelStyle: React.CSSProperties = { color: 'var(--text-secondary)' };

const cardStyle: React.CSSProperties = {
    background: 'var(--app-surface)',
    border: '1px solid var(--app-border)',
};

// ── Presentation defaults (config.messageDefaults) ────────────────────────────

/**
 * Mirrors the shape the adapter reads in _messageDefaults(). Kept as a plain DP
 * rather than a store: the adapter needs the same value to normalize payloads, so
 * a single datapoint is the one place both sides agree on.
 */
interface MessageDefaults {
    position: MessagePosition;
    durations: Record<MessageSeverity, number>;
    width: number;
    transparency: number;
    maxVisible: number;
    appearance: MessageAppearance;
    align: MessageAlign;
    errorsRequireAck: boolean;
}

const BUILTIN_DEFAULTS: MessageDefaults = {
    position: 'top-right',
    durations: { info: 8, success: 8, warning: 15, error: 0 },
    width: 0,
    transparency: 0,
    maxVisible: DEFAULT_MAX_VISIBLE,
    appearance: 'bar',
    align: 'left',
    errorsRequireAck: false,
};

function parseDefaults(raw: unknown): MessageDefaults {
    try {
        const p = typeof raw === 'string' && raw ? (JSON.parse(raw) as Partial<MessageDefaults>) : {};
        return {
            ...BUILTIN_DEFAULTS,
            ...p,
            durations: { ...BUILTIN_DEFAULTS.durations, ...(p.durations ?? {}) },
        };
    } catch {
        return BUILTIN_DEFAULTS;
    }
}

function DefaultsSection() {
    const [defaults, setDefaults] = useState<MessageDefaults>(BUILTIN_DEFAULTS);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        let cancelled = false;
        void getStateDirect(`${NS}.config.messageDefaults`).then((st) => {
            if (cancelled) return;
            setDefaults(parseDefaults(st?.val));
            setLoaded(true);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    // ack=true: this is an owned configuration value, not a command.
    const save = (next: MessageDefaults) => {
        setDefaults(next);
        setStateDirect(`${NS}.config.messageDefaults`, JSON.stringify(next), true);
    };

    const numberField = (label: string, hint: string, value: number, onChange: (n: number) => void, max: number) => (
        <div>
            <label className="text-[11px] block mb-1" style={labelStyle}>
                {label}
            </label>
            <input
                type="number"
                min={0}
                max={max}
                value={value}
                onChange={(e) => onChange(Math.max(0, Math.min(max, Number(e.target.value) || 0)))}
                className={`${inputCls} font-mono`}
                style={{ ...inputStyle, maxWidth: 160 }}
            />
            <p className="text-[11px] mt-1" style={labelStyle}>
                {hint}
            </p>
        </div>
    );

    return (
        <section>
            <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
                Standardwerte
            </h2>
            <div className="rounded-xl px-4 py-3 flex flex-col gap-4" style={cardStyle}>
                <p className="text-[11px]" style={labelStyle}>
                    Gelten für jede Meldung, die das Feld nicht selbst mitschickt. Größe des Archivs und Aufbewahrung
                    stehen in den Instanz-Einstellungen des Adapters.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
                    <div>
                        <label className="text-[11px] block mb-1" style={labelStyle}>
                            Position
                        </label>
                        <select
                            value={defaults.position}
                            onChange={(e) => save({ ...defaults, position: e.target.value as MessagePosition })}
                            className={inputCls}
                            style={inputStyle}
                        >
                            {MESSAGE_POSITIONS.map((p) => (
                                <option key={p.value} value={p.value}>
                                    {p.label}
                                </option>
                            ))}
                        </select>
                        <p className="text-[11px] mt-1" style={labelStyle}>
                            Wo Meldungen erscheinen.
                        </p>
                    </div>
                    {numberField(
                        'Gleichzeitig sichtbar',
                        'Weitere Meldungen derselben Position warten, bis ein Platz frei wird.',
                        defaults.maxVisible,
                        (n) => save({ ...defaults, maxVisible: Math.max(1, n) }),
                        10,
                    )}
                    {numberField(
                        'Breite (px, 0 = automatisch)',
                        'Standardbreite der Meldungskarte.',
                        defaults.width,
                        (n) => save({ ...defaults, width: n }),
                        4000,
                    )}
                    {numberField(
                        'Transparenz (%)',
                        '0 % = deckend.',
                        defaults.transparency,
                        (n) => save({ ...defaults, transparency: n }),
                        95,
                    )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
                    <div>
                        <label className="text-[11px] block mb-1" style={labelStyle}>
                            Darstellung
                        </label>
                        <select
                            value={defaults.appearance}
                            onChange={(e) => save({ ...defaults, appearance: e.target.value as MessageAppearance })}
                            className={inputCls}
                            style={inputStyle}
                        >
                            {MESSAGE_APPEARANCES.map((a) => (
                                <option key={a.value} value={a.value}>
                                    {a.label}
                                </option>
                            ))}
                        </select>
                        <p className="text-[11px] mt-1" style={labelStyle}>
                            {MESSAGE_APPEARANCES.find((a) => a.value === defaults.appearance)?.hint}
                        </p>
                    </div>
                    <div>
                        <label className="text-[11px] block mb-1" style={labelStyle}>
                            Textausrichtung
                        </label>
                        <select
                            value={defaults.align}
                            onChange={(e) => save({ ...defaults, align: e.target.value as MessageAlign })}
                            className={inputCls}
                            style={inputStyle}
                        >
                            {MESSAGE_ALIGNS.map((a) => (
                                <option key={a.value} value={a.value}>
                                    {a.label}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <div>
                    <label className="text-[11px] block mb-2" style={labelStyle}>
                        Anzeigedauer je Schweregrad (Sek., 0 = bleibt offen)
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {MESSAGE_SEVERITIES.map((s) => (
                            <div key={s.value}>
                                <span className="text-[11px] flex items-center gap-1.5 mb-1" style={labelStyle}>
                                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
                                    {s.label}
                                </span>
                                <input
                                    type="number"
                                    min={0}
                                    max={86400}
                                    value={defaults.durations[s.value]}
                                    onChange={(e) =>
                                        save({
                                            ...defaults,
                                            durations: {
                                                ...defaults.durations,
                                                [s.value]: Math.max(0, Number(e.target.value) || 0),
                                            },
                                        })
                                    }
                                    className={`${inputCls} font-mono`}
                                    style={inputStyle}
                                />
                            </div>
                        ))}
                    </div>
                </div>

                <div className="flex items-center justify-between gap-3">
                    <div className="flex flex-col">
                        <span className="text-[11px]" style={labelStyle}>
                            Fehler immer bestätigen lassen
                        </span>
                        <span className="text-[10px] opacity-60" style={labelStyle}>
                            Fehlermeldungen schließen sich dann nie von selbst.
                        </span>
                    </div>
                    <button
                        onClick={() => save({ ...defaults, errorsRequireAck: !defaults.errorsRequireAck })}
                        className="relative w-9 h-5 rounded-full transition-colors shrink-0"
                        style={{ background: defaults.errorsRequireAck ? 'var(--accent)' : 'var(--app-border)' }}
                    >
                        <span
                            className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                            style={{ left: defaults.errorsRequireAck ? '18px' : '2px' }}
                        />
                    </button>
                </div>

                {!loaded && (
                    <p className="text-[11px]" style={labelStyle}>
                        Werte werden geladen …
                    </p>
                )}
            </div>
        </section>
    );
}

// ── Designer ──────────────────────────────────────────────────────────────────

function DesignerSection() {
    const [draft, setDraft] = useState<MessageDraft>(emptyDraft);
    const [sent, setSent] = useState<string | null>(null);
    const send = useMessagesStore((s) => s.send);

    const payload = draftToPayload(draft);
    const empty = !draft.title.trim() && !draft.text.trim() && !draft.html.trim() && !draft.image.trim() && !draft.view;

    const testSend = () => {
        send(JSON.stringify(payload));
        setSent(new Date().toLocaleTimeString('de-DE'));
        window.setTimeout(() => setSent(null), 4000);
    };

    return (
        <section>
            <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Meldung zusammenstellen
                </h2>
                <button
                    onClick={() => setDraft(emptyDraft())}
                    className="text-[11px] px-2 py-1 rounded-lg"
                    style={{
                        background: 'var(--app-bg)',
                        color: 'var(--text-secondary)',
                        border: '1px solid var(--app-border)',
                    }}
                >
                    Zurücksetzen
                </button>
            </div>
            <div className="rounded-xl px-4 py-3" style={cardStyle}>
                <p className="text-[11px] mb-3" style={labelStyle}>
                    Das JSON rechts auf <code>{NS}.messages.send</code> schreiben — aus Blockly, einem Skript oder jedem
                    anderen Adapter. Ein einfacher Text ohne <code>{'{'}</code> geht auch: er wird zur Info-Meldung.
                </p>
                <MessageBuilder
                    draft={draft}
                    onChange={setDraft}
                    actions={
                        <div className="flex items-center gap-2">
                            <button
                                onClick={testSend}
                                disabled={empty}
                                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-opacity hover:opacity-80 disabled:opacity-40"
                                style={{ background: 'var(--accent)', color: '#fff', border: 'none' }}
                                title={empty ? 'Mindestens Titel, Text, HTML, Bild oder View angeben' : undefined}
                            >
                                <Send size={12} /> Test senden
                            </button>
                            {sent && (
                                <span className="text-[11px]" style={labelStyle}>
                                    Gesendet um {sent}
                                </span>
                            )}
                        </div>
                    }
                />
            </div>
        </section>
    );
}

// ── History ───────────────────────────────────────────────────────────────────

function formatWhen(ts: number): string {
    try {
        return new Date(ts).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'medium' });
    } catch {
        return String(ts);
    }
}

function HistorySection() {
    const history = useMessagesStore((s) => s.history);
    const unreadCount = useMessagesStore((s) => s.unreadCount);
    const ack = useMessagesStore((s) => s.ack);
    const dismiss = useMessagesStore((s) => s.dismiss);
    const clearAll = useMessagesStore((s) => s.clearAll);

    // The admin has no toast layer, so it holds its own lease on the subscriptions.
    useEffect(() => startMessagesRuntime(), []);

    const [filter, setFilter] = useState('');
    const [severity, setSeverity] = useState<'' | MessageSeverity>('');
    const [unreadOnly, setUnreadOnly] = useState(false);
    const [detail, setDetail] = useState<AuraMessage | null>(null);

    const visible = useMemo(() => {
        const lc = filter.trim().toLowerCase();
        return history.filter((m) => {
            if (severity && m.severity !== severity) return false;
            if (unreadOnly && m.read) return false;
            if (!lc) return true;
            // Search the readable text, not the markup — otherwise "b" matches every <b>.
            return [stripMessageHtml(m.title), stripMessageHtml(m.text), m.id].some((v) =>
                v?.toLowerCase().includes(lc),
            );
        });
    }, [history, filter, severity, unreadOnly]);

    return (
        <section>
            <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
                <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Verlauf
                    <span className="ml-2 text-[11px] font-normal" style={labelStyle}>
                        {history.length} Einträge, {unreadCount} unbestätigt
                    </span>
                </h2>
                <div className="flex items-center gap-2">
                    {unreadCount > 0 && (
                        <button
                            onClick={() => setStateDirect(`${NS}.messages.ack`, '*')}
                            className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg"
                            style={{
                                background: 'var(--app-bg)',
                                color: 'var(--text-secondary)',
                                border: '1px solid var(--app-border)',
                            }}
                        >
                            <CheckCheck size={12} /> Alle bestätigen
                        </button>
                    )}
                    {history.length > 0 && (
                        <button
                            onClick={() => clearAll()}
                            className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg"
                            style={{
                                background: 'var(--app-bg)',
                                color: '#ef4444',
                                border: '1px solid var(--app-border)',
                            }}
                        >
                            <Trash2 size={12} /> Verlauf leeren
                        </button>
                    )}
                </div>
            </div>

            <div className="rounded-xl overflow-hidden" style={cardStyle}>
                <div
                    className="flex items-center gap-2 px-3 py-2 flex-wrap"
                    style={{ borderBottom: '1px solid var(--app-border)' }}
                >
                    <div className="relative flex-1 min-w-[180px]">
                        <Search
                            size={12}
                            className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                            style={{ color: 'var(--text-secondary)' }}
                        />
                        <input
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                            onKeyDown={(e) => e.key === 'Escape' && setFilter('')}
                            placeholder="Titel, Text oder ID"
                            className="w-full text-xs rounded-lg pl-7 pr-7 py-2 focus:outline-none"
                            style={inputStyle}
                        />
                        {filter && (
                            <button
                                onClick={() => setFilter('')}
                                className="absolute right-1.5 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded"
                                style={{ color: 'var(--text-secondary)' }}
                            >
                                <X size={11} />
                            </button>
                        )}
                    </div>
                    <select
                        value={severity}
                        onChange={(e) => setSeverity(e.target.value as '' | MessageSeverity)}
                        className="text-xs rounded-lg px-2 py-2 shrink-0 focus:outline-none"
                        style={inputStyle}
                    >
                        <option value="">Alle Schweregrade</option>
                        {MESSAGE_SEVERITIES.map((s) => (
                            <option key={s.value} value={s.value}>
                                {s.label}
                            </option>
                        ))}
                    </select>
                    <label className="flex items-center gap-1 text-[11px] shrink-0" style={labelStyle}>
                        <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} />
                        nur unbestätigte
                    </label>
                </div>

                {visible.length === 0 ? (
                    <div className="px-4 py-6 text-xs text-center" style={labelStyle}>
                        {history.length === 0 ? 'Noch keine Meldungen eingegangen.' : 'Keine Treffer für den Filter.'}
                    </div>
                ) : (
                    <div className="max-h-[520px] overflow-auto">
                        {visible.map((msg) => (
                            <div
                                key={msg.id}
                                onClick={() => setDetail(msg)}
                                className="flex items-center gap-3 px-3 py-2 cursor-pointer transition-opacity hover:opacity-80"
                                style={{
                                    borderBottom: '1px solid var(--app-border)',
                                    borderLeft: `3px solid ${SEVERITY_COLOR[msg.severity]}`,
                                }}
                            >
                                <div className="flex-1 min-w-0">
                                    <div
                                        className="text-xs truncate"
                                        style={{ color: 'var(--text-primary)', opacity: msg.read ? 0.65 : 1 }}
                                    >
                                        {stripMessageHtml(msg.title) || stripMessageHtml(msg.text) || msg.id}
                                    </div>
                                    <div className="text-[10px] truncate" style={labelStyle}>
                                        {formatWhen(msg.ts)}
                                        {msg.title && msg.text ? ` — ${stripMessageHtml(msg.text)}` : ''}
                                    </div>
                                </div>
                                {!msg.read && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            ack(msg);
                                        }}
                                        className="shrink-0 w-6 h-6 flex items-center justify-center rounded hover:opacity-70"
                                        style={{ color: 'var(--text-secondary)' }}
                                        title="Bestätigen"
                                    >
                                        <Check size={13} />
                                    </button>
                                )}
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        dismiss(msg.id);
                                    }}
                                    className="shrink-0 w-6 h-6 flex items-center justify-center rounded hover:opacity-70"
                                    style={{ color: 'var(--text-secondary)' }}
                                    title="Auf allen Clients schließen"
                                >
                                    <X size={13} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {detail && <MessageDetail msg={detail} onClose={() => setDetail(null)} />}
        </section>
    );
}

// ── AdminMessages ─────────────────────────────────────────────────────────────

export function AdminMessages() {
    const clientId = useConnectionStore((s) => s.clientId);
    // Without this the Test senden button would look broken: the toast layer lives
    // on the dashboard route, so the message would arrive, land in the history
    // below — and show nothing on the page you pressed the button on. No layout or
    // tab in the scope, so a message addressed to one of those stays on its
    // dashboard and only appears in the list.
    const scope = useMemo(() => ({ clientId }), [clientId]);

    return (
        <div className="px-6 py-8 space-y-8">
            <div>
                <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                    Meldungen
                </h1>
                <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                    Informationen, Warnungen und Fehler aus Skripten ins Dashboard einblenden
                </p>
            </div>
            <DesignerSection />
            <DefaultsSection />
            <HistorySection />
            <ToastLayer scope={scope} />
        </div>
    );
}
