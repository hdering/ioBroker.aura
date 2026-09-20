// One row of a scope tree (Design: Global → Layout → Bereich; Layouts: Layout →
// Bereich). Shared so both admin pages render the same left rail.

import { OVERRIDE_COLOR } from './scopeBands';

interface ScopeRowProps {
    active: boolean;
    onClick: () => void;
    label: string;
    sub?: string;
    iconNode: React.ReactNode;
    /** Small trailing text (e.g. a tab count). */
    trailing?: string;
    /** Own values this scope carries — shown as an orange counter (0 hides it). */
    badge?: number;
    /** Extra props for the outer button (drag handles, test hooks, tooltips). */
    buttonProps?: React.ButtonHTMLAttributes<HTMLButtonElement>;
}

export function ScopeRow({ active, onClick, label, sub, iconNode, trailing, badge, buttonProps }: ScopeRowProps) {
    return (
        <button
            {...buttonProps}
            onClick={onClick}
            className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-colors hover:opacity-90 ${buttonProps?.className ?? ''}`}
            style={{
                background: active ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent',
                border: `1px solid ${active ? 'var(--accent)' : 'transparent'}`,
                color: active ? 'var(--accent)' : 'var(--text-primary)',
                ...buttonProps?.style,
            }}
        >
            <span
                className="w-6 h-6 flex items-center justify-center shrink-0 rounded"
                style={{ background: active ? 'transparent' : 'var(--app-bg)' }}
            >
                {iconNode}
            </span>
            <span className="flex-1 min-w-0">
                <span className="block text-xs font-medium truncate">{label}</span>
                {sub && (
                    <span
                        className="block text-[10px] truncate"
                        style={{ color: active ? 'var(--accent)' : 'var(--text-secondary)', opacity: 0.8 }}
                    >
                        {sub}
                    </span>
                )}
            </span>
            {badge ? (
                <span
                    className="text-[10px] leading-[14px] px-1.5 rounded-full font-semibold shrink-0 tabular-nums"
                    style={{ background: OVERRIDE_COLOR, color: '#fff' }}
                    data-testid="scope-own-count"
                >
                    {badge}
                </span>
            ) : null}
            {trailing && (
                <span
                    className="text-[10px] shrink-0 tabular-nums"
                    style={{ color: active ? 'var(--accent)' : 'var(--text-secondary)', opacity: 0.8 }}
                >
                    {trailing}
                </span>
            )}
        </button>
    );
}
