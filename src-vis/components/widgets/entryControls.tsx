/**
 * Shared per-entry control types for the static and dynamic list widgets.
 *
 * The list "Darstellung" (displayType) decides how a single entry's value is
 * rendered/controlled. Besides the built-in auto/switch/slider/value modes the
 * lists support these richer controls, all rendered by the small components
 * below so both list widgets share one implementation:
 *   - shutter   → ▲ ■ ▼ buttons writing to separate up/stop/down DPs
 *   - stepper   → −/+ buttons stepping a numeric DP (min/max/step)
 *   - buttons   → fixed value presets (Off/Eco/Comfort, 0/50/100 …)
 *   - momentary → single push button writing a pulse value (scene/reset)
 *   - time      → a time value (epoch s/ms, ISO string, HH:mm) as time and/or date
 *   - input     → free text / number entry, like the standalone Eingabefeld widget
 */
import { useEffect, useRef, useState } from 'react';
import { ChevronUp, ChevronDown, Square, Minus, Plus, Send } from 'lucide-react';
import type { ioBrokerState } from '../../types';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { useConfirmAction } from '../../hooks/useConfirmAction';
import { useT } from '../../i18n';
import { formatTimeDisplay } from '../../utils/timeDisplay';
import { formatNum, type NumberFormat } from '../../utils/formatValue';
import { ConfirmOverlay } from './ConfirmOverlay';
import {
    type ContactState,
    WC_PRESETS,
    WC_FALLBACK,
    WC_FALLBACK_ICON_NAME,
    resolveContactState,
} from '../../utils/windowContact';

export type EntryDisplayType =
    | 'auto'
    | 'switch'
    | 'slider'
    | 'value'
    | 'shutter'
    | 'stepper'
    | 'buttons'
    | 'momentary'
    | 'states'
    | 'contact'
    | 'time'
    | 'input';

/** Control types that are not a simple on/off and must be excluded from the
 *  group master switch. */
export const NON_TOGGLE_DISPLAY_TYPES: ReadonlySet<string> = new Set([
    'shutter',
    'stepper',
    'buttons',
    'momentary',
    'states',
    'contact',
    'time',
    'input',
]);

/**
 * Whether the entry's on/off label pair (trueLabel/falseLabel) can ever show up.
 *
 * Both list widgets only use those labels for a boolean-ish value: `isBoolLike`
 * (true/false or 0/1) with a non-numeric role, or an entry explicitly rendered as a
 * switch. Conservative on purpose - anything we cannot rule out at config time still
 * shows the fields, so an unknown datapoint never loses them.
 */
export function usesOnOffLabels(entry: { displayType?: EntryDisplayType; role?: string }, dpType?: string): boolean {
    const dt = entry.displayType ?? 'auto';
    if (dt === 'switch') return true;
    // Rich controls carry their own labels (states/contact) or none at all.
    if (dt !== 'auto') return false;
    const r = (entry.role ?? '').toLowerCase();
    // Roles that describe a measurement or a level are never rendered as on/off.
    if (r.startsWith('value.') || r === 'value' || r.startsWith('level.') || r === 'level') return false;
    if (dpType === 'number' || dpType === 'string') return false;
    return true;
}

export interface EntryPreset {
    value: string | number;
    label?: string;
}

/** A single value→state mapping for the "states" display (multi-state sensors
 *  such as a window handle: closed / tilted / open). Matched by string-equality
 *  against the DP value. */
export interface EntryStateMap {
    value: string | number;
    label?: string;
    icon?: string;
    color?: string;
}

