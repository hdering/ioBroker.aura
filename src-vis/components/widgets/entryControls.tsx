/**
 * Shared per-entry control types for the static and dynamic list widgets.
 *
 * The list "Darstellung" (displayType) decides how a single entry's value is
 * rendered/controlled. Besides the built-in auto/slider/value modes the lists
 * support these richer controls, all rendered by the small components below so
 * both list widgets share one implementation:
 *   - switch    → on/off control with the Schalter widget's full option set
 *                 (write values, status DP, condition mode, slide/icon/image)
 *   - slider    → range/bar control with the Schieberegler widget's option set
 *                 (scale, step, colour, bar look, write on release, read-only)
 *   - shutter   → ▲ ■ ▼ buttons writing to separate up/stop/down DPs
 *   - stepper   → −/+ buttons stepping a numeric DP (min/max/step)
 *   - buttons   → fixed value presets (Off/Eco/Comfort, 0/50/100 …)
 *   - momentary → single push button writing a pulse value (scene/reset)
 *   - time      → a time value (epoch s/ms, ISO string, HH:mm) as time and/or date
 *   - datepicker→ a date/time picker writing the value back, like the Datumswähler widget
 *   - input     → free text / number entry, like the standalone Eingabefeld widget
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ChevronUp, ChevronDown, Square, Minus, Plus, Send, Power } from 'lucide-react';
import type { ioBrokerState } from '../../types';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { resolveImageSource } from '../../utils/assetUrl';
import {
    parseWrite,
    switchEntryActive,
    switchReadValue,
    switchStatusDp,
    switchWriteValues,
    type SwitchEntryConfig,
} from '../../utils/switchEntry';
import { useConfirmAction } from '../../hooks/useConfirmAction';
import { useT } from '../../i18n';
import { formatTimeDisplay, TIME_DASH } from '../../utils/timeDisplay';
import { applyValueTransform, resolveValueTransform, type ValueTransformSettings } from '../../utils/valueTransform';
import { formatNum, type NumberFormat } from '../../utils/formatValue';
import { ConfirmOverlay } from './ConfirmOverlay';
import { useDateValueFields, dateValueText, type DateValueSettings } from '../common/DateValueFields';
import type { DateOutputFormat } from '../../utils/dateValue';
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
    | 'datepicker'
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
    'datepicker',
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

/** The mapping that matches a value, if any. String equality, like StateDisplay. */
export function matchStateMap(
    states: EntryStateMap[] | undefined,
    val: ioBrokerState['val'],
): EntryStateMap | undefined {
    if (!states?.length || val === null || val === undefined) return undefined;
    return states.find((s) => String(s.value) === String(val));
}

/** Per-entry control config — mixed into StaticListEntry and AutoListEntry.
 *  Extends ValueTransformSettings: every entry can carry its own display-only
 *  value conversion / time formatting, overriding the list-wide default. */
