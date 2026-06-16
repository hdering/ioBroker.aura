import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FunctionSquare, X } from 'lucide-react';
import { usePortalThemeVars } from '../../contexts/PortalTargetContext';
import { matchValueTransformPreset } from '../../utils/valueTransform';
import { ValueTransformFields, type ValueTransformPatch } from './ValueTransformFields';

interface ValueTransformButtonProps {
    factor?: number;
    offset?: number;
    onPatch: (patch: ValueTransformPatch) => void;
    /** When true, selecting a preset also fills the `unit` field. */
    fillUnit?: boolean;
    /** Icon size — match the sibling picker / JSON-path buttons. */
    size?: number;
}

/**
 * Compact control to attach a display-only value transform (factor/offset) to a
 * datapoint. Sits next to the DP picker button; clicking opens a small popover
 * with the preset dropdown + manual fields instead of taking inline space.
 */
export function ValueTransformButton({
    factor,
    offset,
    onPatch,
    fillUnit = false,
    size = 13,
}: ValueTransformButtonProps) {
    const themeVars = usePortalThemeVars();
    const [open, setOpen] = useState(false);
    const btnRef = useRef<HTMLButtonElement | null>(null);
    const popRef = useRef<HTMLDivElement | null>(null);
    const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

    const active = matchValueTransformPreset(factor, offset) !== 'none';

    useLayoutEffect(() => {
        if (!open || !btnRef.current) return;
        const r = btnRef.current.getBoundingClientRect();
        const width = 280;
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

    return (
        <>
            <button
                ref={btnRef}
                type="button"
                onClick={() => setOpen((v) => !v)}
                title="Umrechnung (nur Anzeige)"
                className="px-2 rounded-lg hover:opacity-80 shrink-0 relative"
                style={{
                    background: active ? 'color-mix(in srgb, var(--accent) 18%, var(--app-bg))' : 'var(--app-bg)',
                    color: active ? 'var(--accent)' : 'var(--text-secondary)',
                    border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                }}
            >
                <FunctionSquare size={size} />
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
                            width: 280,
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
                                Wert-Umrechnung
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
                        <ValueTransformFields factor={factor} offset={offset} onPatch={onPatch} fillUnit={fillUnit} />
                    </div>,
                    document.body,
                )}
        </>
    );
}