/** Per-entry control config — mixed into StaticListEntry and AutoListEntry. */
export interface EntryControlConfig {
    displayType?: EntryDisplayType;
    /** Switch-like controls (switch, momentary): require a confirmation tap before writing. */
    confirm?: boolean;
    /** Custom prompt shown in the confirmation overlay. Falls back to a default text. */
    confirmText?: string;
    // ── shutter ──────────────────────────────────────────────────────────────
    /**
     * Shutter control model:
     *  - 'commands' (default): separate up/stop/down command DPs (Shelly, Zigbee, scripts).
     *  - 'position': single LEVEL DP (the entry's main DP) — up/down write open/close
     *    values, stop writes the current position back (HomeMatic-style).
     */
    shutterMode?: 'commands' | 'position';
    shutterUpDp?: string;
    shutterStopDp?: string;
    shutterDownDp?: string;
    /** Value written to a shutter command DP on press. Default true. */
    shutterWriteValue?: string | number | boolean;
    /** Position mode: value written on "up" (open). Default 100. */
    shutterOpenValue?: number;
    /** Position mode: value written on "down" (close). Default 0. */
    shutterCloseValue?: number;
    // ── stepper ──────────────────────────────────────────────────────────────
    stepMin?: number;
    stepMax?: number;
    stepStep?: number;
    // ── buttons (value presets) ────────────────────────────────────────────────
    presets?: EntryPreset[];
    // ── states (multi-state read display) ──────────────────────────────────────
    /** Value→label/icon/color mappings for the "states" display. */
    states?: EntryStateMap[];
    // ── contact (window/door contact read display) ─────────────────────────────
    /** Value-mapping preset key (see WC_PRESETS); default 'hmip'. 'custom' uses
     *  the contactValues* fields below. */
    contactPreset?: string;
    /** Custom comma-separated values per state (only used when contactPreset === 'custom'). */
    contactValuesClosed?: string;
    contactValuesTilted?: string;
    contactValuesOpen?: string;
    /** Per-state appearance overrides; fall back to WC_FALLBACK when unset. */
    contactAppearance?: {
        closed?: { label?: string; color?: string; icon?: string };
        tilted?: { label?: string; color?: string; icon?: string };
        open?: { label?: string; color?: string; icon?: string };
    };
    // ── time (date/time read display) ──────────────────────────────────────────
    /** Output shape for the 'time' display (see TIME_DISPLAY_PRESETS); default 'time'. */
    timeFormat?: string;
    /** Token pattern, only used when `timeFormat` is 'custom'. */
    timePattern?: string;
    // ── momentary (push / pulse) ───────────────────────────────────────────────
    /** Value written on press. Default true. */
    pulseValue?: string | number | boolean;
    /** Write a reset value after pulseDelay ms (momentary). Default false. */
    pulseReset?: boolean;
    /** Reset value written after the delay. Default false. */
    pulseResetValue?: string | number | boolean;
    /** Delay (ms) before the reset write. Default 500. */
    pulseDelay?: number;
    /** Button caption for the momentary control. */
    pulseLabel?: string;
    // ── input (free text / number entry) ───────────────────────────────────────
    /** Hint shown while the field is empty. */
    inputPlaceholder?: string;
    /** Fixed field width in px. Unset = a compact default (row) / full width (card). */
    inputWidth?: number;
    /** 'number' parses and writes a number; default 'text' writes the raw string. */
    inputMode?: 'text' | 'number';
    /** 'submit' (default) writes on Enter/blur/send button, 'live' on every keystroke. */
    inputSubmitMode?: 'live' | 'submit';
    /** Show the send button in submit mode. Default true. */
    inputShowSubmit?: boolean;
    /** Command-field mode: clear the field after each send and never mirror the DP. */
    inputClearAfterSubmit?: boolean;
    /** Text alignment inside the field. Default 'left'. */
    inputTextAlign?: 'left' | 'center' | 'right';
    /** Display the value but refuse edits, regardless of the datapoint's writability. */
    inputReadOnly?: boolean;
}

type SetState = (id: string, v: boolean | number | string) => void;

/** Coerce a configured write value (often a raw string from the editor) into the
 *  proper boolean/number/string before writing. */
function parseWrite(v: string | number | boolean | undefined, fallback: boolean | number | string) {
    if (v === undefined || v === '') return fallback;
    if (typeof v !== 'string') return v;
    if (v === 'true') return true;
    if (v === 'false') return false;
    const n = Number(v);
    return v.trim() !== '' && Number.isFinite(n) ? n : v;
}

const btnCls = 'shrink-0 flex items-center justify-center rounded transition-colors';
const btnStyle: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-secondary)',
    border: '1px solid var(--widget-border)',
};

// ── Shutter ─────────────────────────────────────────────────────────────────

