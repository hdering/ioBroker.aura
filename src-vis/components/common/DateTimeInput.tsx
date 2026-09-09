/**
 * A native date/time field that always has a working way to pick a value.
 *
 * Two separate browser gaps sit behind issue #544, and only both together make
 * the field usable everywhere:
 *
 *  1. The BUTTON. Chromium paints a calendar/clock button into every date/time
 *     field; Gecko paints one for date fields and leaves `time` completely bare.
 *     So we draw our own — where the engine's own can be taken out (via
 *     `.aura-dt-input` in index.css) ours replaces it, and where it stays we
 *     keep out of the field. Two buttons in one field would be worse than the
 *     bug: that is issue #633, a Chromium that kept painting its clock next to
 *     ours.
 *
 *     Which of the two it is, is MEASURED rather than assumed (`nativeOwnsField`
 *     below) — a browser list would be wrong again the next time an engine gains
 *     or loses a button.
 *
 *  2. The PICKER ITSELF. Gecko has no time picker at all: showPicker() on a
 *     `time` field is a silent no-op there (it neither throws nor opens
 *     anything, and `:open` stays false, while the very same call opens a panel
 *     for `date` and `datetime-local`). A button alone would therefore stay dead
 *     in Firefox — so when the native picker does not open, we show our own
 *     hour/minute list instead.
 *
 * Engines without showPicker, and field types an engine does not implement at
 * all (Gecko has no `month` field), keep the plain native input.
 */
import { useRef, useState } from 'react';
import { PickerButton, PickerColumn, PickerPopover, PICKER_BTN_SPACE, type PickerItem } from './PickerPopover';

export type PickerKind = 'date' | 'time' | 'datetime-local' | 'month';

const cssSupports = (q: string) => typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports(q);

/** Whether the engine even parses the selector our hiding rule is written with. */
const KNOWS_INDICATOR = cssSupports('selector(::-webkit-calendar-picker-indicator)');

/** `:open` matches a field whose picker is showing — how we notice a no-op. */
const CAN_SEE_OPEN = cssSupports('selector(:open)');

/** Sub-pixel noise in a width comparison; a picker button is far wider than this. */
const WIDTH_SLACK = 2;

/** Intrinsic width of a throwaway field of this kind — the engine's own picture of it. */
function fieldWidth(kind: PickerKind, ours: boolean, disabled: boolean): number {
    const el = document.createElement('input');
    el.type = kind;
    if (ours) el.className = 'aura-dt-input';
    if (disabled) el.disabled = true;
    // No padding/border of our own: what is left is the engine's own layout —
    // the text segments plus whatever affordance it puts beside them.
    el.style.cssText = 'position:absolute;left:-9999px;top:0;font-size:14px;padding:0;border:0;box-sizing:content-box';
    document.body.appendChild(el);
    const w = el.getBoundingClientRect().width;
    el.remove();
    return w;
}

const ownershipCache = new Map<PickerKind, boolean>();

/**
 * Whether the engine still owns this field's picker affordance — i.e. whether
 * drawing ours would put a SECOND icon in the field (issue #633).
 *
 * Measured, not assumed: a field that reserves less room once `.aura-dt-input`
 * applies has lost its icon to us, and one that shrinks when it is disabled
 * carries an icon the rule never touched (Gecko draws one on `date`, none on
 * `time`). An engine that parses `::-webkit-calendar-picker-indicator` yet does
 * not budge for it keeps whatever it paints there — the field stays the
 * engine's, and we stay out of it.
 */
function nativeOwnsField(kind: PickerKind): boolean {
    const cached = ownershipCache.get(kind);
    if (cached !== undefined) return cached;
    const plain = fieldWidth(kind, false, false);
    const withRule = fieldWidth(kind, true, false);
    let owns: boolean;
    if (plain - withRule > WIDTH_SLACK)
        owns = false; // the rule took the engine's icon out
    else if (KNOWS_INDICATOR)
        owns = true; // rule understood, nothing moved → not ours to remove
    else owns = withRule - fieldWidth(kind, true, true) > WIDTH_SLACK; // shrinks when disabled = its own button
    ownershipCache.set(kind, owns);
    return owns;
}

const supportCache = new Map<PickerKind, boolean>();

/** Whether this browser implements the field type AND we should own its button. */
function canOpenPicker(kind: PickerKind): boolean {
    const cached = supportCache.get(kind);
    if (cached !== undefined) return cached;
    let ok = false;
    if (typeof document !== 'undefined' && typeof HTMLInputElement.prototype.showPicker === 'function') {
        // An unimplemented type silently falls back to 'text' — no picker behind it.
        const probe = document.createElement('input');
        probe.type = kind;
        ok = probe.type === kind && !nativeOwnsField(kind);
    }
    supportCache.set(kind, ok);
    return ok;
}