export interface EntryControlConfig extends ValueTransformSettings, SwitchEntryConfig {
    displayType?: EntryDisplayType;
    /** Switch-like controls (switch, momentary): require a confirmation tap before writing. */
    confirm?: boolean;
    /** Custom prompt shown in the confirmation overlay. Falls back to a default text. */
    confirmText?: string;
    // ── switch (on/off) ───────────────────────────────────────────────────────
    // The option set itself lives in utils/switchEntry (SwitchEntryConfig), so the
    // group master switch and the unit test can apply the same rule (issue #591).
    /** Size in px of the row icon and of the icon/image switch. Unset = per-layout default. */
    iconSize?: number;
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
    // ── slider ────────────────────────────────────────────────────────────────
    // The option set of the standalone Schieberegler widget, per list entry, so a
    // row can drive a 0…255 dimmer or a −20…40 setpoint instead of a fixed 0…100.
    /** Scale and granularity. Defaults 0 / 100 / 1. */
    sliderMin?: number;
    sliderMax?: number;
    sliderStep?: number;
    /** Fill and thumb colour. Unset = the theme accent. */
    sliderColor?: string;
    /** Draw the widget's filled bar instead of the native range control. */
    sliderBarStyle?: boolean;
    /** Bar style: bar height in % of the layout's base height. Default 100. */
    sliderBarSize?: number;
    /** Native style: track thickness in px. Unset = the layout's default (4 row / 6 card). */
    sliderThickness?: number;
    /** Write once the drag ends instead of on every move. */
    sliderCommitOnRelease?: boolean;
    /** Show the value but refuse edits — the control becomes a progress bar.
     *  A datapoint that is not writable at all prints its value as text instead. */
    sliderReadOnly?: boolean;
    /** Print the value next to the slider. Default true. */
    sliderShowValue?: boolean;
    /** Append the entry's unit (fallback `%`) to that value. Default true. */
    sliderShowUnit?: boolean;
    /** Print the scale ends left and right of the slider. Default false. */
    sliderShowMinMax?: boolean;
    /** Row layouts: fixed control width in px. Unset = a compact default (80). */
    sliderWidth?: number;
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
    // ── datepicker (date/time entry) ───────────────────────────────────────────
    // Same options as the standalone Datumswähler widget, per list entry.
    /** 'custom' replaces the native pickers with a field matching `dateInputPattern`. */
    dateInputFormat?: 'picker' | 'custom';
    dateInputPattern?: string;
    /** Only a time field, no date. */
    dateTimeOnly?: boolean;
    /** Additional time field next to the date. */
    dateShowTime?: boolean;
    /** Format the picked value is written in. Default 'timestamp_ms'. */
    dateOutputFormat?: DateOutputFormat;
    /** Token pattern, only used when `dateOutputFormat` is 'custom'. */
    dateOutputPattern?: string;
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

// Re-exported so the widgets that already import their write-value coercion from
// here (camera action rows) keep one import site.
export { parseWrite, switchEntryActive, switchReadValue, switchStatusDp, switchWriteValues };

// ── Display-only value conversion ────────────────────────────────────────────
// Same feature as the Werte-Anzeige widget: an entry (or the whole list) can
// declare `displayValue = raw * factor + offset` and/or render the value as a
// time/date. Read-only text output only — the controls below keep the raw value
// because they write it back, and a display factor must never reach a write.

export interface EntryValueText {
    /** Value in display units. Also what the color thresholds are matched against. */
    value: ioBrokerState['val'];
    /** Formatted text without the unit; null for an empty value. */
    text: string | null;
    /** A time format produced the text — the unit must not be appended to it. */
    isTime: boolean;
    /** Nothing configured on either level → callers may keep their raw-value path. */
    active: boolean;
    /** The value→text mapping that produced the text, when one did. Carries the
     *  colour and icon the caller may want to apply alongside the label. */
    state?: EntryStateMap;
}

/** Resolve an entry's value into what the list should print for it. */
export function entryValueText(
    entry: EntryControlConfig,
    listDefault: ValueTransformSettings | undefined,
    val: ioBrokerState['val'],
    decimals: number,
    numFmt: NumberFormat | undefined,
    t: ReturnType<typeof useT>,
): EntryValueText {
    const tr = resolveValueTransform(entry, listDefault);
    const value = applyValueTransform(val, tr.factor, tr.offset) as ioBrokerState['val'];
    if (value === null || value === undefined) return { value, text: null, isTime: false, active: tr.active };
    // A configured value→text table wins over formatting: it is what turns `true`
    // into "ONLINE" (issue #572). Sitting here means the main value and the second
    // line share it — EntrySubLine goes through the same function.
    const mapped = matchStateMap(entry.states, value);
    if (mapped?.label) return { value, text: mapped.label, isTime: false, active: tr.active, state: mapped };
    if (tr.timeFormat) {
        return {
            value,
            text: formatTimeDisplay(value, tr.timeFormat, t, tr.timePattern) ?? TIME_DASH,
            isTime: true,
            active: true,
        };
    }
    return {
        value,
        text: typeof value === 'number' ? formatNum(value, decimals, numFmt) : String(value),
        isTime: false,
        active: tr.active,
    };
}

const btnCls = 'shrink-0 flex items-center justify-center rounded transition-colors';
const btnStyle: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-secondary)',
    border: '1px solid var(--widget-border)',
};

// ── Switch (on/off) ─────────────────────────────────────────────────────────
// The "Schalter" display with the same option set as the standalone Schalter
// widget (issue #591): free write values per state, a separate status datapoint
// for devices that split command and feedback, condition-based evaluation and a
// slide / icon / image control. Shared by both lists AND by their badge layouts,
// which draw no control of their own but must agree on state and write value.

