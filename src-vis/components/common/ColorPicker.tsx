/**
 * ColorPicker — a drop-in replacement for the raw `<input type="color">` used
 * throughout the widget configs, with an added 0–100% transparency (alpha)
 * control that the native picker cannot provide.
 *
 * The trigger is a color swatch (same footprint as the old inputs, so it slots
 * into existing tight config rows via `className`/`style`). Clicking it opens a
 * small popover — portaled (usePortalTarget) so it is not clipped by scrolling
 * config panels — containing the native RGB picker, a hex text field and an
 * alpha slider.
 *
 * Emitted value stays backward-compatible: `#RRGGBB` while fully opaque, and
 * `#RRGGBBAA` (valid CSS, accepted by chart libs and `startsWith('#')` checks)
 * only once alpha < 100. Non-hex inputs (CSS vars, rgb()) are parsed when
 * possible and otherwise fall back to `fallback` at 100% opacity.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePortalTarget } from '../../contexts/PortalTargetContext';

interface Props {
    /** Current color: `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()/rgba()` or a CSS var. */
    value: string;
    /** Called with the new color string (`#rrggbb` or `#rrggbbaa`). */
    onChange: (value: string) => void;
    /** Hex used when `value` is not a parseable colour (default `#888888`). */
    fallback?: string;
    /** Enable the transparency slider (default true). */
    alpha?: boolean;
    title?: string;
    /** Extra classes on the swatch button (carry sizing from the old input). */
    className?: string;
    /** Inline style on the swatch button (carry width/height/border). */
    style?: React.CSSProperties;
    disabled?: boolean;
}

/**
 * Only one popover may be open at a time. Opening a picker dispatches this event
 * with its own id; every other picker listens and closes itself. This does not
 * rely on click bubbling, so it works even inside config dialogs that stop
 * `mousedown` propagation (grid-drag/nodrag guards).
 */
const PICKER_OPEN_EVENT = 'aura:colorpicker-open';
let pickerSeq = 0;

const CHECKERBOARD: React.CSSProperties = {
    backgroundImage:
        'linear-gradient(45deg,#bbb 25%,transparent 25%),linear-gradient(-45deg,#bbb 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#bbb 75%),linear-gradient(-45deg,transparent 75%,#bbb 75%)',
    backgroundSize: '8px 8px',
    backgroundPosition: '0 0,0 4px,4px -4px,-4px 0',
    backgroundColor: '#fff',
};

function normalizeHex6(hex: string): string {
    const m = (hex || '').trim().match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
    if (!m) return '#888888';
    let h = m[1];
    if (h.length === 3)
        h = h
            .split('')
            .map((c) => c + c)
            .join('');
    return `#${h.toLowerCase()}`;
}

/** Parse any supported colour string into a 6-digit hex + alpha percent. */
export function parseColor(value: string, fallback = '#888888'): { hex6: string; alpha: number } {
    const v = (value ?? '').trim();
    const hex = v.match(/^#([0-9a-fA-F]{3,8})$/);
    if (hex) {
        let h = hex[1];
        if (h.length === 3 || h.length === 4)
            h = h
                .split('')
                .map((c) => c + c)
                .join('');
        if (h.length === 6) return { hex6: `#${h.toLowerCase()}`, alpha: 100 };
        if (h.length === 8) {
            const a = parseInt(h.slice(6, 8), 16);
            return { hex6: `#${h.slice(0, 6).toLowerCase()}`, alpha: Math.round((a / 255) * 100) };
        }
    }
    const rgba = v.match(/rgba?\(([^)]+)\)/i);
    if (rgba) {
        const parts = rgba[1].split(',').map((s) => s.trim());
        if (parts.length >= 3) {
            const toH = (x: string) =>
                Math.max(0, Math.min(255, Math.round(parseFloat(x))))
                    .toString(16)
                    .padStart(2, '0');
            const alpha =
                parts[3] !== undefined ? Math.max(0, Math.min(100, Math.round(parseFloat(parts[3]) * 100))) : 100;
            return { hex6: `#${toH(parts[0])}${toH(parts[1])}${toH(parts[2])}`, alpha };
        }
    }
    return { hex6: normalizeHex6(fallback), alpha: 100 };
}

/** Combine a 6-digit hex + alpha percent into `#rrggbb` (opaque) or `#rrggbbaa`. */
export function combineColor(hex6: string, alpha: number): string {
    const base = normalizeHex6(hex6);
    if (alpha >= 100) return base;
    const a = Math.max(0, Math.min(255, Math.round((alpha / 100) * 255)))
        .toString(16)
        .padStart(2, '0');
    return `${base}${a}`;
}

export function ColorPicker({
    value,
    onChange,
    fallback = '#888888',
    alpha: alphaEnabled = true,
    title,
    className,
    style,
    disabled,
}: Props) {
    const [open, setOpen] = useState(false);
    const anchorRef = useRef<HTMLButtonElement>(null);
    const idRef = useRef(0);
    if (idRef.current === 0) idRef.current = ++pickerSeq;

    // Close this picker when another one opens.
    useEffect(() => {
        const onOtherOpen = (e: Event) => {
            if ((e as CustomEvent<number>).detail !== idRef.current) setOpen(false);
        };
        window.addEventListener(PICKER_OPEN_EVENT, onOtherOpen);
        return () => window.removeEventListener(PICKER_OPEN_EVENT, onOtherOpen);
    }, []);

    const toggle = () => {
        if (disabled) return;
        setOpen((v) => {
            const next = !v;
            if (next) window.dispatchEvent(new CustomEvent(PICKER_OPEN_EVENT, { detail: idRef.current }));
            return next;
        });
    };

    const { hex6, alpha } = parseColor(value, fallback);

    const swatchColor = combineColor(hex6, alphaEnabled ? alpha : 100);

    return (
        <>
            <button
                ref={anchorRef}
                type="button"
                disabled={disabled}
                title={title}
                onClick={toggle}
                className={className ?? 'shrink-0 rounded cursor-pointer'}
                style={{
                    width: '28px',
                    height: '30px',
                    border: '1px solid var(--app-border)',
                    padding: 0,
                    ...style,
                    ...CHECKERBOARD,
                }}
            >
                <span
                    aria-hidden
                    style={{
                        display: 'block',
                        width: '100%',
                        height: '100%',
                        borderRadius: 'inherit',
                        background: swatchColor,
                    }}
                />
            </button>
            {open && (
                <ColorPopover
                    anchorRef={anchorRef}
                    hex6={hex6}
                    alpha={alpha}
                    alphaEnabled={alphaEnabled}
                    onChange={onChange}
                    onClose={() => setOpen(false)}
                />
            )}
        </>
    );
}

