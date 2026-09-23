// Small presentational building blocks of the Layouts page (master-detail).
// Everything here follows the card language of the Settings and Design pages:
// uppercase card labels, labelled buttons, one "⋯" menu instead of icon rows.

import { forwardRef, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Ellipsis, Pencil, X } from 'lucide-react';
import { usePortalTarget } from '../../../../contexts/PortalTargetContext';

export const inputCls = 'text-sm rounded-xl px-3 py-2 focus:outline-none w-full';
export const inputStyle: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};

// ── Buttons ───────────────────────────────────────────────────────────────────

type BtnVariant = 'primary' | 'secondary' | 'ghost';

export function Btn({
    variant = 'secondary',
    small,
    className = '',
    style,
    ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; small?: boolean }) {
    const base = small ? 'px-2.5 py-1.5 rounded-lg text-xs' : 'px-3 py-2 rounded-xl text-sm';
    const look: React.CSSProperties =
        variant === 'primary'
            ? { background: 'var(--accent)', color: '#fff' }
            : variant === 'ghost'
              ? { background: 'transparent', color: 'var(--text-secondary)' }
              : {
                    background: 'var(--app-surface)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--app-border)',
                };
    return (
        <button
            {...rest}
            className={`inline-flex items-center gap-1.5 font-medium hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap ${base} ${className}`}
            style={{ ...look, ...style }}
        />
    );
}

/** Square icon button (28 px) with a hairline border — the "⋯" trigger and eye toggles. */
export const IconBtn = forwardRef<
    HTMLButtonElement,
    React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; muted?: boolean }
>(function IconBtn({ active, muted, className = '', style, ...rest }, ref) {
    return (
        <button
            ref={ref}
            {...rest}
            className={`w-7 h-7 flex items-center justify-center rounded-lg hover:opacity-80 shrink-0 ${className}`}
            style={{
                background: active ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'var(--app-bg)',
                color: active ? 'var(--accent)' : 'var(--text-secondary)',
                border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                opacity: muted ? 0.45 : 1,
                ...style,
            }}
        />
    );
});

// ── Chips ─────────────────────────────────────────────────────────────────────

export function Chip({
    tone = 'neutral',
    children,
    title,
}: {
    tone?: 'neutral' | 'accent' | 'ok';
    children: React.ReactNode;
    title?: string;
}) {
    const look: React.CSSProperties =
        tone === 'accent'
            ? { background: 'color-mix(in srgb, var(--accent) 15%, transparent)', color: 'var(--accent)' }
            : tone === 'ok'
              ? { background: 'color-mix(in srgb, var(--accent-green) 15%, transparent)', color: 'var(--accent-green)' }
              : { background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' };
    return (
        <span
            title={title}
            className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap"
            style={look}
        >
            {children}
        </span>
    );
}

// ── Cards ─────────────────────────────────────────────────────────────────────

/** Card with the uppercase label of the Settings page; `actions` sit on the label row. */
export function Card({
    title,
    actions,
    children,
    padded = true,
    footer,
    testId,
}: {
    title: string;
    actions?: React.ReactNode;
    children: React.ReactNode;
    padded?: boolean;
    footer?: React.ReactNode;
    testId?: string;
}) {
    return (
        <div
            data-testid={testId}
            className="rounded-xl overflow-hidden"
            style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
        >
            <div
                className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3 ${padded ? '' : 'border-b'}`}
                style={{ borderColor: 'var(--app-border)' }}
            >
                <p
                    className="text-xs font-semibold uppercase tracking-widest"
                    style={{ color: 'var(--text-secondary)' }}
                >
                    {title}
                </p>
                {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
            </div>
            <div className={padded ? 'px-4 pb-4 space-y-3' : ''}>{children}</div>
            {footer && (
                <div
                    className="px-4 py-2 text-[11px] border-t"
                    style={{ color: 'var(--text-secondary)', borderColor: 'var(--app-border)', opacity: 0.8 }}
                >
                    {footer}
                </div>
            )}
        </div>
    );
}

/** Label + control stacked, for the "Allgemein" cards. */
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <span className="block text-xs font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                {label}
            </span>
            {children}
        </div>
    );
}

/** Boxed read-only-looking value with inline edit — the "input" of the Allgemein card. */
export function FieldBox({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    return (
        <div
            className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm min-h-[38px] ${className}`}
            style={inputStyle}
        >
            {children}
        </div>
    );
}

