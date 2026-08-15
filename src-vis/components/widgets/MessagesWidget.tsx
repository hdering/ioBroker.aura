import { useEffect, useMemo, useState } from 'react';
import { BellRing, Check, CheckCheck, Trash2 } from 'lucide-react';
import { useMessagesStore, startMessagesRuntime, matchesRef } from '../../store/messagesStore';
import { SEVERITY_COLOR } from '../messages/MessageToast';
import { MessageDetail } from '../messages/MessageDetail';
import { stripMessageHtml } from '../messages/MessageHtml';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { formatRelative } from '../../utils/parseTimeValue';
import { useT } from '../../i18n';
import type { AuraMessage, MessageSeverity, WidgetProps } from '../../types';

const ALL_SEVERITIES: MessageSeverity[] = ['error', 'warning', 'success', 'info'];

const SEVERITY_SHORT: Record<MessageSeverity, string> = {
    info: 'Info',
    success: 'Erfolg',
    warning: 'Warnung',
    error: 'Fehler',
};

/** One-line summary for the compact rows: title and body may carry markup. */
function summarize(msg: AuraMessage): string {
    if (msg.html || msg.text) return stripMessageHtml(msg.html || msg.text);
    return msg.view ? `▦ ${msg.view}` : '';
}

function dayKey(ts: number): string {
    try {
        return new Date(ts).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
    } catch {
        return '';
    }
}

/**
 * The Meldungen widget: the archive the adapter keeps, filtered for this widget.
 *
 * Reads straight from the messages store — the same mirror the toast layer uses —
 * so a message confirmed here disappears from every open client's overlay too. The
 * widget holds its own runtime lease because it also has to work where no toast
 * layer is mounted (widget editor, admin preview).
 */
