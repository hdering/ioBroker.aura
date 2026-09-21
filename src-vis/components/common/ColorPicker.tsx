/**
 * ColorPicker — a drop-in replacement for the raw `<input type="color">` used
 * throughout the widget configs, with three things the native picker cannot do:
 * a 0–100% transparency (alpha) control, the theme's own colours, and one colour
 * per brightness.
 *
 * The trigger is a color swatch (same footprint as the old inputs, so it slots
 * into existing tight config rows via `className`/`style`). Clicking it opens a
 * small popover — portaled (usePortalTarget) so it is not clipped by scrolling
 * config panels.
 *
 * Emitted value stays backward-compatible and is always a single string:
 *   `#RRGGBB`                      fully opaque
 *   `#RRGGBBAA`                    once alpha < 100 (valid CSS, chart libs take it)
 *   `var(--accent)`                a theme colour — follows light/dark by itself
 *   `light-dark(#111, #eee)`       one colour per brightness (#689)
 *
 * The last two are resolved before they reach a widget (utils/dualColor.ts,
 * utils/cssColor.ts), so nothing downstream has to know about them.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePortalTarget } from '../../contexts/PortalTargetContext';
import { useOverlayZ } from '../../contexts/OverlayZContext';
import { createThrottle } from '../../utils/throttleCommit';
import { useEscapeLayer } from '../../utils/escapeStack';
import { makeDual, splitDual } from '../../utils/dualColor';
import { PICKER_TOKENS } from '../../themes';

interface Props {
    /** Current color: `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()/rgba()`, a CSS var or a light/dark pair. */
    value: string;
    /** Called with the new color string. */
    onChange: (value: string) => void;
    /** Hex used when `value` is not a parseable colour (default `#888888`). */
    fallback?: string;
    /** Enable the transparency slider (default true). */
    alpha?: boolean;
    /**
     * Offer a separate colour per brightness (default true). Off where a pair
     * would be nonsense — the theme editor already has its own light/dark halves
     * (#640), so a pair inside one of them would be a second, conflicting switch.
     */
    dual?: boolean;
    /**
     * Nothing is configured — paint the "no colour" glyph instead of `value`.
     * A field that falls back to a theme colour would otherwise show that fallback
     * as a solid swatch, which reads as a colour the user picked. `value` is still
     * what the popover opens with.
     */
    unset?: boolean;
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

/**
 * "No colour" glyph: a slash on an opaque surface. Deliberately NOT the
 * checkerboard above — that one already means "alpha 0" here, and showing it for
 * an unset field would conflate transparent with unconfigured.
 */
const SLASH = 'color-mix(in srgb, var(--text-secondary) 65%, transparent)';
const NO_COLOR: React.CSSProperties = {
    backgroundColor: 'var(--app-bg)',
    backgroundImage: `linear-gradient(to top right, transparent calc(50% - 0.75px), ${SLASH} calc(50% - 0.75px), ${SLASH} calc(50% + 0.75px), transparent calc(50% + 0.75px))`,
};

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

/** A reference to a theme colour — kept as written instead of being flattened to hex. */
const TOKEN_RE = /^var\(\s*--[\w-]+\s*\)$/;
export function isThemeToken(value: string): boolean {
    return TOKEN_RE.test((value ?? '').trim());
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

/** True once `raw` is a fully-typed colour worth applying live (not a partial). */
function isCompleteColor(raw: string): boolean {
    const v = (raw ?? '').trim();
    if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v)) return true;
    if (/^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(,\s*[\d.]+\s*)?\)$/i.test(v)) return true;
    if (isThemeToken(v)) return true;
    return false;
}

/** What a half of the value looks like painted — a token paints itself. */
function cssOf(part: string, alphaEnabled: boolean, fallback: string): string {
    if (isThemeToken(part)) return part;
    const { hex6, alpha } = parseColor(part, fallback);
    return combineColor(hex6, alphaEnabled ? alpha : 100);
}

/**
 * How long the picker coalesces drag updates before handing one to the config.
 * See utils/throttleCommit for why an unthrottled drag locks the main thread.
 */
const COMMIT_MS = 120;

