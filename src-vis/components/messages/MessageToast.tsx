import { useEffect, useState } from 'react';
import { Icon } from '@iconify/react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle, type LucideIcon } from 'lucide-react';
import { MessageHtml } from './MessageHtml';
import { TabEmbedBody } from '../widgets/popup/TabEmbedBody';
import { usePopupConfigStore, newTriggerHost } from '../../store/popupConfigStore';
import { useMessagesStore } from '../../store/messagesStore';
import { useT } from '../../i18n';
import type { AuraMessage, MessageSeverity, MessageTimeFormat } from '../../types';

/** One accent colour per severity, matching the adapter-logs widget palette. */
export const SEVERITY_COLOR: Record<MessageSeverity, string> = {
    info: '#3b82f6',
    success: '#22c55e',
    warning: '#f59e0b',
    error: '#ef4444',
};

const SEVERITY_ICON: Record<MessageSeverity, LucideIcon> = {
    info: Info,
    success: CheckCircle2,
    warning: AlertTriangle,
    error: XCircle,
};

const DEFAULT_WIDTH = 340;

/**
 * The send time as the card prints it. `time` is the common case — a toast that
 * just appeared only needs the clock — while `datetime` is what a message read
 * later out of the archive wants. Same locale as the history list and the detail
 * view, so one message never shows two date shapes.
 */
export function formatMessageTime(ts: number, format: MessageTimeFormat | undefined): string {
    try {
        const date = new Date(ts);
        return format === 'datetime'
            ? date.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })
            : date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    } catch {
        return String(ts);
    }
}

/** textAlign does not move flex children, so the button row needs its own mapping. */
const BUTTON_JUSTIFY: Record<string, string> = { left: 'flex-start', center: 'center', right: 'flex-end' };
/** Countdown bar height in px. */
const BAR_H = 3;

interface Props {
    msg: AuraMessage;
    /**
     * The card wants to go away. `user` is the close button, `timeout` the expired
     * auto-close — the two differ for a message that survives a reload: only the
     * button counts as an answer.
     */
    onClose: (reason: 'user' | 'timeout') => void;
    /** Rendered flat (no fixed positioning) — used by the message detail view. */
    embedded?: boolean;
}

/**
 * A single message card.
 *
 * The auto-close timer is deliberately wall-clock based rather than a plain
 * setTimeout: the bar has to keep matching the remaining time after a hover
 * pause, and a tab that was suspended must not swallow the close.
 */
