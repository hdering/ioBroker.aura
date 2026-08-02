import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Hash, X } from 'lucide-react';
import { usePortalThemeVars } from '../../contexts/PortalTargetContext';
import { NUMBER_FORMAT_SAMPLES, type NumberFormat } from '../../utils/formatValue';
import { NumberFormatSetting } from './NumberFormatSetting';
import { useT } from '../../i18n';

interface NumberFormatButtonProps {
    /** undefined = inherit the global default */
    decimals: number | undefined;
    /** undefined = inherit the global default */
    numberFormat: NumberFormat | undefined;
    onChange: (patch: { decimals?: number; numberFormat?: NumberFormat }) => void;
    /** Override the decimals label (e.g. "Dezimalstellen (Tooltip)" in the chart config). */
    decimalsLabel?: string;
    /**
     * Render the button as a labelled field (label above, like the sibling inputs)
     * so it lines up inside the options panel's flex/grid rows. Omit where the
     * button sits next to a sibling icon button (DP picker, value transform).
     */
    label?: string;
    /** Icon size — match the sibling picker / value-transform buttons. */
    size?: number;
}

/**
 * Compact entry point to the per-target number formatting (decimals + thousands
 * separator). Mirrors ValueTransformButton: a small icon button that opens a
 * popover, so the options panel stays short. The button is highlighted while an
 * override is set — an unset target simply follows the global setting.
 */
export function NumberFormatButton({
    decimals,
    numberFormat,
    onChange,
    decimalsLabel,
    label,
    size = 13,
}: NumberFormatButtonProps) {
    const t = useT();
    const themeVars = usePortalThemeVars();
    const [open, setOpen] = useState(false);
    const btnRef = useRef<HTMLButtonElement | null>(null);
    const popRef = useRef<HTMLDivElement | null>(null);
    const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

    const active = decimals !== undefined || numberFormat !== undefined;

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

    // Summary of the active override, so the closed button still says what it does.
    const summary = active
        ? [decimals !== undefined ? `${decimals}` : null, numberFormat ? NUMBER_FORMAT_SAMPLES[numberFormat] : null]
              .filter(Boolean)
              .join(' · ')
        : t('config.numberFormat.global');

    const button = (
        <button
            ref={btnRef}
            type="button"
            onClick={() => setOpen((v) => !v)}
            title={t('config.numberFormat.buttonTitle')}
            className={`flex items-center gap-1.5 rounded-lg hover:opacity-80 shrink-0 ${label ? 'w-full px-2 py-2 text-xs' : 'px-2 py-1'}`}
            style={{
                background: active ? 'color-mix(in srgb, var(--accent) 18%, var(--app-bg))' : 'var(--app-bg)',
                color: active ? 'var(--accent)' : 'var(--text-secondary)',
                border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
            }}
        >
            <Hash size={size} className="shrink-0" />
            {label && <span className="truncate">{summary}</span>}
        </button>
    );

    return (
        <>
            {label ? (
                <div className="min-w-0">
                    <label className="text-[11px] mb-1 block truncate" style={{ color: 'var(--text-secondary)' }}>
                        {label}
                    </label>
                    {button}
                </div>
            ) : (
                button
            )}
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
                                {t('config.numberFormat.popoverTitle')}
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
                        <NumberFormatSetting
                            decimals={decimals}
                            numberFormat={numberFormat}
                            onChange={onChange}
                            decimalsLabel={decimalsLabel}
                        />
                    </div>,
                    document.body,
                )}
        </>
    );
}
