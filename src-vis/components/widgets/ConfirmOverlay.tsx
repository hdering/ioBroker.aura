import { useLayoutEffect, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../../i18n';
import { usePortalTarget } from '../../contexts/PortalTargetContext';

export function ConfirmOverlay({
    text,
    onConfirm,
    onCancel,
    popup,
    anchorRef,
}: {
    text?: string;
    onConfirm: () => void;
    onCancel: () => void;
    /** Render as a small floating popup near `anchorRef` via portal — for use in tiny containers (e.g. universal-widget cells). */
    popup?: boolean;
    /** Anchor element the popup positions itself next to (required for popup mode). */
    anchorRef?: RefObject<HTMLElement | null>;
}) {
    const t = useT();
    const portalTarget = usePortalTarget();
    const prompt = text || t('widget.confirm.defaultPrompt');

    if (popup) {
        return (
            <PopupConfirm
                prompt={prompt}
                yesLabel={t('common.yes')}
                cancelLabel={t('common.cancel')}
                onConfirm={onConfirm}
                onCancel={onCancel}
                portalTarget={portalTarget}
                anchorRef={anchorRef}
            />
        );
    }

    return (
        <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-widget z-10"
            style={{ background: 'color-mix(in srgb, var(--app-card) 92%, transparent)', backdropFilter: 'blur(4px)' }}
            onClick={(e) => e.stopPropagation()}
        >
            <p className="text-xs text-center px-3 font-medium" style={{ color: 'var(--text-primary)' }}>
                {prompt}
            </p>
            <div className="flex gap-2">
                <button
                    onClick={onConfirm}
                    className="px-3 py-1 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
                    style={{ background: 'var(--accent)', color: '#fff', border: 'none' }}
                >
                    {t('common.yes')}
                </button>
                <button
                    onClick={onCancel}
                    className="px-3 py-1 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
                    style={{
                        background: 'var(--app-bg)',
                        color: 'var(--text-secondary)',
                        border: '1px solid var(--app-border)',
                    }}
                >
                    {t('common.cancel')}
                </button>
            </div>
        </div>
    );
}

type Vars = {
    appBg: string;
    appSurface: string;
    appBorder: string;
    textPrimary: string;
    textSecondary: string;
    accent: string;
};

function readVars(el: HTMLElement): Vars {
    const s = getComputedStyle(el);
    const v = (k: string, fallback: string) => s.getPropertyValue(k).trim() || fallback;
    return {
        appBg: v('--app-bg', '#ffffff'),
        appSurface: v('--app-surface', '#ffffff'),
        appBorder: v('--app-border', '#e5e7eb'),
        textPrimary: v('--text-primary', '#111827'),
        textSecondary: v('--text-secondary', '#6b7280'),
        accent: v('--accent', '#3b82f6'),
    };
}

function PopupConfirm({
    prompt,
    yesLabel,
    cancelLabel,
    onConfirm,
    onCancel,
    portalTarget,
    anchorRef,
}: {
    prompt: string;
    yesLabel: string;
    cancelLabel: string;
    onConfirm: () => void;
    onCancel: () => void;
    portalTarget: Element;
    anchorRef?: RefObject<HTMLElement | null>;
}) {
    const [pos, setPos] = useState<{ top: number; left: number; placeAbove: boolean } | null>(null);
    const [vars, setVars] = useState<Vars | null>(null);

    useLayoutEffect(() => {
        const el = anchorRef?.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const margin = 6;
        const popupH = 70;
        const placeAbove = r.bottom + margin + popupH > window.innerHeight;
        const top = placeAbove ? r.top - margin : r.bottom + margin;
        const left = r.left + r.width / 2;
        setPos({ top, left, placeAbove });
        setVars(readVars(el));
    }, [anchorRef]);

    return createPortal(
        <>
            <div
                className="fixed inset-0 z-[399]"
                style={{ background: 'transparent' }}
                onClick={(e) => {
                    e.stopPropagation();
                    onCancel();
                }}
            />
            <div
                className="fixed z-[400] rounded-xl shadow-2xl px-3 py-2 flex flex-col items-center gap-1.5"
                style={{
                    background: vars?.appSurface ?? '#ffffff',
                    border: `1px solid ${vars?.appBorder ?? '#e5e7eb'}`,
                    top: pos?.top ?? -9999,
                    left: pos?.left ?? -9999,
                    transform: pos?.placeAbove ? 'translate(-50%, -100%)' : 'translateX(-50%)',
                    visibility: pos && vars ? 'visible' : 'hidden',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <p className="text-xs text-center font-medium whitespace-nowrap" style={{ color: vars?.textPrimary }}>
                    {prompt}
                </p>
                <div className="flex gap-1.5">
                    <button
                        onClick={onConfirm}
                        className="px-2.5 py-1 rounded-md text-xs font-medium transition-opacity hover:opacity-80"
                        style={{ background: vars?.accent, color: '#fff', border: 'none' }}
                    >
                        {yesLabel}
                    </button>
                    <button
                        onClick={onCancel}
                        className="px-2.5 py-1 rounded-md text-xs font-medium transition-opacity hover:opacity-80"
                        style={{
                            background: vars?.appBg,
                            color: vars?.textSecondary,
                            border: `1px solid ${vars?.appBorder}`,
                        }}
                    >
                        {cancelLabel}
                    </button>
                </div>
            </div>
        </>,
        portalTarget,
    );
}