/** Row with title, hint and a trailing control (toggle, select, button). */
export function SettingRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <div
            className="flex items-center justify-between gap-3 py-2 border-b last:border-b-0"
            style={{ borderColor: 'var(--app-border)' }}
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
            </div>
            <div className="shrink-0 flex items-center gap-2">{children}</div>
        </div>
    );
}

// ── Inline editable text ──────────────────────────────────────────────────────

/**
 * Read view with a pencil; click turns it into an input. Enter/blur commit,
 * Escape reverts. `transform` normalises while typing (slug rules).
 */
export function InlineEdit({
    value,
    onCommit,
    transform,
    mono,
    prefix,
    className = '',
    inputClassName = '',
    title,
    testId,
}: {
    value: string;
    onCommit: (v: string) => void;
    transform?: (v: string) => string;
    mono?: boolean;
    prefix?: string;
    className?: string;
    inputClassName?: string;
    title?: string;
    testId?: string;
}) {
    const [editing, setEditing] = useState(false);
    const [val, setVal] = useState(value);
    useEffect(() => {
        if (!editing) setVal(value);
    }, [value, editing]);

    const commit = () => {
        const v = val.trim();
        if (v && v !== value) onCommit(v);
        setEditing(false);
    };

    if (editing) {
        return (
            <span className={`inline-flex items-center gap-1.5 ${className}`}>
                {prefix && (
                    <span className="text-[10px] font-mono" style={{ color: 'var(--text-secondary)' }}>
                        {prefix}
                    </span>
                )}
                <input
                    autoFocus
                    value={val}
                    data-testid={testId}
                    onChange={(e) => setVal(transform ? transform(e.target.value) : e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') commit();
                        if (e.key === 'Escape') {
                            setVal(value);
                            setEditing(false);
                        }
                    }}
                    onBlur={commit}
                    className={`rounded-lg px-2 py-1 focus:outline-none ${mono ? 'font-mono text-xs' : 'text-sm'} ${inputClassName}`}
                    style={{
                        background: 'var(--app-bg)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--accent)',
                    }}
                />
                <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={commit}
                    style={{ color: 'var(--accent-green)' }}
                >
                    <Check size={14} />
                </button>
                <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                        setVal(value);
                        setEditing(false);
                    }}
                    style={{ color: 'var(--text-secondary)' }}
                >
                    <X size={14} />
                </button>
            </span>
        );
    }
    return (
        <span className={`inline-flex items-center min-w-0 ${prefix ? 'gap-1' : 'gap-1.5'} ${className}`}>
            {prefix && (
                <span className="text-[10px] font-mono" style={{ color: 'var(--text-secondary)' }}>
                    {prefix}
                </span>
            )}
            <span className={`truncate ${mono ? 'font-mono text-xs' : ''}`} data-testid={testId}>
                {value}
            </span>
            <button
                onClick={() => setEditing(true)}
                title={title}
                data-testid={testId ? `${testId}-edit` : undefined}
                className="hover:opacity-70 shrink-0"
                style={{ color: 'var(--text-secondary)' }}
            >
                <Pencil size={mono ? 10 : 12} />
            </button>
        </span>
    );
}

/** Slug normaliser shared by layout, section and tab slugs. */
export const slugTransform = (v: string) => v.toLowerCase().replace(/[^a-z0-9-]/g, '-');

// ── "⋯" action menu ───────────────────────────────────────────────────────────

export interface MenuItem {
    key: string;
    label: string;
    icon?: React.ReactNode;
    onClick: () => void;
    danger?: boolean;
    disabled?: boolean;
    disabledHint?: string;
    /** Two-step: first click arms and shows this label, second click runs. */
    confirm?: string;
}