export function ShutterControl({
    entry,
    val,
    setState,
    size = 26,
}: {
    entry: EntryControlConfig & { id: string };
    val?: ioBrokerState['val'];
    setState: SetState;
    size?: number;
}) {
    const iconSize = Math.round(size * 0.5);

    let onUp: (() => void) | undefined;
    let onStop: (() => void) | undefined;
    let onDown: (() => void) | undefined;

    if ((entry.shutterMode ?? 'commands') === 'position') {
        // HomeMatic-style: up/down write open/close values to the entry's main
        // (LEVEL) DP; stop writes the current position back, or hits a stop DP.
        const openVal = entry.shutterOpenValue ?? 100;
        const closeVal = entry.shutterCloseValue ?? 0;
        onUp = () => setState(entry.id, openVal);
        onDown = () => setState(entry.id, closeVal);
        if (entry.shutterStopDp) {
            const stopWrite = parseWrite(entry.shutterWriteValue, true);
            onStop = () => setState(entry.shutterStopDp!, stopWrite);
        } else if (typeof val === 'number') {
            const cur = val;
            onStop = () => setState(entry.id, cur);
        }
    } else {
        const write = parseWrite(entry.shutterWriteValue, true);
        onUp = entry.shutterUpDp ? () => setState(entry.shutterUpDp!, write) : undefined;
        onStop = entry.shutterStopDp ? () => setState(entry.shutterStopDp!, write) : undefined;
        onDown = entry.shutterDownDp ? () => setState(entry.shutterDownDp!, write) : undefined;
    }

    const Btn = ({ onClick, children, label }: { onClick?: () => void; children: React.ReactNode; label: string }) => (
        <button
            onClick={onClick}
            disabled={!onClick}
            title={label}
            aria-label={label}
            className={`${btnCls} disabled:opacity-30`}
            style={{ ...btnStyle, width: size, height: size, cursor: onClick ? 'pointer' : 'default' }}
        >
            {children}
        </button>
    );
    return (
        <div className="shrink-0 flex items-center gap-1">
            <Btn onClick={onUp} label="Auf">
                <ChevronUp size={iconSize} />
            </Btn>
            <Btn onClick={onStop} label="Stop">
                <Square size={Math.round(iconSize * 0.7)} />
            </Btn>
            <Btn onClick={onDown} label="Ab">
                <ChevronDown size={iconSize} />
            </Btn>
        </div>
    );
}

// ── Stepper ─────────────────────────────────────────────────────────────────

export function StepperControl({
    entry,
    val,
    setState,
    decimals = 0,
    numFmt,
    size = 24,
}: {
    entry: EntryControlConfig & { id: string; unit?: string };
    val: ioBrokerState['val'];
    setState: SetState;
    decimals?: number;
    numFmt?: NumberFormat;
    size?: number;
}) {
    const cur = typeof val === 'number' ? val : Number(val) || 0;
    const step = entry.stepStep ?? 1;
    const min = entry.stepMin;
    const max = entry.stepMax;
    const clamp = (v: number) => {
        let n = v;
        if (min !== undefined) n = Math.max(min, n);
        if (max !== undefined) n = Math.min(max, n);
        // avoid float drift like 0.30000000000004
        return Number(n.toFixed(6));
    };
    const atMin = min !== undefined && cur <= min;
    const atMax = max !== undefined && cur >= max;
    return (
        <div className="shrink-0 flex items-center gap-1.5">
            <button
                onClick={() => setState(entry.id, clamp(cur - step))}
                disabled={atMin}
                className={`${btnCls} disabled:opacity-30`}
                style={{ ...btnStyle, width: size, height: size, cursor: atMin ? 'default' : 'pointer' }}
                aria-label="−"
            >
                <Minus size={Math.round(size * 0.55)} />
            </button>
            <span className="text-xs font-semibold tabular-nums min-w-[2.5ch] text-center">
                {typeof val === 'number' ? formatNum(cur, decimals, numFmt) : '–'}
                {entry.unit ? ` ${entry.unit}` : ''}
            </span>
            <button
                onClick={() => setState(entry.id, clamp(cur + step))}
                disabled={atMax}
                className={`${btnCls} disabled:opacity-30`}
                style={{ ...btnStyle, width: size, height: size, cursor: atMax ? 'default' : 'pointer' }}
                aria-label="+"
            >
                <Plus size={Math.round(size * 0.55)} />
            </button>
        </div>
    );
}

