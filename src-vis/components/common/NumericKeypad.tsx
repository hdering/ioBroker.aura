import type { ReactNode } from 'react';
import { Delete } from 'lucide-react';

/**
 * The 3×4 digit pad shared by every touch PIN entry (section/tab lock, alarm
 * disarm #911): 1–9, then clear · 0 · backspace. Holds no state — the caller owns
 * the entry and decides when to submit.
 */
export function NumericKeypad({
    onDigit,
    onClear,
    onBack,
}: {
    onDigit: (digit: string) => void;
    onClear: () => void;
    onBack: () => void;
}) {
    return (
        <div className="aura-keypad grid grid-cols-3 gap-2 w-full">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                <PadButton key={d} onClick={() => onDigit(d)}>
                    {d}
                </PadButton>
            ))}
            <PadButton onClick={onClear} muted>
                C
            </PadButton>
            <PadButton onClick={() => onDigit('0')}>0</PadButton>
            <PadButton onClick={onBack} muted>
                <Delete size={16} />
            </PadButton>
        </div>
    );
}

/** One dot per typed digit (at least `min`), red while `error` is set. */
export function PinDots({ count, filled, error }: { count: number; filled: number; error?: boolean }) {
    return (
        <div className="aura-pin-dots flex items-center gap-2.5" style={{ minHeight: 16 }}>
            {Array.from({ length: count }, (_, i) => (
                <span
                    key={i}
                    className="rounded-full transition-all"
                    style={{
                        width: 11,
                        height: 11,
                        background:
                            i < filled
                                ? error
                                    ? 'var(--color-error, #ef4444)'
                                    : 'var(--accent)'
                                : 'var(--app-border)',
                    }}
                />
            ))}
        </div>
    );
}

function PadButton({ children, onClick, muted }: { children: ReactNode; onClick: () => void; muted?: boolean }) {
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