export function ActionMenu({ items, title, testId }: { items: MenuItem[]; title?: string; testId?: string }) {
    const [open, setOpen] = useState(false);
    const [armed, setArmed] = useState<string | null>(null);
    const [pos, setPos] = useState({ top: 0, left: 0 });
    const btnRef = useRef<HTMLButtonElement>(null);
    const portalTarget = usePortalTarget();
    const W = 232;

    const toggle = () => {
        if (open) {
            setOpen(false);
            return;
        }
        const r = btnRef.current?.getBoundingClientRect();
        if (r) setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.right - W, window.innerWidth - W - 12)) });
        setArmed(null);
        setOpen(true);
    };

    return (
        <>
            <IconBtn ref={btnRef} onClick={toggle} active={open} title={title} data-testid={testId}>
                <Ellipsis size={14} />
            </IconBtn>
            {open &&
                createPortal(
                    <>
                        <div className="fixed inset-0 z-[998]" onClick={() => setOpen(false)} />
                        <div
                            className="fixed z-[999] rounded-xl p-1 shadow-lg"
                            role="menu"
                            data-testid={testId ? `${testId}-menu` : undefined}
                            style={{
                                top: pos.top,
                                left: pos.left,
                                width: W,
                                background: 'var(--app-surface)',
                                border: '1px solid var(--app-border)',
                            }}
                        >
                            {items.map((it) => {
                                const isArmed = armed === it.key;
                                return (
                                    <button
                                        key={it.key}
                                        role="menuitem"
                                        disabled={it.disabled}
                                        title={it.disabled ? it.disabledHint : undefined}
                                        onClick={() => {
                                            if (it.confirm && !isArmed) {
                                                setArmed(it.key);
                                                return;
                                            }
                                            setOpen(false);
                                            it.onClick();
                                        }}
                                        className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs text-left hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
                                        style={{
                                            color: it.danger ? 'var(--accent-red)' : 'var(--text-primary)',
                                            background: isArmed
                                                ? 'color-mix(in srgb, var(--accent-red) 12%, transparent)'
                                                : 'transparent',
                                            fontWeight: isArmed ? 600 : 500,
                                        }}
                                    >
                                        <span className="w-4 flex justify-center shrink-0">{it.icon}</span>
                                        {isArmed ? it.confirm : it.label}
                                    </button>
                                );
                            })}
                        </div>
                    </>,
                    portalTarget,
                )}
        </>
    );
}

// ── Inline prompt (duplicate name, new section …) ─────────────────────────────

export function InlinePrompt({
    label,
    value,
    onChange,
    onSubmit,
    onCancel,
    submitLabel,
    placeholder,
    testId,
}: {
    label?: string;
    value: string;
    onChange: (v: string) => void;
    onSubmit: () => void;
    onCancel: () => void;
    submitLabel: string;
    placeholder?: string;
    testId?: string;
}) {
    return (
        <div
            className="flex items-center gap-2 rounded-xl px-3 py-2.5"
            style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}
        >
            {label && (
                <span className="text-xs shrink-0" style={{ color: 'var(--text-secondary)' }}>
                    {label}
                </span>
            )}
            <input
                autoFocus
                value={value}
                placeholder={placeholder}
                data-testid={testId}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') onSubmit();
                    if (e.key === 'Escape') onCancel();
                }}
                className="text-sm rounded-lg px-2.5 py-1.5 focus:outline-none flex-1 min-w-0"
                style={{
                    background: 'var(--app-surface)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--app-border)',
                }}
            />
            <Btn variant="primary" small onClick={onSubmit}>
                {submitLabel}
            </Btn>
            <button onClick={onCancel} className="hover:opacity-70 shrink-0" style={{ color: 'var(--text-secondary)' }}>
                <X size={16} />
            </button>
        </div>
    );
}

// ── Drag-to-reorder helper ────────────────────────────────────────────────────

/** Shared HTML5 drag state for a vertical list; the caller renders handles/targets. */
export function useListDrag(onMove: (from: number, to: number) => void) {
    const [dragIdx, setDragIdx] = useState<number | null>(null);
    const [overIdx, setOverIdx] = useState<number | null>(null);
    const reset = () => {
        setDragIdx(null);
        setOverIdx(null);
    };
    return {
        dragIdx,
        overIdx,
        handleProps: (idx: number): React.HTMLAttributes<HTMLElement> & { draggable: boolean } => ({
            draggable: true,
            onDragStart: (e) => {
                e.dataTransfer.effectAllowed = 'move';
                setDragIdx(idx);
            },
            onDragEnd: reset,
        }),
        targetProps: (idx: number): React.HTMLAttributes<HTMLElement> => ({
            onDragOver: (e) => {
                e.preventDefault();
                setOverIdx(idx);
            },
            onDragEnter: (e) => {
                e.preventDefault();
                setOverIdx(idx);
            },
            onDrop: (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (dragIdx !== null && dragIdx !== idx) onMove(dragIdx, idx);
                reset();
            },
        }),
        rowStyle: (idx: number): React.CSSProperties => ({
            opacity: dragIdx === idx ? 0.4 : 1,
            ...(overIdx === idx && dragIdx !== null && dragIdx !== idx
                ? { boxShadow: 'inset 0 2px 0 0 var(--accent)' }
                : {}),
        }),
    };
}