export function ColorPicker({
    value,
    onChange,
    fallback = '#888888',
    alpha: alphaEnabled = true,
    dual = true,
    unset,
    title,
    className,
    style,
    disabled,
}: Props) {
    const [open, setOpen] = useState(false);
    const anchorRef = useRef<HTMLButtonElement>(null);
    const idRef = useRef(0);
    if (idRef.current === 0) idRef.current = ++pickerSeq;

    /**
     * What the OTHER mode last held. The stored value can only ever carry one of
     * the two — a pair or a single colour — so switching to "Einheitlich" would
     * otherwise throw the light/dark halves away for good, and switching back
     * would hand out two copies of the uniform colour instead of the pair the
     * user had set up (#689).
     *
     * Lives on the picker, not on the popover, so it survives closing and
     * reopening the popover; it is gone once the config panel itself unmounts —
     * a longer memory would need a key per option, which the ~80 call sites do
     * not have.
     */
    const stashRef = useRef<{ pair: { light: string; dark: string } | null; solid: string | null }>({
        pair: null,
        solid: null,
    });

    // What the swatch and the popover render while a drag is in flight: the parent
    // only learns the throttled value, so the UI would lag a whole window behind it.
    const [live, setLive] = useState<string | null>(null);

    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    const throttleRef = useRef<ReturnType<typeof createThrottle<string>>>();
    if (!throttleRef.current) throttleRef.current = createThrottle((v) => onChangeRef.current(v), COMMIT_MS);
    const { push, flush } = throttleRef.current;

    /** Hand the picker's final value over and drop the local copy. */
    const settle = () => {
        flush();
        setLive(null);
    };
    // A value must never be lost because the picker went away mid-drag.
    useEffect(() => () => flush(), [flush]);

    // Close this picker when another one opens.
    useEffect(() => {
        const onOtherOpen = (e: Event) => {
            if ((e as CustomEvent<number>).detail !== idRef.current) {
                flush();
                setLive(null);
                setOpen(false);
            }
        };
        window.addEventListener(PICKER_OPEN_EVENT, onOtherOpen);
        return () => window.removeEventListener(PICKER_OPEN_EVENT, onOtherOpen);
    }, [flush]);

    const toggle = () => {
        if (disabled) return;
        // Not inside the setState updater: settle() has side effects and React may
        // run an updater twice.
        if (open) {
            settle();
            setOpen(false);
            return;
        }
        window.dispatchEvent(new CustomEvent(PICKER_OPEN_EVENT, { detail: idRef.current }));
        setOpen(true);
    };

    const current = live ?? value;
    const parts = splitDual(current);
    // A colour picked in this session is a colour, whatever the parent still says.
    const showUnset = unset && live === null;

    // A pair is shown split along the diagonal: light half top-left, dark half
    // bottom-right — the same reading order as the two tabs in the popover.
    const lightCss = cssOf(parts.light, alphaEnabled, fallback);
    const darkCss = cssOf(parts.dark, alphaEnabled, fallback);
    const swatchStyle: React.CSSProperties = parts.isPair
        ? { backgroundImage: `linear-gradient(to bottom right, ${lightCss} 0 50%, ${darkCss} 50% 100%)` }
        : { background: lightCss };

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
                        ...(showUnset ? NO_COLOR : swatchStyle),
                    }}
                />
            </button>
            {open && (
                <ColorPopover
                    anchorRef={anchorRef}
                    value={current}
                    fallback={fallback}
                    alphaEnabled={alphaEnabled}
                    dualEnabled={dual}
                    stash={stashRef.current}
                    onChange={(v) => {
                        setLive(v);
                        push(v);
                    }}
                    onSettle={settle}
                    onClose={() => {
                        settle();
                        setOpen(false);
                    }}
                />
            )}
        </>
    );
}

/** The two halves, as tabs. Labels are what the user sees on the sun/moon button. */
const SIDES: { key: 'light' | 'dark'; label: string }[] = [
    { key: 'light', label: 'Hell' },
    { key: 'dark', label: 'Dunkel' },
];

