import { useEffect, useRef, useState } from 'react';
import { Lock, X } from 'lucide-react';
import { useT } from '../../i18n';
import type { PinScope } from '../../utils/pinLock';
import { NumericKeypad, PinDots } from './NumericKeypad';

/**
 * The unlock dialog for a PIN-protected section / tab. Rendered in place of the
 * dashboard content, so the protected widgets never mount while it is up.
 *
 * The code is verified server-side: `onUnlock` posts it to the adapter and
 * resolves `true` only when the server accepted it (and handed back the content).
 * The plaintext PIN is never in the browser — only its length reaches here, so the
 * keypad can show the right dots and auto-submit a full code without a confirm tap.
 *
 * Touch first: a keypad big enough for a wall tablet, plus normal keyboard input
 * (digits, Backspace, Enter, Escape) for desktop.
 */
export function PinPrompt({
    scope,
    name,
    pinLength = 4,
    onUnlock,
    onCancel,
}: {
    scope: PinScope;
    /** Name of the locked section / tab, shown above the input. */
    name: string;
    /** Digit count of the PIN (drives dots + auto-submit); never the PIN itself. */
    pinLength?: number;
    /** Verifies the code server-side; resolves true when it unlocked the view. */
    onUnlock: (code: string) => Promise<boolean>;
    onCancel?: () => void;
}) {
    const t = useT();
    const [entry, setEntry] = useState('');
    const [error, setError] = useState(false);
    const [busy, setBusy] = useState(false);
    const entryRef = useRef(entry);
    entryRef.current = entry;
    const busyRef = useRef(busy);
    busyRef.current = busy;
    const len = pinLength > 0 ? pinLength : 4;

    // A new target starts from scratch — never carry a half-typed code over.
    useEffect(() => {
        setEntry('');
        setError(false);
    }, [scope, name, pinLength]);

    const submit = async (value: string) => {
        if (busyRef.current) return;
        setBusy(true);
        let ok = false;
        try {
            ok = await onUnlock(value);
        } catch {
            ok = false;
        }
        setBusy(false);
        if (!ok) {
            setError(true);
            setEntry('');
        }
    };

    const push = (digit: string) => {
        if (busyRef.current) return;
        setError(false);
        const next = (entryRef.current + digit).slice(0, Math.max(len, entryRef.current.length + 1));
        setEntry(next);
        // Auto-check once the entry is as long as the code; a wrong code of the
        // same length is reported immediately instead of silently swallowing keys.
        if (next.length >= len) submit(next);
    };

    const back = () => {
        setError(false);
        setEntry((e) => e.slice(0, -1));
    };

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onCancel?.();
                return;
            }
            if (e.key === 'Backspace') {
                e.preventDefault();
                back();
                return;
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                submit(entryRef.current);
                return;
            }
            if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                e.preventDefault();
                push(e.key);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [len, onCancel, onUnlock]);

    const dots = Math.max(len, entry.length, 4);

    return (
        <div
            className="aura-pin-prompt flex-1 min-h-0 flex items-center justify-center p-4"
            style={{ background: 'var(--app-bg)' }}
            data-pin-scope={scope}
        >
            <div
                className="w-full flex flex-col items-center gap-5 rounded-2xl px-6 py-7"
                style={{
                    maxWidth: 320,
                    background: 'var(--app-surface)',
                    border: '1px solid var(--app-border)',
                    boxShadow: '0 10px 40px rgba(0,0,0,0.25)',
                }}
            >
                <div className="flex flex-col items-center gap-2 text-center">
                    <span
                        className="w-11 h-11 rounded-full flex items-center justify-center"
                        style={{ background: 'var(--accent)22', color: 'var(--accent)' }}
                    >
                        <Lock size={20} />
                    </span>
                    <div className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {name}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {scope === 'section' ? t('pin.promptSection') : t('pin.promptTab')}
                    </div>
                </div>

                <PinDots count={dots} filled={entry.length} error={error} />

                <div
                    className="text-[11px] text-center"
                    style={{ minHeight: 14, color: 'var(--color-error, #ef4444)' }}
                >
                    {error ? t('pin.wrong') : ''}
                </div>

                <NumericKeypad onDigit={push} onClear={() => setEntry('')} onBack={back} />

                {onCancel && (
                    <button
                        onClick={onCancel}
                        className="flex items-center gap-1.5 text-xs hover:opacity-80 transition-opacity"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        <X size={13} />
                        {t('common.cancel')}
                    </button>
                )}
            </div>
        </div>
    );
}
