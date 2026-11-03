/**
 * Touch keypad for disarming the alarm (#911) — the Alarm widget's `pinInput: 'keypad'`
 * alternative to the inline PIN field, for wall tablets without a usable keyboard.
 *
 * The PIN is checked by the alarm adapter, not here: its length is unknown, so
 * there is no auto-submit — the code goes out with the OK key (or Enter).
 * Rendered into the portal target like CountdownDurationModal so it overlays the
 * dashboard and picks up the frontend theme.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, KeyRound, X } from 'lucide-react';
import { usePortalTarget, usePortalThemeVars } from '../../contexts/PortalTargetContext';
import { useT } from '../../i18n';
import { useEscapeLayer } from '../../utils/escapeStack';
import { NumericKeypad, PinDots } from '../common/NumericKeypad';

/** Longer than any real alarm code — only keeps the dot row from overflowing. */
const MAX_DIGITS = 12;

interface Props {
    title: string;
    /** The adapter reported a wrong code for the previous attempt. */
    wrongPin?: boolean;
    onSubmit: (pin: string) => void;
    onCancel: () => void;
}

export function AlarmKeypadModal({ title, wrongPin, onSubmit, onCancel }: Props) {
    const t = useT();
    const portal = usePortalTarget();
    const themeVars = usePortalThemeVars();
    const [entry, setEntry] = useState('');
    const entryRef = useRef(entry);
    entryRef.current = entry;

    useEscapeLayer(onCancel);

    const push = (digit: string) => setEntry((e) => (e.length >= MAX_DIGITS ? e : e + digit));
    const back = () => setEntry((e) => e.slice(0, -1));
    const submit = () => {
        if (entryRef.current) onSubmit(entryRef.current);
    };

    // Physical keyboard as well — a desktop browser should not need the mouse.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Backspace') {
                e.preventDefault();
                back();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                submit();
            } else if (/^[0-9]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
                e.preventDefault();
                push(e.key);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [onSubmit]);

    return createPortal(
        <div
            data-aura-app="frontend"
            className="aura-alarm-keypad fixed inset-0 z-[9000] flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.5)', color: 'var(--text-primary)', ...themeVars }}
            onClick={onCancel}
        >
            <div
                className="w-full flex flex-col items-center gap-4 rounded-2xl px-6 py-6"
                style={{
                    maxWidth: 320,
                    background: 'var(--app-surface)',
                    border: '1px solid var(--app-border)',
                    boxShadow: '0 10px 40px rgba(0,0,0,0.25)',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex flex-col items-center gap-2 text-center">
                    <span
                        className="w-11 h-11 rounded-full flex items-center justify-center"
                        style={{ background: 'color-mix(in srgb, #ef4444 13%, transparent)', color: '#ef4444' }}
                    >
                        <KeyRound size={20} />
                    </span>
                    <div className="text-base font-semibold">{title}</div>
                </div>

                <PinDots count={Math.max(4, entry.length)} filled={entry.length} error={wrongPin && !entry} />

                <div
                    className="text-[11px] text-center"
                    style={{ minHeight: 14, color: 'var(--color-error, #ef4444)' }}
                >
                    {wrongPin && !entry ? t('alarm.wrongPin') : ''}
                </div>

                <NumericKeypad onDigit={push} onClear={() => setEntry('')} onBack={back} />

                <div className="grid grid-cols-2 gap-2 w-full">
                    <button
                        onClick={onCancel}
                        className="h-11 rounded-xl text-sm flex items-center justify-center gap-1.5 hover:opacity-80"
                        style={{
                            background: 'var(--app-bg)',
                            color: 'var(--text-secondary)',
                            border: '1px solid var(--app-border)',
                        }}
                    >
                        <X size={15} />
                        {t('common.cancel')}
                    </button>
                    <button
                        onClick={submit}
                        disabled={!entry}
                        className="h-11 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 hover:opacity-90 disabled:opacity-40"
                        style={{ background: '#ef4444', color: '#fff', border: '1px solid #ef4444' }}
                    >
                        <Check size={15} />
                        {t('alarm.keypad.ok')}
                    </button>
                </div>
            </div>
        </div>,
        portal,
    );
}
