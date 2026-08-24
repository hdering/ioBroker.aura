import { Info } from 'lucide-react';

interface InactiveNoticeProps {
    /** Why the setting below has no effect right now. */
    text: string;
    /** Optional call to action — jumps to (or resets) whatever overrides the setting. */
    actionLabel?: string;
    onAction?: () => void;
}

/**
 * Explains why a settings card is inert instead of letting the user click into
 * a preference that silently does nothing — e.g. the theme presets while
 * "theme follows browser" is on, or while a dark/light-mode datapoint is set.
 */
export function InactiveNotice({ text, actionLabel, onAction }: InactiveNoticeProps) {
    return (
        <div
            className="flex items-start gap-2 rounded-lg px-3 py-2 mb-4"
            style={{
                background: 'color-mix(in srgb, var(--accent-yellow) 12%, transparent)',
                border: '1px solid color-mix(in srgb, var(--accent-yellow) 45%, transparent)',
            }}
        >
            <Info size={14} className="shrink-0 mt-0.5" style={{ color: 'var(--accent-yellow)' }} />
            <p className="text-xs leading-relaxed flex-1 min-w-0" style={{ color: 'var(--text-primary)' }}>
                {text}
                {actionLabel && onAction && (
                    <>
                        {' '}
                        <button
                            onClick={onAction}
                            className="underline hover:opacity-80"
                            style={{ color: 'var(--accent)' }}
                        >
                            {actionLabel}
                        </button>
                    </>
                )}
            </p>
        </div>
    );
}
