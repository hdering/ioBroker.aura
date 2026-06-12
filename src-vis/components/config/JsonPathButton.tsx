import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Braces, X } from 'lucide-react';
import { useT } from '../../i18n';
import { usePortalThemeVars } from '../../contexts/PortalTargetContext';
import { splitDpRef, joinDpRef, baseDpId } from '../../utils/dpRef';

interface JsonPathButtonProps {
    /** Full datapoint reference (may already carry a `#path` suffix). */
    value: string | undefined | null;
    /** Receives the recombined reference (base id + path). */
    onChange: (ref: string) => void;
    /** Icon size — match the sibling picker button. */
    size?: number;
}

/**
 * Compact control to attach a JSON path to a datapoint that holds an
 * object / JSON-string value (e.g. `…battery#soc`). Sits next to the DP
 * picker button; clicking opens a small popover instead of adding a row.
 */
export function JsonPathButton({ value, onChange, size = 13 }: JsonPathButtonProps) {
    const t = useT();
    const themeVars = usePortalThemeVars();
    const baseId = baseDpId(value);
    const path = splitDpRef(value).path ?? '';

    const [open, setOpen] = useState(false);
    const btnRef = useRef<HTMLButtonElement | null>(null);
    const popRef = useRef<HTMLDivElement | null>(null);
    const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

    const active = path.length > 0;
    const disabled = !baseId;

    useLayoutEffect(() => {
        if (!open || !btnRef.current) return;
        const r = btnRef.current.getBoundingClientRect();
        const width = 260;
        // Right-align the popover under the button, clamped to the viewport.
        const left = Math.max(8, Math.min(window.innerWidth - width - 8, r.right - width));
        setPos({ left, top: r.bottom + 6 });
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            const target = e.target as Node;
            if (popRef.current?.contains(target) || btnRef.current?.contains(target)) return;
            setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        window.addEventListener('mousedown', onDown, true);
        window.addEventListener('keydown', onKey, true);
        return () => {
            window.removeEventListener('mousedown', onDown, true);
            window.removeEventListener('keydown', onKey, true);
        };
    }, [open]);

    const apply = (next: string) => onChange(joinDpRef(baseId, next));

    return (
        <>
            <button
                ref={btnRef}
                type="button"
                disabled={disabled}
                onClick={() => setOpen((v) => !v)}
                title={t('wf.edit.jsonPath')}
                className="px-2 rounded-lg hover:opacity-80 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed relative"
                style={{
                    background: active ? 'color-mix(in srgb, var(--accent) 18%, var(--app-bg))' : 'var(--app-bg)',
                    color: active ? 'var(--accent)' : 'var(--text-secondary)',
                    border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                }}
            >
                <Braces size={size} />
            </button>
            {open &&
                pos &&
                createPortal(
                    <div
                        ref={popRef}
                        style={{
                            ...themeVars,
                            position: 'fixed',
                            left: pos.left,
                            top: pos.top,
                            width: 260,
                            zIndex: 10000,
                            background: 'linear-gradient(var(--app-surface), var(--app-surface)), var(--app-bg)',
                            border: '1px solid var(--app-border)',
                            borderRadius: '0.6rem',
                            padding: '10px',
                            boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
                        }}
                    >
                        <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[11px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                                {t('wf.edit.jsonPath')}
                            </span>
                            <button
                                type="button"
                                onClick={() => setOpen(false)}
                                className="hover:opacity-60"
                                style={{ color: 'var(--text-secondary)' }}
                            >
                                <X size={13} />
                            </button>
                        </div>
                        <div className="flex gap-1">
                            <input
                                autoFocus
                                type="text"
                                value={path}
                                onChange={(e) => apply(e.target.value)}
                                placeholder={t('wf.edit.jsonPathHint')}
                                className="flex-1 text-xs rounded-lg px-2 py-1.5 font-mono focus:outline-none min-w-0"
                                style={{
                                    background: 'var(--app-bg)',
                                    color: 'var(--text-primary)',
                                    border: '1px solid var(--app-border)',
                                }}
                            />
                            {active && (
                                <button
                                    type="button"
                                    onClick={() => apply('')}
                                    title={t('wf.edit.jsonPathClear')}
                                    className="px-2 rounded-lg hover:opacity-80 shrink-0"
                                    style={{
                                        background: 'var(--app-bg)',
                                        color: 'var(--text-secondary)',
                                        border: '1px solid var(--app-border)',
                                    }}
                                >
                                    <X size={13} />
                                </button>
                            )}
                        </div>
                        <p className="text-[10px] mt-1.5 leading-snug" style={{ color: 'var(--text-secondary)' }}>
                            {t('wf.edit.jsonPathDesc')}
                        </p>
                    </div>,
                    document.body,
                )}
        </>
    );
}