export function MessagesWidget({ config }: WidgetProps) {
    const t = useT();
    const o = config.options ?? {};
    const showTitle = o.showTitle !== false;
    const showIcon = o.showIcon !== false;
    const titleAlign = (o.titleAlign as 'left' | 'center' | 'right') ?? 'left';
    const iconSize = (o.iconSize as number) || 20;

    // Filters — the widget's configured defaults; the severity pills are live.
    const configuredSeverities = useMemo(
        () =>
            Array.isArray(o.severities) && (o.severities as string[]).length
                ? (o.severities as MessageSeverity[]).filter((s) => ALL_SEVERITIES.includes(s))
                : ALL_SEVERITIES,
        [o.severities],
    );
    const maxEntries = (o.maxEntries as number) || 50;
    const hours = (o.hours as number) ?? 0; // 0 = no time limit
    const detailed = o.detailed === true;
    const groupByDay = o.groupByDay === true;
    const showFilter = o.showFilter !== false;
    const showAck = o.showAck !== false;
    const allowClear = o.allowClear === true;
    const unreadOnly = o.unreadOnly === true;
    const layoutFilter = (o.layoutFilter as string) ?? '';

    const history = useMessagesStore((s) => s.history);
    const ack = useMessagesStore((s) => s.ack);
    const clearAll = useMessagesStore((s) => s.clearAll);

    // Keeps the datapoint subscriptions alive while this widget is on screen.
    useEffect(() => startMessagesRuntime(), []);

    const [active, setActive] = useState<MessageSeverity[]>(configuredSeverities);
    useEffect(() => setActive(configuredSeverities), [configuredSeverities]);
    const [detail, setDetail] = useState<AuraMessage | null>(null);

    // Re-render every 30 s so the relative timestamps stay honest.
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 30_000);
        return () => window.clearInterval(timer);
    }, []);

    const visible = useMemo(() => {
        const cutoff = hours > 0 ? now - hours * 3600_000 : 0;
        return history
            .filter((m) => {
                if (!m || !ALL_SEVERITIES.includes(m.severity)) return false;
                if (!active.includes(m.severity)) return false;
                if (unreadOnly && m.read) return false;
                if (cutoff && m.ts < cutoff) return false;
                // Only restrict entries that actually name a layout — a message sent
                // to everyone belongs in every widget.
                if (layoutFilter && m.target?.layout && !matchesRef(m.target.layout, layoutFilter)) return false;
                return true;
            })
            .slice(0, maxEntries);
    }, [history, active, unreadOnly, hours, now, layoutFilter, maxEntries]);

    const counts = useMemo(() => {
        const out: Record<MessageSeverity, number> = { info: 0, success: 0, warning: 0, error: 0 };
        let unread = 0;
        for (const m of history) {
            if (!m || !ALL_SEVERITIES.includes(m.severity)) continue;
            out[m.severity] += 1;
            if (!m.read) unread += 1;
        }
        return { bySeverity: out, unread, total: history.length };
    }, [history]);

    const Icon = getWidgetIcon((o.icon as string) ?? 'BellRing', BellRing);
    const unreadVisible = visible.filter((m) => !m.read);

    // ── Layout 'count': just the tally, for use as a small tile ───────────────
    if (config.layout === 'count') {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center gap-1" data-aura-messages="count">
                <div className="flex items-baseline gap-1">
                    <span
                        className="font-bold leading-none"
                        style={{ fontSize: 'clamp(20px, 5cqmin, 56px)', color: 'var(--text-primary)' }}
                    >
                        {counts.unread}
                    </span>
                    <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        / {counts.total}
                    </span>
                </div>
                <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                    {config.title || t('messages.unread')}
                </span>
            </div>
        );
    }

    let lastDay = '';

    return (
        <div className="aura-widget-row w-full h-full flex flex-col gap-2 overflow-hidden" data-aura-messages="list">
            {(showTitle || showIcon) && (
                <div className="flex items-center gap-2 shrink-0">
                    {showIcon && (
                        <Icon
                            size={iconSize}
                            style={{ color: 'var(--accent)' }}
                            className="aura-widget-icon shrink-0"
                        />
                    )}
                    {showTitle && (
                        <p
                            className="aura-widget-title text-xs flex-1 min-w-0 truncate"
                            style={{
                                color: 'var(--text-secondary)',
                                textAlign: titleAlign as React.CSSProperties['textAlign'],
                            }}
                        >
                            {config.title || t('messages.title')}
                        </p>
                    )}
                    {counts.unread > 0 && (
                        <span
                            className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                            style={{ background: 'var(--accent)', color: '#fff' }}
                        >
                            {counts.unread}
                        </span>
                    )}
                </div>
            )}

            {showFilter && (
                <div className="flex items-center gap-1 flex-wrap shrink-0">
                    {configuredSeverities.map((sev) => {
                        const on = active.includes(sev);
                        return (
                            <button
                                key={sev}
                                onClick={() =>
                                    setActive((prev) =>
                                        // Never let the last pill be switched off — an empty
                                        // list with no visible reason reads as a broken widget.
                                        prev.includes(sev)
                                            ? prev.length > 1
                                                ? prev.filter((s) => s !== sev)
                                                : prev
                                            : [...prev, sev],
                                    )
                                }
                                className="text-[10px] px-2 py-0.5 rounded-full transition-colors"
                                style={{
                                    background: on ? SEVERITY_COLOR[sev] : 'var(--app-bg)',
                                    color: on ? '#fff' : 'var(--text-secondary)',
                                    border: `1px solid ${on ? SEVERITY_COLOR[sev] : 'var(--app-border)'}`,
                                }}
                            >
                                {SEVERITY_SHORT[sev]} <span className="opacity-70">{counts.bySeverity[sev]}</span>
                            </button>
                        );
                    })}
                    <div className="ml-auto flex items-center gap-1">
                        {showAck && unreadVisible.length > 1 && (
                            <button
                                onClick={() => unreadVisible.forEach((m) => ack(m))}
                                className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full"
                                style={{
                                    background: 'var(--app-bg)',
                                    color: 'var(--text-secondary)',
                                    border: '1px solid var(--app-border)',
                                }}
                                title={t('messages.ackAll')}
                            >
                                <CheckCheck size={11} />
                            </button>
                        )}
                        {allowClear && counts.total > 0 && (
                            <button
                                onClick={() => clearAll()}
                                className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full"
                                style={{
                                    background: 'var(--app-bg)',
                                    color: 'var(--text-secondary)',
                                    border: '1px solid var(--app-border)',
                                }}
                                title={t('messages.clearAll')}
                            >
                                <Trash2 size={11} />
                            </button>
                        )}
                    </div>
                </div>
            )}

            <div className="aura-scroll flex-1 min-h-0 overflow-auto flex flex-col gap-1">
                {visible.length === 0 && (
                    <div className="flex-1 flex items-center justify-center">
                        <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                            {t('messages.empty')}
                        </span>
                    </div>
                )}
                {visible.map((msg) => {
                    const day = groupByDay ? dayKey(msg.ts) : '';
                    const showDay = groupByDay && day !== lastDay;
                    if (showDay) lastDay = day;
                    const color = SEVERITY_COLOR[msg.severity];
                    const summary = summarize(msg);
                    return (
                        <div key={msg.id} className="contents">
                            {showDay && (
                                <div
                                    className="text-[10px] uppercase tracking-wide pt-1 shrink-0"
                                    style={{ color: 'var(--text-secondary)', opacity: 0.7 }}
                                >
                                    {day}
                                </div>
                            )}
                            <div
                                onClick={() => setDetail(msg)}
                                className="shrink-0 flex items-start gap-2 rounded-lg px-2 py-1.5 cursor-pointer transition-opacity hover:opacity-80"
                                style={{
                                    background: msg.read ? 'transparent' : 'var(--app-bg)',
                                    borderLeft: `3px solid ${color}`,
                                }}
                            >
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-baseline gap-2">
                                        <span
                                            className="text-[11px] font-medium truncate"
                                            style={{
                                                color: 'var(--text-primary)',
                                                // An unconfirmed entry is the one that still
                                                // wants attention, so it keeps full contrast.
                                                opacity: msg.read ? 0.65 : 1,
                                            }}
                                        >
                                            {stripMessageHtml(msg.title) || summary || SEVERITY_SHORT[msg.severity]}
                                        </span>
                                        <span
                                            className="text-[10px] ml-auto shrink-0 whitespace-nowrap"
                                            style={{ color: 'var(--text-secondary)' }}
                                        >
                                            {formatRelative(new Date(msg.ts), new Date(now), t)}
                                        </span>
                                    </div>
                                    {summary && (msg.title || detailed) && (
                                        <div
                                            className={`text-[10px] ${detailed ? 'whitespace-pre-line' : 'truncate'}`}
                                            style={{ color: 'var(--text-secondary)' }}
                                        >
                                            {summary}
                                        </div>
                                    )}
                                </div>
                                {showAck && !msg.read && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            ack(msg);
                                        }}
                                        className="shrink-0 w-5 h-5 flex items-center justify-center rounded hover:opacity-70"
                                        style={{ color: 'var(--text-secondary)' }}
                                        title={t('messages.acknowledge')}
                                    >
                                        <Check size={12} />
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {detail && <MessageDetail msg={detail} onClose={() => setDetail(null)} />}
        </div>
    );
}