// ── Value presets / segment buttons ───────────────────────────────────────────

export function PresetButtons({
    entry,
    val,
    setState,
    activeColor,
}: {
    entry: EntryControlConfig & { id: string };
    val: ioBrokerState['val'];
    setState: SetState;
    activeColor: string;
}) {
    const presets = entry.presets ?? [];
    if (presets.length === 0) return null;
    return (
        <div className="shrink-0 flex items-center gap-1 flex-wrap justify-end">
            {presets.map((p, i) => {
                const active = String(val) === String(p.value);
                return (
                    <button
                        key={`${p.value}-${i}`}
                        onClick={() => setState(entry.id, p.value)}
                        className="text-[11px] font-medium px-2 py-0.5 rounded-full transition-colors"
                        style={{
                            background: active
                                ? `color-mix(in srgb, ${activeColor} 18%, transparent)`
                                : 'var(--app-bg)',
                            color: active ? activeColor : 'var(--text-secondary)',
                            border: `1px solid ${active ? activeColor : 'var(--widget-border)'}`,
                        }}
                    >
                        {p.label || String(p.value)}
                    </button>
                );
            })}
        </div>
    );
}

// ── Multi-state read display ────────────────────────────────────────────────
// Read-only pill for sensors with more than two states (window handle:
// closed/tilted/open, thermostat modes, …). Matches the current value against
// the configured mappings by string-equality and shows the matched
// label/icon/color, falling back to the raw value when nothing matches.

export function StateDisplay({
    entry,
    val,
}: {
    entry: EntryControlConfig & { unit?: string };
    val: ioBrokerState['val'];
}) {
    const states = entry.states ?? [];
    const match = states.find((s) => String(s.value) === String(val));
    const color = match?.color || 'var(--text-secondary)';
    const label =
        match?.label ??
        (match ? String(match.value) : val != null ? `${String(val)}${entry.unit ? ` ${entry.unit}` : ''}` : '–');
    const Icon = match?.icon ? getWidgetIcon(match.icon, null) : null;
    return (
        <span
            className="shrink-0 flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
            style={{ background: `color-mix(in srgb, ${color} 18%, transparent)`, color }}
        >
            {Icon && <Icon size={14} />}
            {label}
        </span>
    );
}

// ── Window/door contact read display ────────────────────────────────────────
// Read-only pill for window/door contacts. Reuses the standalone WindowContact
// widget's value-mapping presets (HmIP / Boolean / … → closed/tilted/open) via
// resolveContactState, then applies per-state label/color/icon overrides on top
// of the shared WC_FALLBACK defaults.

/** Resolve an entry's raw value into the display label/color/icon-name for the
 *  "contact" display type. Icon is always a name string so both the pill and the
 *  minimal-layout inline path can resolve it through getWidgetIcon. */
export function resolveContactDisplay(
    entry: EntryControlConfig,
    val: ioBrokerState['val'],
): { label: string; color: string; icon: string } {
    const preset = entry.contactPreset ?? 'hmip';
    const state: ContactState = resolveContactState(val, preset, {
        closed: entry.contactValuesClosed ?? WC_PRESETS.hmip.closed,
        tilted: entry.contactValuesTilted ?? WC_PRESETS.hmip.tilted,
        open: entry.contactValuesOpen ?? WC_PRESETS.hmip.open,
    });
    const ov = entry.contactAppearance?.[state];
    const fb = WC_FALLBACK[state];
    return {
        label: ov?.label || fb.label,
        color: ov?.color || fb.color,
        icon: ov?.icon || WC_FALLBACK_ICON_NAME[state],
    };
}

export function ContactDisplay({ entry, val }: { entry: EntryControlConfig; val: ioBrokerState['val'] }) {
    const { label, color, icon } = resolveContactDisplay(entry, val);
    const Icon = icon ? getWidgetIcon(icon, null) : null;
    return (
        <span
            className="shrink-0 flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
            style={{ background: `color-mix(in srgb, ${color} 18%, transparent)`, color }}
        >
            {Icon && <Icon size={14} />}
            {label}
        </span>
    );
}

