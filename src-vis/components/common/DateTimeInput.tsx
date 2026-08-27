/**
 * A native date/time field that always has a working way to pick a value.
 *
 * Two separate browser gaps sit behind issue #544, and only both together make
 * the field usable everywhere:
 *
 *  1. The BUTTON. Chromium paints a calendar/clock button into every date/time
 *     field; Gecko paints one for date fields and leaves `time` completely bare.
 *     So we draw our own — where Chromium's can be hidden (it exposes
 *     ::-webkit-calendar-picker-indicator, hidden via `.aura-dt-input` in
 *     index.css) ours replaces it, and where it cannot be hidden (Gecko) we only
 *     step in for the field types the engine leaves bare. Two buttons in one
 *     field would be worse than the bug.
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

/** Whether the engine lets us take its own picker button out of the field. */
const CAN_HIDE_NATIVE =
    typeof CSS !== 'undefined' &&
    typeof CSS.supports === 'function' &&
    CSS.supports('selector(::-webkit-calendar-picker-indicator)');

/** `:open` matches a field whose picker is showing — how we notice a no-op. */
const CAN_SEE_OPEN =
    typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('selector(:open)');

/**
 * Field types that get no picker button from an engine whose own button we
 * cannot hide. Gecko is the case in point: its date fields carry a calendar
 * button, its time fields carry nothing — that gap is issue #544.
 */
const BARE_WITHOUT_OURS: PickerKind[] = ['time'];

const supportCache = new Map<PickerKind, boolean>();

/** Whether this browser implements the field type AND we should own its button. */
function canOpenPicker(kind: PickerKind): boolean {
    const cached = supportCache.get(kind);
    if (cached !== undefined) return cached;
    let ok = false;
    if (
        typeof document !== 'undefined' &&
        typeof HTMLInputElement.prototype.showPicker === 'function' &&
        (CAN_HIDE_NATIVE || BARE_WITHOUT_OURS.includes(kind))
    ) {
        // An unimplemented type silently falls back to 'text' — no picker behind it.
        const probe = document.createElement('input');
        probe.type = kind;
        ok = probe.type === kind;
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
            // an engine whose button we cannot hide (Gecko) never had one.
            nativeTimePicker = CAN_HIDE_NATIVE;
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