/**
 * Whether the engine's own time picker actually opens. Unknown until the first
 * click — showPicker() needs a user gesture, so it cannot be probed up front.
 * Remembered for the session so later clicks go straight to the right one.
 */
let nativeTimePicker: boolean | null = null;

/**
 * Open a field's own picker, falling back to the caret. For callers that draw
 * their own trigger around a field rather than using the component below — the
 * advanced chart's day navigation opens its date field from the date label
 * (issue #594). Returns whether showPicker() was reached at all.
 *
 * The input has to be RENDERED for this: showPicker() throws on a `display:none`
 * field, so collapse it (size, opacity) instead of hiding it.
 */
export function openNativePicker(el: HTMLInputElement | null): boolean {
    if (!el) return false;
    try {
        el.showPicker();
        return true;
    } catch {
        // Blocked (no user activation), or the engine has no picker for this type —
        // at least put the caret in the field so the value stays editable.
        el.focus();
        return false;
    }
}

const pad = (n: number) => String(n).padStart(2, '0');
const numbers = (count: number): PickerItem[] =>
    Array.from({ length: count }, (_, i) => ({ value: pad(i), label: pad(i) }));
const HOURS = numbers(24);
const MINUTES = numbers(60);

interface Props extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> {
    kind: PickerKind;
    value: string;
    /** Called with the field's new value — from the native field and from our own list alike. */
    onValue: (value: string) => void;
    /**
     * Classes for the wrapper. Layout classes that used to sit on the input
     * (`flex-1`, `w-full`) belong here as soon as the button wraps it.
     */
    wrapClassName?: string;
    wrapStyle?: React.CSSProperties;
}

export function DateTimeInput({
    kind,
    value,
    onValue,
    className = '',
    style,
    wrapClassName = '',
    wrapStyle,
    ...rest
}: Props) {
    const ref = useRef<HTMLInputElement>(null);
    const btnRef = useRef<HTMLButtonElement>(null);
    const [ownList, setOwnList] = useState(false);

    const input = (
        <input
            ref={ref}
            type={kind}
            value={value}
            onChange={(e) => onValue(e.target.value)}
            className={canOpenPicker(kind) ? `aura-dt-input ${className}` : className}
            style={canOpenPicker(kind) ? { ...style, paddingRight: PICKER_BTN_SPACE } : style}
            {...rest}
        />
    );

    if (!canOpenPicker(kind)) return input;

    /** Native picker first; our own list only when the engine opens nothing. */
    const open = () => {
        const el = ref.current;
        if (!el) return;
        if (kind === 'time' && nativeTimePicker === false) {
            setOwnList(true);
            return;
        }
        const called = openNativePicker(el);
        if (kind !== 'time') return;
        if (!CAN_SEE_OPEN) {
            // No way to tell whether it opened. Blink/WebKit have a time picker;
            // an engine that does not even know the indicator selector (Gecko)
            // never had one.
            nativeTimePicker = KNOWS_INDICATOR;
            if (!nativeTimePicker) setOwnList(true);
            return;
        }
        // The panel goes up in the same task, but read it a frame later so a
        // slow open is not mistaken for a no-op.
        requestAnimationFrame(() => {
            const cur = ref.current;
            if (!cur) return;
            nativeTimePicker = called && cur.matches(':open');
            if (!nativeTimePicker) setOwnList(true);
        });
    };

    return (
        <span className={`relative inline-flex items-center ${wrapClassName}`} style={{ flexShrink: 0, ...wrapStyle }}>
            {input}
            <PickerButton icon={kind === 'time' ? 'time' : 'date'} onOpen={open} btnRef={btnRef} />
            {ownList && (
                <TimeList
                    anchorRef={btnRef}
                    value={value}
                    onClose={() => setOwnList(false)}
                    onPick={(v, done) => {
                        onValue(v);
                        if (done) setOwnList(false);
                    }}
                />
            )}
        </span>
    );
}

/** Hour/minute list for engines without a native time picker. */
function TimeList({
    anchorRef,
    value,
    onClose,
    onPick,
}: {
    anchorRef: React.RefObject<HTMLButtonElement>;
    value: string;
    onClose: () => void;
    onPick: (value: string, done: boolean) => void;
}) {
    const parts = /^(\d{2}):(\d{2})/.exec(value);
    const curH = parts?.[1] ?? '00';
    const curM = parts?.[2] ?? '00';

    return (
        <PickerPopover anchorRef={anchorRef} onClose={onClose}>
            <PickerColumn items={HOURS} current={curH} onSelect={(h) => onPick(`${h}:${curM}`, false)} label="Stunde" />
            <PickerColumn
                items={MINUTES}
                current={curM}
                onSelect={(m) => onPick(`${curH}:${m}`, true)}
                label="Minute"
                divider
            />
        </PickerPopover>
    );
}
