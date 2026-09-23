// Shared setting-control primitives used by the Design/Settings section components
// (Header, Layout menu, Behavior). Extracted from the former FrontendSection so the
// pieces can live on different admin pages without duplicating the markup.

import { useRef, useEffect } from 'react';
import { OVERRIDE_COLOR, OVERRIDE_TINT } from './scopeBands';

export function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
    return (
        <button
            onClick={() => onChange(!value)}
            className="relative w-9 h-5 rounded-full transition-colors duration-200 focus:outline-none shrink-0"
            style={{ background: value ? 'var(--accent-green)' : 'var(--app-border)' }}
        >
            <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${value ? 'translate-x-4' : 'translate-x-0'}`}
            />
        </button>
    );
}

/** The orange override bar + tint a control gets when this scope sets its own value. */
export const OVERRIDE_ROW_STYLE: React.CSSProperties = {
    boxShadow: `inset 3px 0 0 ${OVERRIDE_COLOR}`,
    paddingLeft: 12,
    marginLeft: -12,
    background: `linear-gradient(90deg, ${OVERRIDE_TINT}, transparent 45%)`,
    borderRadius: '0 8px 8px 0',
};

/**
 * Any non-toggle control (buttons, inputs, lists) with the same override
 * marking as ToggleRow: orange bar while overridden, the state line below.
 */
export function OverrideField({
    isOverridden,
    info,
    className,
    children,
}: {
    isOverridden?: boolean;
    /** Override state line (usually an <OverrideState>) shown under the control. */
    info?: React.ReactNode;
    className?: string;
    children: React.ReactNode;
}) {
    return (
        <div
            className={`py-1 ${className ?? ''}`}
            style={isOverridden ? OVERRIDE_ROW_STYLE : undefined}
            data-overridden={isOverridden ? 'true' : undefined}
        >
            {children}
            {info && <div className="mt-1.5">{info}</div>}
        </div>
    );
}

export function ToggleRow({
    label,
    hint,
    value,
    onChange,
    isOverridden,
    info,
}: {
    label: string;
    hint?: string;
    value: boolean;
    onChange: (v: boolean) => void;
    /** This scope sets its own value — the row gets the orange override bar. */
    isOverridden?: boolean;
    /** Override state line (usually an <OverrideState>) shown under the label. */
    info?: React.ReactNode;
}) {
    return (
        <div
            className="flex items-center justify-between gap-3 py-2 border-b last:border-b-0"
            style={{ borderColor: 'var(--app-border)', ...(isOverridden ? OVERRIDE_ROW_STYLE : {}) }}
            data-overridden={isOverridden ? 'true' : undefined}
        >
            <div className="min-w-0">
                <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                    {label}
                </p>
                {hint && (
                    <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                        {hint}
                    </p>
                )}
                {info && <div className="mt-1">{info}</div>}
            </div>
            <Toggle value={value} onChange={onChange} />
        </div>
    );
}

/** Indented, accent-bordered container that visually groups the sub-settings of an enabled toggle. */
export function SubGroup({ children }: { children: React.ReactNode }) {
    return (
        <div className="ml-1.5 pl-3 my-1 py-1 space-y-2 border-l-2" style={{ borderColor: 'var(--accent)' }}>
            {children}
        </div>
    );
}

export function Card({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div
            className="rounded-xl p-4 space-y-3"
            style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
        >
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>
                {title}
            </p>
            {children}
        </div>
    );
}

// A single-line-looking textarea that grows in height as more lines are typed,
// so multi-line (HTML) templates stay fully visible while editing.
export function AutoGrowTextarea({
    value,
    onChange,
    placeholder,
    className,
    style,
}: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    className?: string;
    style?: React.CSSProperties;
}) {
    const ref = useRef<HTMLTextAreaElement>(null);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight}px`;
    }, [value]);
    return (
        <textarea
            ref={ref}
            rows={1}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className={className}
            style={{ ...style, resize: 'none', overflow: 'hidden' }}
        />
    );
}
