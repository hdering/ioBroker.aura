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
 */
import { useRef } from 'react';
import { ChevronUp, ChevronDown, Square, Minus, Plus } from 'lucide-react';
import type { ioBrokerState } from '../../types';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { useConfirmAction } from '../../hooks/useConfirmAction';
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
    | 'contact';

/** Control types that are not a simple on/off and must be excluded from the
 *  group master switch. */
export const NON_TOGGLE_DISPLAY_TYPES: ReadonlySet<string> = new Set([
    'shutter',
    'stepper',
    'buttons',
    'momentary',
    'states',
    'contact',
]);

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
    size = 24,
}: {
    entry: EntryControlConfig & { id: string; unit?: string };
    val: ioBrokerState['val'];
    setState: SetState;
    decimals?: number;
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
                {typeof val === 'number' ? cur.toFixed(decimals) : '–'}
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
