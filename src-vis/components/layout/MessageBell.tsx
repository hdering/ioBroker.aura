import { useEffect, useRef, useState } from 'react';
import { Bell, Check } from 'lucide-react';
import { useMessagesStore, startMessagesRuntime } from '../../store/messagesStore';
import { MessageDetail } from '../messages/MessageDetail';
import { SEVERITY_COLOR } from '../messages/MessageToast';
import { formatRelative } from '../../utils/parseTimeValue';
import { useT } from '../../i18n';
import type { AuraMessage } from '../../types';

/** How many entries the dropdown lists before it just says "see the widget". */
const DROPDOWN_MAX = 8;

/**
 * Unread counter in the header. The badge reads `messages.unreadCount`, which the
 * adapter maintains, so every device shows the same number and confirming on one
 * lowers it everywhere.
 *
 * A dashboard does not always have room for the Meldungen widget — this is the
 * always-available way back to what was missed.
 */
export function MessageBell() {
    const t = useT();
    const unreadCount = useMessagesStore((s) => s.unreadCount);
    const history = useMessagesStore((s) => s.history);
    const ack = useMessagesStore((s) => s.ack);
    const [open, setOpen] = useState(false);
    const [detail, setDetail] = useState<AuraMessage | null>(null);
    const rootRef = useRef<HTMLDivElement>(null);

    useEffect(() => startMessagesRuntime(), []);

    // Close on an outside click or Escape — the dropdown has no backdrop of its
    // own so it must not swallow interaction with the dashboard behind it.
    useEffect(() => {
        if (!open) return;
        const onDown = (e: PointerEvent) => {
            if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('pointerdown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('pointerdown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    const recent = history.slice(0, DROPDOWN_MAX);
    const now = Date.now();

    return (
        <div className="relative" ref={rootRef}>
            <button
                onClick={() => setOpen((v) => !v)}
                className="relative w-8 h-8 flex items-center justify-center rounded-full hover:opacity-80 transition-opacity"
                style={{
                    background: 'var(--app-bg)',
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--app-border)',
                }}
                title={t('messages.title')}
                aria-label={`${t('messages.title')}${unreadCount ? ` (${unreadCount})` : ''}`}
            >
                <Bell size={15} />
                {unreadCount > 0 && (
                    <span
                        className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full text-[9px] font-bold"
                        style={{ background: 'var(--accent)', color: '#fff' }}
                    >
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </button>

            {open && (
                <div
                    className="absolute right-0 mt-2 rounded-xl shadow-2xl overflow-hidden z-[290]"
                    style={{
                        width: 'min(calc(100vw - 24px), 320px)',
                        background: 'var(--app-surface)',
                        border: '1px solid var(--app-border)',
                    }}
                >
                    <div
                        className="px-3 py-2 flex items-center justify-between"
                        style={{ borderBottom: '1px solid var(--app-border)' }}
                    >
                        <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                            {t('messages.title')}
                        </span>
                        {unreadCount > 0 && (
                            <button
                                onClick={() => recent.filter((m) => !m.read).forEach((m) => ack(m))}
                                className="text-[10px] px-2 py-0.5 rounded-full"
                                style={{
                                    background: 'var(--app-bg)',
                                    color: 'var(--text-secondary)',
                                    border: '1px solid var(--app-border)',
                                }}
                            >
                                {t('messages.ackAll')}
                            </button>
                        )}
                    </div>

                    {recent.length === 0 ? (
                        <div className="px-3 py-5 text-[11px] text-center" style={{ color: 'var(--text-secondary)' }}>
                            {t('messages.empty')}
                        </div>
                    ) : (
                        <div className="max-h-[60dvh] overflow-auto">
                            {recent.map((msg) => (
                                <div
                                    key={msg.id}
                                    onClick={() => {
                                        setDetail(msg);
                                        setOpen(false);
                                    }}
                                    className="flex items-center gap-2 px-3 py-2 cursor-pointer transition-opacity hover:opacity-80"
                                    style={{
                                        borderBottom: '1px solid var(--app-border)',
                                        borderLeft: `3px solid ${SEVERITY_COLOR[msg.severity]}`,
                                    }}
                                >
                                    <div className="flex-1 min-w-0">
                                        <div
                                            className="text-[11px] truncate"
                                            style={{
                                                color: 'var(--text-primary)',
                                                opacity: msg.read ? 0.65 : 1,
                                            }}
                                        >
                                            {msg.title || msg.text || msg.id}
                                        </div>
                                        <div className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                                            {formatRelative(new Date(msg.ts), new Date(now), t)}
                                        </div>
                                    </div>
                                    {!msg.read && (
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
                            ))}
                        </div>
                    )}
                </div>
            )}

            {detail && <MessageDetail msg={detail} onClose={() => setDetail(null)} />}
        </div>
    );
}