export function SwitchControl({
    entry,
    val,
    statusVal,
    writable,
    setState,
    activeColor,
    inactiveColor,
    trueLabel,
    falseLabel,
    card,
}: {
    entry: EntryControlConfig & { id: string };
    val: ioBrokerState['val'];
    /** Live value of `entry.statusDp`, when one is configured. */
    statusVal?: ioBrokerState['val'];
    writable: boolean;
    setState: SetState;
    activeColor: string;
    inactiveColor: string;
    trueLabel?: string;
    falseLabel?: string;
    /** Card layouts stack vertically: the control fills its cell. */
    card?: boolean;
}) {
    const anchorRef = useRef<HTMLButtonElement>(null);
    const active = switchEntryActive(entry, switchReadValue(entry, val, statusVal), entry.id);
    // Writes always target the entry's own datapoint — a status DP only reports.
    const write = () => {
        const w = switchWriteValues(entry, val);
        setState(entry.id, active ? w.off : w.on);
    };
    const { run, pending, confirm, cancel } = useConfirmAction(write, !!entry.confirm);
    const onClick = writable ? run : undefined;
    const cursor = writable ? 'pointer' : 'default';
    const label = active ? trueLabel || 'AN' : falseLabel || 'AUS';
    const overlay = pending ? (
        <ConfirmOverlay popup anchorRef={anchorRef} text={entry.confirmText} onConfirm={confirm} onCancel={cancel} />
    ) : null;
    const style = entry.switchStyle ?? 'slide';

    if (style === 'icon' || style === 'image') {
        const size = entry.iconSize ?? 22;
        const image = active ? entry.onImage : entry.offImage;
        const StateIcon = getWidgetIcon(active ? entry.trueIcon : entry.falseIcon, Power);
        return (
            <>
                <button
                    ref={anchorRef}
                    onClick={onClick}
                    className={`flex items-center justify-center ${card ? 'mx-auto' : 'shrink-0'}`}
                    style={{
                        color: active ? activeColor : inactiveColor,
                        cursor,
                        background: 'transparent',
                        padding: 2,
                    }}
                    aria-pressed={active}
                    aria-label={label}
                >
                    {style === 'image' && image ? (
                        <img
                            src={resolveImageSource(image)}
                            style={{ width: size, height: size, objectFit: 'contain' }}
                            alt=""
                        />
                    ) : (
                        <StateIcon size={size} strokeWidth={active ? 2.5 : 1.75} />
                    )}
                </button>
                {overlay}
            </>
        );
    }

    // Labelled pill — the on/off texts replace the toggle, as in the auto path.
    if (trueLabel || falseLabel) {
        const fill = active ? activeColor : inactiveColor;
        return (
            <>
                <button
                    ref={anchorRef}
                    onClick={onClick}
                    className={
                        card
                            ? 'w-full py-1.5 rounded-lg text-xs font-semibold'
                            : 'shrink-0 text-xs px-2.5 py-0.5 rounded-full font-medium'
                    }
                    style={{ background: `color-mix(in srgb, ${fill} 18%, transparent)`, color: fill, cursor }}
                >
                    {label}
                </button>
                {overlay}
            </>
        );
    }

    if (card)
        return (
            <>
                <button
                    ref={anchorRef}
                    onClick={onClick}
                    className="w-full py-1.5 rounded-lg text-xs font-semibold"
                    style={{
                        background: active ? activeColor : 'var(--app-border)',
                        color: active ? '#fff' : 'var(--text-secondary)',
                        cursor,
                    }}
                >
                    {label}
                </button>
                {overlay}
            </>
        );

    return (
        <>
            <button
                ref={anchorRef}
                onClick={onClick}
                className={`shrink-0 relative w-9 h-[18px] rounded-full transition-colors ${writable ? '' : 'pointer-events-none'}`}
                style={{ background: active ? activeColor : 'var(--app-border)' }}
                aria-pressed={active}
                aria-label={label}
            >
                <span
                    className="absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-all"
                    style={{ left: active ? 'calc(100% - 16px)' : '2px' }}
                />
            </button>
            {overlay}
        </>
    );
}

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
    valueColor,
}: {
    entry: EntryControlConfig & { id: string; unit?: string };
    val: ioBrokerState['val'];
    setState: SetState;
    decimals?: number;
    numFmt?: NumberFormat;
    size?: number;
    /** Colour for the printed value, from the entry's colour thresholds. Unset = inherit. */
    valueColor?: string;
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
            <span
                className="text-xs font-semibold tabular-nums min-w-[2.5ch] text-center"
                style={{ color: valueColor }}
            >
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

// ── Slider ────────────────────────────────────────────────────────────────────
// The "Schieberegler" display with the same option set as the standalone
// Schieberegler widget: scale + step, colour, native or bar look, write on
// release, read-only progress bar, value / unit / min-max labels. Shared by both
// lists so a row and the widget behave identically.
//
// Not carried over: the widget's vertical orientation (a list row is a horizontal
// strip) and its action buttons / status badges, which are widget chrome rather
// than a property of the value.

/** Base height a bar-style slider's `sliderBarSize` percentage applies to. */
const BAR_BASE_ROW = 16;
const BAR_BASE_CARD = 26;

/** Decimals implied by the step, so a step of 0.5 prints "21.5" and 1 prints "22". */
function stepDecimals(step: number): number {
    if (!Number.isFinite(step) || Math.floor(step) === step) return 0;
    return Math.min(4, (String(step).split('.')[1] ?? '').length);
}

export function SliderControl({
    entry,
    val,
    writable,
    setState,
    card,
    valueColor,
    className,
    textStyle,
}: {
    entry: EntryControlConfig & { id: string; unit?: string };
    val: ioBrokerState['val'];
    writable: boolean;
    setState: SetState;
    /** Card layouts stack vertically: the control fills its cell. */
    card?: boolean;
    /** Colour for the printed value, from a condition or the colour thresholds. */
    valueColor?: string;
    /** Classes for the value text in the read-only (text) fallback. */
    className?: string;
    /** Inline style for that fallback text (row width cap, condition font). */
    textStyle?: CSSProperties;
}) {
    const min = entry.sliderMin ?? 0;
    const max = entry.sliderMax ?? 100;
    const step = entry.sliderStep && entry.sliderStep > 0 ? entry.sliderStep : 1;
    const dec = stepDecimals(step);
    const color = entry.sliderColor || 'var(--accent)';
    const showValue = entry.sliderShowValue !== false;
    const unit = entry.sliderShowUnit === false ? '' : (entry.unit ?? '%');
    const readOnly = !!entry.sliderReadOnly;
    const barStyle = !!entry.sliderBarStyle;
    const barBase = card ? BAR_BASE_CARD : BAR_BASE_ROW;
    const barHeight = Math.max(4, Math.round((barBase * (entry.sliderBarSize ?? 100)) / 100));
    const thickness = entry.sliderThickness ?? (card ? 6 : 4);

    // Drag drafts, so "write on release" can show the thumb moving without writing.
    const [pending, setPending] = useState<number | null>(null);

    const raw =
        typeof val === 'number'
            ? val
            : typeof val === 'boolean'
              ? val
                  ? max
                  : min
              : Number.isFinite(Number(val))
                ? Number(val)
                : min;
    const shown = pending ?? raw;
    const ratio = max > min ? Math.max(0, Math.min(1, (shown - min) / (max - min))) : 0;
    const valueText = `${shown.toFixed(dec)}${unit}`;

    const write = (v: number) => {
        const stepped = Math.round((v - min) / step) * step + min;
        setState(entry.id, Number(Math.max(min, Math.min(max, stepped)).toFixed(4)));
    };
    const change = (v: number) => {
        if (entry.sliderCommitOnRelease) setPending(v);
        else write(v);
    };
    const release = () => {
        if (entry.sliderCommitOnRelease && pending != null) {
            write(pending);
            setPending(null);
        }
    };

    // A datapoint nobody can write is not a control at all — it prints its value,
    // the way every other read-only row does. `sliderReadOnly` is the deliberate
    // choice to keep the bar as a progress display, so it still renders.
    if (!writable && !readOnly)
        return (
            <span
                className={className ?? 'shrink-0 text-xs font-medium tabular-nums'}
                style={{ ...textStyle, color: valueColor }}
            >
                {valueText}
            </span>
        );

    const barValue = (e: React.PointerEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        return min + Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * (max - min);
    };

    const control = barStyle ? (
        <div
            className={`aura-slider-bar nodrag relative rounded-full overflow-hidden select-none${readOnly ? '' : ' cursor-pointer'}`}
            style={{
                width: '100%',
                height: barHeight,
                background: `color-mix(in srgb, ${color} 20%, var(--app-bg))`,
            }}
            onPointerDown={
                readOnly
                    ? undefined
                    : (e) => {
                          e.currentTarget.setPointerCapture(e.pointerId);
                          change(barValue(e));
                      }
            }
            onPointerMove={
                readOnly
                    ? undefined
                    : (e) => {
                          if (e.buttons & 1) change(barValue(e));
                      }
            }
            onPointerUp={readOnly ? undefined : release}
        >
            <div
                className="absolute top-0 left-0 bottom-0 rounded-full"
                style={{ width: `${ratio * 100}%`, background: color }}
            />
        </div>
    ) : (
        <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={shown}
            disabled={readOnly}
            onChange={readOnly ? undefined : (e) => change(Number(e.target.value))}
            onMouseUp={readOnly ? undefined : release}
            onTouchEnd={readOnly ? undefined : release}
            onKeyUp={readOnly ? undefined : release}
            className={`aura-slider-range nodrag w-full rounded-full${readOnly ? '' : ' cursor-pointer'}`}
            style={
                {
                    '--slider-thumb-color': color,
                    accentColor: color,
                    height: thickness,
                    ...(readOnly ? { opacity: 1 } : {}),
                } as CSSProperties
            }
        />
    );

    const edge = (v: number) => (
        <span className="text-[10px] shrink-0 tabular-nums" style={{ color: 'var(--text-secondary)' }}>
            {v}
        </span>
    );

    if (card)
        return (
            <div className="w-full flex flex-col items-center gap-1">
                {showValue && (
                    <span className="text-xl font-bold tabular-nums" style={{ color: valueColor }}>
                        {shown.toFixed(dec)}
                        {unit && (
                            <span className="text-sm ml-0.5 font-normal" style={{ color: 'var(--text-secondary)' }}>
                                {unit}
                            </span>
                        )}
                    </span>
                )}
                <div className="w-full flex items-center gap-1.5">
                    {entry.sliderShowMinMax && edge(min)}
                    <div className="flex-1 min-w-0 flex items-center">{control}</div>
                    {entry.sliderShowMinMax && edge(max)}
                </div>
            </div>
        );

    return (
        <div className="shrink-0 flex items-center gap-1.5">
            {entry.sliderShowMinMax && edge(min)}
            <div className="flex items-center" style={{ width: entry.sliderWidth ?? 80 }}>
                {control}
            </div>
            {entry.sliderShowMinMax && edge(max)}
            {showValue && (
                <span
                    className="text-[10px] text-right tabular-nums shrink-0"
                    style={{ minWidth: '2rem', color: valueColor ?? 'var(--text-secondary)' }}
                >
                    {valueText}
                </span>
            )}
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

// ── Date/time entry (Datumswähler) ───────────────────────────────────────────
// The Datumswähler widget shrunk into a list row: the same option set (native
// pickers or a token pattern, time-only, output format) writing the picked value
// back to the entry's datapoint.

/** The entry's picker options in the shape the shared date fields expect. */
export function entryDateSettings(entry: EntryControlConfig): DateValueSettings {
    return {
        inputFormat: entry.dateInputFormat === 'custom' ? 'custom' : 'picker',
        inputPattern: entry.dateInputPattern,
        timeOnly: entry.dateTimeOnly === true,
        showTime: entry.dateShowTime === true,
        outputFormat: entry.dateOutputFormat ?? 'timestamp_ms',
        outputPattern: entry.dateOutputPattern,
    };
}

/** Readable text of a datepicker entry's value — for layouts with no room for fields. */
export function entryDateText(entry: EntryControlConfig, val: ioBrokerState['val']): string {
    return dateValueText(val, entryDateSettings(entry));
}

export function DateEntryControl({
    entry,
    val,
    setState,
    fullWidth,
}: {
    entry: EntryControlConfig & { id: string };
    val: ioBrokerState['val'];
    setState: SetState;
    /** Card layouts stack vertically, so the fields take the whole cell there. */
    fullWidth?: boolean;
}) {
    const { dateInput, timeInput } = useDateValueFields({
        value: val,
        settings: entryDateSettings(entry),
        onWrite: (v) => setState(entry.id, v),
        className: `aura-widget-action nodrag focus:outline-none${fullWidth ? ' flex-1 min-w-0' : ''}`,
        wrapClassName: fullWidth ? 'flex-1 min-w-0' : undefined,
        style: {
            background: 'var(--app-bg)',
            color: 'var(--text-primary)',
            border: '1px solid var(--widget-border)',
            borderRadius: 8,
            padding: '2px 6px',
            fontSize: 11,
            colorScheme: 'dark' as never,
            minWidth: 0,
        },
    });
    return (
        <div
            className={`flex items-center gap-1 flex-wrap justify-end ${fullWidth ? 'w-full' : 'shrink-0'}`}
            // The row itself is clickable (popup); picking a date must not bubble up to it.
            onClick={(e) => e.stopPropagation()}
        >
            {dateInput}
            {timeInput}
        </div>
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
