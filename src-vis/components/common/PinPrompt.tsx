import { useEffect, useRef, useState } from 'react';
import { Delete, Lock, X } from 'lucide-react';
import { useT } from '../../i18n';
import type { PinScope } from '../../utils/pinLock';

/**
 * The unlock dialog for a PIN-protected section / tab. Rendered in place of the
 * dashboard content, so the protected widgets never mount while it is up.
 *
 * Touch first: a keypad big enough for a wall tablet, plus normal keyboard input
 * (digits, Backspace, Enter, Escape) for desktop. The entry is checked as soon as
 * it reaches the length of the PIN — no extra confirm tap on a 4-digit code.
 */
export function PinPrompt({
    scope,
    name,
    pin,
    onUnlock,
    onCancel,
}: {
    scope: PinScope;
    /** Name of the locked section / tab, shown above the input. */
    name: string;
    pin: string;
    /** Receives the code that opened the lock — it may open more on the way in. */
    onUnlock: (code: string) => void;
    onCancel?: () => void;
}) {
    const t = useT();
    const [entry, setEntry] = useState('');
    const [error, setError] = useState(false);
    const entryRef = useRef(entry);
    entryRef.current = entry;

    // A new target starts from scratch — never carry a half-typed code over.
    useEffect(() => {
        setEntry('');
        setError(false);
    }, [scope, name, pin]);

    const submit = (value: string) => {
        if (value === pin) {
            onUnlock(value);
            return;
        }
        setError(true);
        setEntry('');
    };

    const push = (digit: string) => {
        setError(false);
        const next = (entryRef.current + digit).slice(0, Math.max(pin.length, entryRef.current.length + 1));
        setEntry(next);
        // Auto-check once the entry is as long as the code; a wrong code of the
        // same length is reported immediately instead of silently swallowing keys.
        if (next.length >= pin.length) submit(next);
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
    }, [pin, onCancel, onUnlock]);

    const dots = Math.max(pin.length, entry.length, 4);

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

                <div className="flex items-center gap-2.5" style={{ minHeight: 16 }}>
                    {Array.from({ length: dots }, (_, i) => (
                        <span
                            key={i}
                            className="rounded-full transition-all"
                            style={{
                                width: 11,
                                height: 11,
                                background:
                                    i < entry.length
                                        ? error
                                            ? 'var(--color-error, #ef4444)'
                                            : 'var(--accent)'
                                        : 'var(--app-border)',
                            }}
                        />
                    ))}
                </div>

                <div
                    className="text-[11px] text-center"
                    style={{ minHeight: 14, color: 'var(--color-error, #ef4444)' }}
                >
                    {error ? t('pin.wrong') : ''}
                </div>

                <div className="grid grid-cols-3 gap-2 w-full">
                    {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                        <PadButton key={d} onClick={() => push(d)}>
                            {d}
                        </PadButton>
                    ))}
                    <PadButton onClick={() => setEntry('')} muted>
                        C
                    </PadButton>
                    <PadButton onClick={() => push('0')}>0</PadButton>
                    <PadButton onClick={back} muted>
                        <Delete size={16} />
                    </PadButton>
                </div>

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

function PadButton({ children, onClick, muted }: { children: React.ReactNode; onClick: () => void; muted?: boolean }) {
    return (
        <button
            onClick={onClick}
            className="h-12 rounded-xl text-lg font-medium flex items-center justify-center transition-opacity hover:opacity-80 active:opacity-60 select-none"
            style={{
                background: 'var(--app-bg)',
                border: '1px solid var(--app-border)',
                color: muted ? 'var(--text-secondary)' : 'var(--text-primary)',
            }}
        >
            {children}
        </button>
    );
}