// ── Date/time read display ───────────────────────────────────────────────────
// For entries whose datapoint holds a point in time (epoch seconds/milliseconds,
// ISO string, HH:mm, yyyy-MM-dd). The shape is picked per entry (time / date /
// both / own token pattern); values that are no readable time show the dash.

/** Formatted time text of an entry, or the dash placeholder when unreadable. */
export function formatEntryTime(
    entry: EntryControlConfig,
    val: ioBrokerState['val'],
    t: ReturnType<typeof useT>,
): string {
    return formatTimeDisplay(val, entry.timeFormat || 'time', t, entry.timePattern) ?? '–';
}

export function TimeDisplay({
    entry,
    val,
    className = 'shrink-0 text-xs font-medium tabular-nums',
    style,
}: {
    entry: EntryControlConfig;
    val: ioBrokerState['val'];
    className?: string;
    style?: React.CSSProperties;
}) {
    const t = useT();
    return (
        <span className={className} style={style}>
            {formatEntryTime(entry, val, t)}
        </span>
    );
}

// ── Free text / number entry ─────────────────────────────────────────────────
// Same behaviour as the standalone Eingabefeld widget, shrunk into a list row: a
// draft-buffered field that writes either on every keystroke ('live') or on
// Enter / blur / the send button ('submit').

/** Compact default field width for a list row; card layouts fill their cell. */
const INPUT_ROW_WIDTH = 110;

export function InputControl({
    entry,
    val,
    setState,
    fullWidth,
}: {
    entry: EntryControlConfig & { id: string };
    val: ioBrokerState['val'];
    setState: SetState;
    /** Card layouts stack vertically, so the field takes the whole cell there. */
    fullWidth?: boolean;
}) {
    const numeric = entry.inputMode === 'number';
    const submitMode = entry.inputSubmitMode ?? 'submit';
    // Only the explicit option locks the field. The datapoint's own `common.write` is
    // deliberately NOT consulted - the standalone Eingabefeld widget writes regardless,
    // and gating on it silently killed both typing and the send button for datapoints
    // that merely fail to advertise write access.
    const readOnly = !!entry.inputReadOnly;
    // Command-field mode: the field never mirrors the DP and empties itself after
    // each send. The DP is deliberately left untouched - resetting it would be a
    // second state change and consumers (scripts, notifications) would act on it.
    const clearAfterSubmit = !!entry.inputClearAfterSubmit && submitMode === 'submit' && !readOnly;
    const showSubmit = entry.inputShowSubmit !== false && submitMode === 'submit' && !readOnly;
    const width = Number(entry.inputWidth) > 0 ? Number(entry.inputWidth) : undefined;

    const dpString = val == null ? '' : String(val);
    const [draft, setDraft] = useState<string>(clearAfterSubmit ? '' : dpString);
    const [dirty, setDirty] = useState(false);
    const lastSeenDp = useRef<string>(dpString);
    const anchorRef = useRef<HTMLDivElement>(null);

    // Follow the datapoint when it changes elsewhere - but never while the user types.
    useEffect(() => {
        if (clearAfterSubmit) return;
        if (dpString !== lastSeenDp.current) {
            lastSeenDp.current = dpString;
            if (!dirty) setDraft(dpString);
        }
    }, [dpString, dirty, clearAfterSubmit]);

    const writeValue = (v: string) => {
        lastSeenDp.current = v;
        if (numeric) {
            const n = Number(v);
            if (v === '' || !Number.isFinite(n)) return;
            setState(entry.id, n);
            return;
        }
        setState(entry.id, v);
    };

    const doCommit = () => {
        writeValue(draft);
        if (clearAfterSubmit) setDraft('');
        setDirty(false);
    };

    const {
        run: runCommit,
        pending,
        confirm,
        cancel,
    } = useConfirmAction(doCommit, !!entry.confirm && submitMode === 'submit');

    const commit = () => {
        // A command field must resend the same text (the receiver expects a new
        // trigger), so the "unchanged value" shortcut only applies to normal fields.
        if (clearAfterSubmit) {
            if (draft === '') {
                setDirty(false);
                return;
            }
        } else if (draft === lastSeenDp.current) {
            setDirty(false);
            return;
        }
        runCommit();
    };

    const onChange = (v: string) => {
        setDraft(v);
        if (submitMode === 'live') {
            writeValue(v);
            setDirty(false);
        } else {
            setDirty(clearAfterSubmit ? v !== '' : v !== lastSeenDp.current);
        }
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (readOnly || submitMode === 'live') return;
        if (e.key === 'Enter') {
            e.preventDefault();
            commit();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            setDraft(clearAfterSubmit ? '' : lastSeenDp.current);
            setDirty(false);
            e.currentTarget.blur();
        }
    };

    return (
        <div
            ref={anchorRef}
            className={`flex items-center gap-1 ${fullWidth ? 'w-full' : 'shrink-0'}`}
            // The row itself is clickable (popup); typing must not bubble up to it.
            onClick={(e) => e.stopPropagation()}
        >
            <input
                type={numeric ? 'number' : 'text'}
                className="aura-widget-action nodrag text-xs rounded-lg px-2 py-1 focus:outline-none min-w-0"
                style={{
                    background: 'var(--app-bg)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--widget-border)',
                    textAlign: entry.inputTextAlign ?? 'left',
                    // In a card the field takes the cell but must still leave room for the
                    // send button - `flex-1` instead of a hard 100%, which squeezed it to
                    // a stub once the button was in the same row.
                    ...(width
                        ? { width, flexShrink: 0 }
                        : fullWidth
                          ? { flex: '1 1 auto', width: 'auto' }
                          : { width: INPUT_ROW_WIDTH, flexShrink: 0 }),
                }}
                value={draft}
                placeholder={entry.inputPlaceholder}
                readOnly={readOnly}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={onKeyDown}
                // Blur commits - except for a command field, where a stray tap next to
                // the field would fire off the message. There the send is always explicit.
                onBlur={submitMode === 'submit' && !clearAfterSubmit && !readOnly ? commit : undefined}
            />
            {showSubmit && (
                <button
                    type="button"
                    onClick={commit}
                    disabled={!dirty}
                    title="Senden"
                    aria-label="Senden"
                    className={`${btnCls} disabled:opacity-40`}
                    style={{
                        ...btnStyle,
                        width: 26,
                        height: 26,
                        background: dirty ? 'var(--accent)' : 'var(--app-bg)',
                        color: dirty ? '#fff' : 'var(--text-secondary)',
                        border: `1px solid ${dirty ? 'var(--accent)' : 'var(--widget-border)'}`,
                        cursor: dirty ? 'pointer' : 'default',
                    }}
                >
                    <Send size={13} />
                </button>
            )}
            {pending && (
                <ConfirmOverlay
                    popup
                    anchorRef={anchorRef}
                    text={entry.confirmText}
                    onConfirm={confirm}
                    onCancel={cancel}
                />
            )}
        </div>
    );
}