function ColorPopover({
    anchorRef,
    hex6,
    alpha,
    alphaEnabled,
    onChange,
    onClose,
}: {
    anchorRef: React.RefObject<HTMLButtonElement>;
    hex6: string;
    alpha: number;
    alphaEnabled: boolean;
    onChange: (value: string) => void;
    onClose: () => void;
}) {
    const portalTarget = usePortalTarget();
    const panelRef = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        const panel = panelRef.current;
        const anchor = anchorRef.current;
        if (!panel || !anchor) return;

        const cs = getComputedStyle(anchor);
        for (const name of ['--app-surface', '--app-bg', '--app-border', '--text-primary', '--text-secondary']) {
            const v = cs.getPropertyValue(name).trim();
            if (v) panel.style.setProperty(name, v);
        }

        const p = panel.getBoundingClientRect();
        const a = anchor.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const GAP = 4;

        let left = a.left;
        if (left + p.width > vw - GAP) left = vw - GAP - p.width;
        if (left < GAP) left = GAP;

        let top = a.bottom + GAP;
        if (top + p.height > vh - GAP) top = a.top - p.height - GAP;
        if (top < GAP) top = GAP;

        panel.style.top = `${top}px`;
        panel.style.left = `${left}px`;
        panel.style.visibility = 'visible';
    });

    useEffect(() => {
        const onDown = (e: MouseEvent) => {
            if (
                anchorRef.current &&
                !anchorRef.current.contains(e.target as Node) &&
                panelRef.current &&
                !panelRef.current.contains(e.target as Node)
            ) {
                onClose();
            }
        };
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
        // Capture phase so config dialogs that stop `mousedown` bubbling can't
        // swallow the outside-click that should close the popover.
        document.addEventListener('mousedown', onDown, true);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown, true);
            document.removeEventListener('keydown', onKey);
        };
    }, [anchorRef, onClose]);

    const [hexText, setHexText] = useState(alphaEnabled && alpha < 100 ? combineColor(hex6, alpha) : hex6);
    // Keep the text field in sync when the colour changes from the swatch/slider.
    useEffect(() => {
        setHexText(alphaEnabled && alpha < 100 ? combineColor(hex6, alpha) : hex6);
    }, [hex6, alpha, alphaEnabled]);

    const commitHex = (raw: string) => {
        const parsed = parseColor(raw, hex6);
        onChange(combineColor(parsed.hex6, alphaEnabled ? parsed.alpha : 100));
    };

    return createPortal(
        <div
            ref={panelRef}
            className="nodrag fixed z-[9999] rounded-lg shadow-2xl p-3"
            style={{
                top: -9999,
                left: -9999,
                width: 220,
                background: 'var(--app-surface)',
                color: 'var(--text-primary)',
                border: '1px solid var(--app-border)',
                visibility: 'hidden',
            }}
            onMouseDown={(e) => e.stopPropagation()}
        >
            <div className="flex items-center gap-2">
                <input
                    type="color"
                    value={hex6}
                    onChange={(e) => onChange(combineColor(e.target.value, alphaEnabled ? alpha : 100))}
                    className="cursor-pointer rounded"
                    style={{ width: 40, height: 32, border: '1px solid var(--app-border)', padding: 1 }}
                />
                <input
                    type="text"
                    value={hexText}
                    onChange={(e) => setHexText(e.target.value)}
                    onBlur={(e) => commitHex(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') commitHex((e.target as HTMLInputElement).value);
                    }}
                    spellCheck={false}
                    className="flex-1 min-w-0 text-xs rounded px-2 py-1.5 focus:outline-none"
                    style={{
                        background: 'var(--app-bg)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--app-border)',
                    }}
                />
            </div>
            {alphaEnabled && (
                <div className="mt-3">
                    <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                            Transparenz
                        </span>
                        <span className="text-[11px] tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                            {alpha}%
                        </span>
                    </div>
                    <div
                        className="relative rounded"
                        style={{
                            height: 20,
                            overflow: 'hidden',
                            border: '1px solid var(--app-border)',
                            ...CHECKERBOARD,
                        }}
                    >
                        <div
                            aria-hidden
                            style={{
                                position: 'absolute',
                                inset: 0,
                                backgroundImage: `linear-gradient(to right, ${hex6}00, ${hex6}ff)`,
                            }}
                        />
                        <input
                            type="range"
                            min={0}
                            max={100}
                            value={alpha}
                            onChange={(e) => onChange(combineColor(hex6, Number(e.target.value)))}
                            className="absolute inset-0 w-full cursor-pointer"
                            style={{ margin: 0, background: 'transparent', accentColor: 'var(--accent, #3b82f6)' }}
                        />
                    </div>
                </div>
            )}
        </div>,
        portalTarget,
    );
}
