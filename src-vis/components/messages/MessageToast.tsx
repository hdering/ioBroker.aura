import { useEffect, useState } from 'react';
import { Icon } from '@iconify/react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle, type LucideIcon } from 'lucide-react';
import { SafeHtml } from '../common/SafeHtml';
import { DynamicTitle } from '../widgets/DynamicTitle';
import { TabEmbedBody } from '../widgets/popup/TabEmbedBody';
import { usePopupConfigStore, newTriggerHost } from '../../store/popupConfigStore';
import { useMessagesStore } from '../../store/messagesStore';
import { useT } from '../../i18n';
import type { AuraMessage, MessageSeverity } from '../../types';

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
/** Countdown bar height in px. */
const BAR_H = 3;

interface Props {
    msg: AuraMessage;
    /** Auto-close fired, or the user pressed the close button. */
    onClose: () => void;
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

    const color = SEVERITY_COLOR[msg.severity];
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
                onClose();
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
                {msg.html ? (
                    <SafeHtml as="div" html={msg.html} className="text-xs leading-relaxed" />
                ) : (
                    msg.text && (
                        <p
                            className="text-xs leading-relaxed whitespace-pre-line"
                            style={{ color: 'var(--text-secondary)' }}
                        >
                            <DynamicTitle text={msg.text} />
                        </p>
                    )
                )}
            </>
        );
    })();

    const width = msg.width || DEFAULT_WIDTH;

    return (
        <div
            className="relative flex flex-col rounded-2xl shadow-2xl overflow-hidden pointer-events-auto"
            style={{
                background: 'var(--app-surface)',
                border: '1px solid var(--app-border)',
                // The accent sits on the leading edge so a stack reads at a glance.
                borderLeft: `3px solid ${color}`,
                // Element opacity, not just a translucent surface — an embedded popup
                // view paints its own widget cards and has to fade along with the frame.
                opacity: msg.transparency ? 1 - msg.transparency / 100 : undefined,
                width: embedded ? '100%' : `min(calc(100vw - 24px), ${width}px)`,
                maxHeight: embedded ? undefined : msg.height ? `min(85dvh, ${msg.height}px)` : '85dvh',
            }}
            onPointerEnter={() => setPaused(true)}
            onPointerLeave={() => setPaused(false)}
            role={msg.severity === 'error' ? 'alert' : 'status'}
        >
            <div className="flex items-start gap-2.5 px-3 pt-2.5 pb-2">
                <span className="shrink-0 mt-0.5" style={{ color }}>
                    {msg.icon ? <Icon icon={msg.icon} width={16} height={16} /> : <SeverityIcon size={16} />}
                </span>
                <div className="flex-1 min-w-0">
                    {msg.title && (
                        <div
                            className="text-xs font-semibold mb-0.5 break-words"
                            style={{ color: 'var(--text-primary)' }}
                        >
                            <DynamicTitle text={msg.title} />
                        </div>
                    )}
                    {body}
                </div>
                {/* A message demanding confirmation has no shortcut out — the button below is the only way. */}
                {!msg.requireAck && !embedded && (
                    <button
                        onClick={onClose}
                        className="shrink-0 w-6 h-6 flex items-center justify-center rounded-lg hover:opacity-70 transition-opacity"
                        style={{ color: 'var(--text-secondary)' }}
                        title={t('common.close')}
                    >
                        <X size={12} />
                    </button>
                )}
            </div>

            {(msg.actions?.length || msg.requireAck) && !embedded && (
                <div className="flex flex-wrap gap-1.5 px-3 pb-2.5">
                    {msg.actions?.map((action, i) => (
                        <button
                            key={`${action.dp}-${i}`}
                            onClick={() => runAction(msg, i)}
                            className="px-2.5 py-1 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
                            style={{ background: color, color: '#fff', border: 'none' }}
                        >
                            {action.label}
                        </button>
                    ))}
                    {msg.requireAck && (
                        <button
                            onClick={() => ack(msg)}
                            className="px-2.5 py-1 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
                            style={{
                                background: msg.actions?.length ? 'var(--app-bg)' : color,
                                color: msg.actions?.length ? 'var(--text-primary)' : '#fff',
                                border: msg.actions?.length ? '1px solid var(--app-border)' : 'none',
                            }}
                        >
                            {t('messages.acknowledge')}
                        </button>
                    )}
                </div>
            )}

            {countdown && (
                <div className="shrink-0" style={{ height: BAR_H, background: 'var(--app-border)' }}>
                    <div
                        style={{
                            height: '100%',
                            width: `${Math.max(0, Math.min(1, remaining)) * 100}%`,
                            background: color,
                            opacity: paused ? 0.45 : 1,
                            transition: 'width 120ms linear',
                        }}
                    />
                </div>
            )}
        </div>
    );
}