function ColorPopover({
    anchorRef,
    value,
    fallback,
    alphaEnabled,
    dualEnabled,
    stash,
    onChange,
    onSettle,
    onClose,
}: {
    anchorRef: React.RefObject<HTMLButtonElement>;
    /** The whole stored value, pair included. */
    value: string;
    fallback: string;
    alphaEnabled: boolean;
    dualEnabled: boolean;
    /** The colours of the mode that is currently NOT stored — see ColorPicker. */
    stash: { pair: { light: string; dark: string } | null; solid: string | null };
    /** Throttled on its way to the config - fine to call on every pointer move. */
    onChange: (value: string) => void;
    /** End of an interaction (pointer released, field left): deliver the last value now. */
    onSettle: () => void;
    onClose: () => void;
}) {
    const portalTarget = usePortalTarget();
    const overlayZ = useOverlayZ();
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
        // Capture phase so config dialogs that stop `mousedown` bubbling can't
        // swallow the outside-click that should close the popover.
        document.addEventListener('mousedown', onDown, true);
        return () => document.removeEventListener('mousedown', onDown, true);
    }, [anchorRef, onClose]);

    // Escape belongs to the popover, not to the config dialog underneath it.
    useEscapeLayer(onClose);

    const parts = splitDual(value);
    /**
     * Pair mode is UI state, not derived from the value: makeDual collapses two
     * equal halves back into one colour (a pair of identical colours is noise in
     * the config), so deriving it would throw the user out of the mode the moment
     * they set both sides alike while still editing.
     */
    const [pairMode, setPairMode] = useState(parts.isPair);
    const [side, setSide] = useState<'light' | 'dark'>('light');
    const active = pairMode ? (side === 'dark' ? parts.dark : parts.light) : parts.light;
    const token = isThemeToken(active);
    const { hex6, alpha } = parseColor(active, fallback);

    /** Write one half back, keeping the other — or the plain value when unpaired. */
    const emit = (part: string) => {
        if (!pairMode) {
            stash.solid = part;
            onChange(part);
            return;
        }
        const light = side === 'dark' ? parts.light : part;
        const dark = side === 'dark' ? part : parts.dark;
        stash.pair = { light, dark };
        onChange(makeDual(light, dark));
    };
    const emitHexAlpha = (h: string, a: number) => emit(combineColor(h, alphaEnabled ? a : 100));

    const [hexText, setHexText] = useState(active);
    // While the user is typing in the text field, never overwrite it with the
    // normalized value — otherwise `#ef4` gets rewritten to `#eeff44` mid-word.
    // The colour is still applied live (commitHex on each keystroke) so the
    // swatch/preview reflects it; the field only re-normalizes on blur.
    const editingRef = useRef(false);
    // Keep the text field in sync when the colour changes from the swatch, the
    // slider, a theme colour or a switch to the other half.
    useEffect(() => {
        if (editingRef.current) return;
        if (isThemeToken(active)) setHexText(active);
        else setHexText(alphaEnabled && alpha < 100 ? combineColor(hex6, alpha) : hex6);
    }, [active, hex6, alpha, alphaEnabled]);

    const commitHex = (raw: string) => {
        const v = (raw ?? '').trim();
        // A token is a colour in its own right — flattening it to hex would throw
        // away exactly the thing that makes it follow the theme.
        if (isThemeToken(v)) {
            emit(v);
            return;
        }
        const parsed = parseColor(v, hex6);
        emitHexAlpha(parsed.hex6, parsed.alpha);
    };

    const tabStyle = (on: boolean): React.CSSProperties => ({
        flex: 1,
        padding: '3px 0',
        borderRadius: 4,
        background: on ? 'var(--app-surface)' : 'transparent',
        color: on ? 'var(--text-primary)' : 'var(--text-secondary)',
        border: on ? '1px solid var(--app-border)' : '1px solid transparent',
    });

    return createPortal(
        <div
            ref={panelRef}
            className="nodrag aura-color-popover fixed rounded-lg shadow-2xl p-3"
            style={{
                // Tier comes from the surrounding overlay - inside a ConfigModal the
                // popover has to clear that dialog's backdrop (see OverlayZContext).
                zIndex: overlayZ,
                top: -9999,
                left: -9999,
                width: 232,
                background: 'var(--app-surface)',
                color: 'var(--text-primary)',
                border: '1px solid var(--app-border)',
                visibility: 'hidden',
            }}
            onMouseDown={(e) => e.stopPropagation()}
        >
            {dualEnabled && (
                <div
                    className="flex gap-1 text-[11px] mb-2 rounded p-0.5"
                    style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}
                >
                    <button
                        type="button"
                        style={tabStyle(!pairMode)}
                        onClick={() => {
                            if (!pairMode) return;
                            // Keep the pair for the way back BEFORE collapsing it,
                            // and hand out the single colour this picker had last —
                            // the visible half only when there is none yet.
                            stash.pair = { light: parts.light, dark: parts.dark };
                            setPairMode(false);
                            const next = stash.solid ?? active;
                            if (next !== value) onChange(next);
                        }}
                    >
                        Einheitlich
                    </button>
                    <button
                        type="button"
                        style={tabStyle(pairMode)}
                        title="Eigene Farbe für helles und dunkles Theme"
                        onClick={() => {
                            if (pairMode) return;
                            stash.solid = parts.light;
                            setPairMode(true);
                            setSide('light');
                            // Back to the halves the user set earlier; without a
                            // remembered pair both start on the current colour, so
                            // the first switch changes nothing on screen.
                            const back = stash.pair;
                            if (back) {
                                const next = makeDual(back.light, back.dark);
                                if (next !== value) onChange(next);
                            }
                        }}
                    >
                        Hell / Dunkel
                    </button>
                </div>
            )}
            {dualEnabled && pairMode && (
                <div className="flex gap-1 text-[11px] mb-2">
                    {SIDES.map((s) => (
                        <button
                            key={s.key}
                            type="button"
                            style={{
                                ...tabStyle(side === s.key),
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 5,
                            }}
                            onClick={() => setSide(s.key)}
                        >
                            <span
                                aria-hidden
                                style={{
                                    width: 10,
                                    height: 10,
                                    borderRadius: 2,
                                    border: '1px solid var(--app-border)',
                                    background: cssOf(
                                        s.key === 'dark' ? parts.dark : parts.light,
                                        alphaEnabled,
                                        fallback,
                                    ),
                                }}
                            />
                            {s.label}
                        </button>
                    ))}
                </div>
            )}
            <div className="flex items-center gap-2">
                <input
                    type="color"
                    value={hex6}
                    onChange={(e) => emitHexAlpha(e.target.value, alpha)}
                    onBlur={onSettle}
                    className="cursor-pointer rounded"
                    style={{ width: 40, height: 32, border: '1px solid var(--app-border)', padding: 1 }}
                />
                <input
                    type="text"
                    value={hexText}
                    onChange={(e) => {
                        const raw = e.target.value;
                        setHexText(raw);
                        // Apply immediately once a complete colour is typed.
                        if (isCompleteColor(raw)) commitHex(raw);
                    }}
                    onFocus={() => {
                        editingRef.current = true;
                    }}
                    onBlur={(e) => {
                        editingRef.current = false;
                        commitHex(e.target.value);
                        onSettle();
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            commitHex((e.target as HTMLInputElement).value);
                            onSettle();
                        }
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
            {/* A theme colour has no hex to fade: mixing in an alpha would turn the
                token into a fixed colour and undo the reason it was picked. */}
            {alphaEnabled && !token && (
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
                            onChange={(e) => emitHexAlpha(hex6, Number(e.target.value))}
                            onPointerUp={onSettle}
                            onKeyUp={onSettle}
                            onBlur={onSettle}
                            className="absolute inset-0 w-full cursor-pointer"
                            style={{ margin: 0, background: 'transparent', accentColor: 'var(--accent, #3b82f6)' }}
                        />
                    </div>
                </div>
            )}
            {/* Theme colours. Picking one is the OTHER answer to #689: a token is
                already different in a light and a dark design, so it needs no pair. */}
            <div className="mt-3">
                <div className="text-[11px] mb-1" style={{ color: 'var(--text-secondary)' }}>
                    Theme-Farben
                </div>
                <div className="flex flex-wrap gap-1">
                    {PICKER_TOKENS.map(({ token: t, label }) => {
                        const on = active.trim() === `var(${t})`;
                        return (
                            <button
                                key={t}
                                type="button"
                                title={`${label} — var(${t})`}
                                onClick={() => {
                                    emit(`var(${t})`);
                                    onSettle();
                                }}
                                style={{
                                    width: 20,
                                    height: 20,
                                    borderRadius: 4,
                                    background: `var(${t})`,
                                    border: on ? '2px solid var(--text-primary)' : '1px solid var(--app-border)',
                                    cursor: 'pointer',
                                    padding: 0,
                                }}
                            />
                        );
                    })}
                </div>
            </div>
        </div>,
        portalTarget,
    );
}