// ── Momentary / push ──────────────────────────────────────────────────────────

export function MomentaryButton({
    entry,
    setState,
    icon,
}: {
    entry: EntryControlConfig & { id: string; icon?: string };
    setState: SetState;
    icon?: string;
}) {
    const pendingRef = useRef(false);
    const btnRef = useRef<HTMLButtonElement>(null);
    const pulse = parseWrite(entry.pulseValue, true);
    const reset = entry.pulseReset ?? false;
    const resetVal = parseWrite(entry.pulseResetValue, false);
    const delay = entry.pulseDelay ?? 500;
    const Icon = icon ? getWidgetIcon(icon, null!) : null;
    const press = () => {
        if (pendingRef.current) return;
        setState(entry.id, pulse);
        if (reset) {
            pendingRef.current = true;
            setTimeout(() => {
                setState(entry.id, resetVal);
                pendingRef.current = false;
            }, delay);
        }
    };
    const { run, pending, confirm, cancel } = useConfirmAction(press, !!entry.confirm);
    return (
        <>
            <button
                ref={btnRef}
                onClick={run}
                className="shrink-0 flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg transition-transform active:scale-95"
                style={{ background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer' }}
            >
                {Icon && <Icon size={13} />}
                {entry.pulseLabel || 'Auslösen'}
            </button>
            {pending && (
                <ConfirmOverlay
                    popup
                    anchorRef={btnRef}
                    text={entry.confirmText}
                    onConfirm={confirm}
                    onCancel={cancel}
                />
            )}
        </>
    );
}