export function MessageToast({ msg, onClose, embedded }: Props) {
    const t = useT();
    const ack = useMessagesStore((s) => s.ack);
    const runAction = useMessagesStore((s) => s.runAction);
    // A `view` reference may be a popup-view id or its name, mirroring popup.open.
    const view = usePopupConfigStore((s) =>
        msg.view
            ? (s.views.find((v) => v.id === msg.view) ??
              s.views.find((v) => v.name.toLowerCase() === msg.view!.toLowerCase()))
            : undefined,
    );

    // `color` drives bar / fill / outline alike, so a message can be recoloured
    // without giving up its severity (which still picks the icon and the ranking).
    const color = msg.color || SEVERITY_COLOR[msg.severity];
    const appearance = msg.appearance ?? 'bar';
    // Anything that paints the whole card puts the content on the accent, where
    // the theme's text tokens would disappear — switch to white unless told otherwise.
    const onAccent = appearance === 'filled' || !!msg.background;
    const titleColor = msg.textColor || (onAccent ? '#fff' : 'var(--text-primary)');
    const bodyColor = msg.textColor || (onAccent ? 'rgba(255,255,255,0.88)' : 'var(--text-secondary)');
    const frame = appearance === 'outline' ? `2px solid ${color}` : '1px solid var(--app-border)';
    const SeverityIcon = SEVERITY_ICON[msg.severity];
    const countdown = !embedded && msg.durationSec > 0;

    // Remaining fraction (1 → 0). Paused while the pointer rests on the card, so
    // reading a long notice cannot be cut short.
    const [remaining, setRemaining] = useState(1);
    const [paused, setPaused] = useState(false);

    // A replaced message (same id, fresh content) gets the full duration again.
    useEffect(() => setRemaining(1), [msg.id, msg.ts, msg.durationSec]);

    useEffect(() => {
        if (!countdown || paused) return;
        const total = msg.durationSec * 1000;
        // Deadline is derived from whatever is left, so unpausing resumes rather
        // than restarts. Wall-clock rather than a counter: a browser that throttles
        // timers in a background tab must not stretch the displayed duration.
        const deadline = Date.now() + remaining * total;
        let timer = 0;
        const tick = () => {
            const left = deadline - Date.now();
            if (left <= 0) {
                onClose('timeout');
                return;
            }
            setRemaining(left / total);
            timer = window.setTimeout(tick, 100);
        };
        timer = window.setTimeout(tick, 100);
        return () => window.clearTimeout(timer);
        // `remaining` seeds the deadline but must not be a dependency — the loop
        // produces it, so listing it would restart the timer on every tick. The
        // pause toggle is what re-reads it, which is exactly the resume point.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [countdown, msg.durationSec, msg.id, msg.ts, paused, onClose]);

    const body = (() => {
        if (view) {
            return (
                <div className="max-h-[60dvh] overflow-auto">
                    <TabEmbedBody
                        viewId={view.id}
                        triggerWidget={{ ...newTriggerHost(), title: msg.title ?? '', datapoint: msg.dp ?? '' }}
                        dpOverride={msg.dp}
                    />
                </div>
            );
        }
        return (
            <>
                {msg.image && (
                    <img
                        src={msg.image}
                        alt=""
                        className="w-full rounded-lg mb-2"
                        style={{ maxHeight: 200, objectFit: 'cover' }}
                    />
                )}
                {(msg.html || msg.text) && (
                    <div className="aura-msg-html text-xs leading-relaxed" style={{ color: bodyColor }}>
                        <MessageHtml as="div" text={msg.html || msg.text || ''} />
                    </div>
                )}
            </>
        );
    })();

    const width = msg.width || DEFAULT_WIDTH;

    return (
        <div
            className="relative flex flex-col rounded-2xl shadow-2xl overflow-hidden pointer-events-auto"
            style={{
                background: msg.background || (appearance === 'filled' ? color : 'var(--app-surface)'),
                border: frame,
                // 'bar' keeps the accent on the leading edge so a stack reads at a
                // glance; the other looks carry the colour elsewhere. Always set,
                // never left undefined: switching a reused card back from 'bar'
                // would otherwise clear the longhand and leave that edge borderless.
                borderLeft: appearance === 'bar' ? `3px solid ${color}` : frame,
                textAlign: msg.align ?? 'left',
                // Element opacity, not just a translucent surface — an embedded popup
                // view paints its own widget cards and has to fade along with the frame.
                opacity: msg.transparency ? 1 - msg.transparency / 100 : undefined,
                width: embedded ? '100%' : `min(calc(100vw - 24px), ${width}px)`,
                // A given height is a height, not just a ceiling — the field is
                // labelled "Höhe", so a short message has to grow to fill it.
                height: !embedded && msg.height ? `min(85dvh, ${msg.height}px)` : undefined,
                maxHeight: embedded ? undefined : '85dvh',
            }}
            onPointerEnter={() => setPaused(true)}
            onPointerLeave={() => setPaused(false)}
            role={msg.severity === 'error' ? 'alert' : 'status'}
        >
            {/* flex-1/min-h-0 so the row can shrink inside a fixed-height card; the
                text column is what scrolls, keeping icon and close button in place.
                Without it a message longer than the card was simply clipped away. */}
            <div className="flex items-start gap-2.5 px-3 pt-2.5 pb-2 flex-1 min-h-0">
                <span className="shrink-0 mt-0.5" style={{ color: onAccent ? '#fff' : color }}>
                    {msg.icon ? <Icon icon={msg.icon} width={16} height={16} /> : <SeverityIcon size={16} />}
                </span>
                <div className="flex-1 min-w-0 h-full overflow-auto aura-scroll">
                    {msg.title && (
                        <div
                            className="aura-msg-html text-xs font-semibold mb-0.5 break-words"
                            style={{ color: titleColor }}
                        >
                            <MessageHtml as="div" text={msg.title} />
                        </div>
                    )}
                    {body}
                    {msg.showTime && (
                        <div
                            className="text-[10px] mt-1.5 opacity-70"
                            style={{ color: bodyColor }}
                            data-aura-msg-time={msg.timeFormat ?? 'time'}
                        >
                            {formatMessageTime(msg.ts, msg.timeFormat)}
                        </div>
                    )}
                </div>
                {/* A message demanding confirmation has no shortcut out — the button below is the only way. */}
                {!msg.requireAck && !embedded && (
                    <button
                        onClick={() => onClose('user')}
                        className="shrink-0 w-6 h-6 flex items-center justify-center rounded-lg hover:opacity-70 transition-opacity"
                        style={{ color: bodyColor }}
                        title={t('common.close')}
                    >
                        <X size={12} />
                    </button>
                )}
            </div>

            {(msg.actions?.length || msg.requireAck) && !embedded && (
                <div
                    className="flex flex-wrap gap-1.5 px-3 pb-2.5"
                    style={{ justifyContent: BUTTON_JUSTIFY[msg.align ?? 'left'] }}
                >
                    {msg.actions?.map((action, i) => (
                        <button
                            key={`${action.dp}-${i}`}
                            onClick={() => runAction(msg, i)}
                            className="px-2.5 py-1 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
                            style={
                                onAccent
                                    ? { background: '#fff', color, border: 'none' }
                                    : { background: color, color: '#fff', border: 'none' }
                            }
                        >
                            {action.label}
                        </button>
                    ))}
                    {msg.requireAck && (
                        <button
                            onClick={() => ack(msg)}
                            className="px-2.5 py-1 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
                            style={
                                onAccent
                                    ? {
                                          background: msg.actions?.length ? 'transparent' : '#fff',
                                          color: msg.actions?.length ? '#fff' : color,
                                          border: msg.actions?.length ? '1px solid rgba(255,255,255,0.6)' : 'none',
                                      }
                                    : {
                                          background: msg.actions?.length ? 'var(--app-bg)' : color,
                                          color: msg.actions?.length ? 'var(--text-primary)' : '#fff',
                                          border: msg.actions?.length ? '1px solid var(--app-border)' : 'none',
                                      }
                            }
                        >
                            {t('messages.acknowledge')}
                        </button>
                    )}
                </div>
            )}

            {countdown && (
                <div
                    className="shrink-0"
                    style={{ height: BAR_H, background: onAccent ? 'rgba(0,0,0,0.2)' : 'var(--app-border)' }}
                >
                    <div
                        style={{
                            height: '100%',
                            width: `${Math.max(0, Math.min(1, remaining)) * 100}%`,
                            background: onAccent ? '#fff' : color,
                            opacity: paused ? 0.45 : 1,
                            transition: 'width 120ms linear',
                        }}
                    />
                </div>
            )}
        </div>
    );
}
