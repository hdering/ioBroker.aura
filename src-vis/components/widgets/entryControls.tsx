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

export type EntryDisplayType = 'auto' | 'switch' | 'slider' | 'value' | 'shutter' | 'stepper' | 'buttons' | 'momentary';

/** Control types that are not a simple on/off and must be excluded from the
 *  group master switch. */
export const NON_TOGGLE_DISPLAY_TYPES: ReadonlySet<string> = new Set(['shutter', 'stepper', 'buttons', 'momentary']);

export interface EntryPreset {
    value: string | number;
    label?: string;
}

/** Per-entry control config — mixed into StaticListEntry and AutoListEntry. */
export interface EntryControlConfig {
    displayType?: EntryDisplayType;
    // ── shutter ──────────────────────────────────────────────────────────────
    shutterUpDp?: string;
    shutterStopDp?: string;
    shutterDownDp?: string;
    /** Value written to a shutter command DP on press. Default true. */
    shutterWriteValue?: string | number | boolean;
    // ── stepper ──────────────────────────────────────────────────────────────
    stepMin?: number;
    stepMax?: number;
    stepStep?: number;
    // ── buttons (value presets) ────────────────────────────────────────────────
    presets?: EntryPreset[];
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
    setState,
    size = 26,
}: {
    entry: EntryControlConfig;
    setState: SetState;
    size?: number;
}) {
    const write = parseWrite(entry.shutterWriteValue, true);
    const iconSize = Math.round(size * 0.5);
    const Btn = ({ dp, children, label }: { dp?: string; children: React.ReactNode; label: string }) => (
        <button
            onClick={dp ? () => setState(dp, write) : undefined}
            disabled={!dp}
            title={label}
            aria-label={label}
            className={`${btnCls} disabled:opacity-30`}
            style={{ ...btnStyle, width: size, height: size, cursor: dp ? 'pointer' : 'default' }}
        >
            {children}
        </button>
    );
    return (
        <div className="shrink-0 flex items-center gap-1">
            <Btn dp={entry.shutterUpDp} label="Auf">
                <ChevronUp size={iconSize} />
            </Btn>
            <Btn dp={entry.shutterStopDp} label="Stop">
                <Square size={Math.round(iconSize * 0.7)} />
            </Btn>
            <Btn dp={entry.shutterDownDp} label="Ab">
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
    return (
        <button
            onClick={press}
            className="shrink-0 flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg transition-transform active:scale-95"
            style={{ background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer' }}
        >
            {Icon && <Icon size={13} />}
            {entry.pulseLabel || 'Auslösen'}
        </button>
    );
}
