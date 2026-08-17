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
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, Clock } from 'lucide-react';
import { usePortalTarget } from '../../contexts/PortalTargetContext';

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

/** Room reserved at the right edge of the field for the button. */
const BTN_SPACE = 22;

const pad = (n: number) => String(n).padStart(2, '0');
const HOURS = Array.from({ length: 24 }, (_, i) => pad(i));
const MINUTES = Array.from({ length: 60 }, (_, i) => pad(i));

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
            style={canOpenPicker(kind) ? { ...style, paddingRight: BTN_SPACE } : style}
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
        let called = false;
        try {
            el.showPicker();
            called = true;
        } catch {
            // Blocked (no user activation) or unsupported after all — at least
            // put the caret in the field so the value stays editable.
            el.focus();
        }
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

    const Icon = kind === 'time' ? Clock : CalendarDays;
    return (
        <span className={`relative inline-flex items-center ${wrapClassName}`} style={{ flexShrink: 0, ...wrapStyle }}>
            {input}
            <button
                ref={btnRef}
                type="button"
                // The field itself is the keyboard path; a second tab stop that
                // only opens a mouse/touch picker would just be in the way.
                tabIndex={-1}
                aria-label="Auswahl öffnen"
                title="Auswahl öffnen"
                className="aura-widget-action nodrag"
                onClick={(e) => {
                    e.stopPropagation();
                    open();
                }}
                style={{
                    position: 'absolute',
                    right: 5,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'none',
                    border: 0,
                    padding: 0,
                    lineHeight: 0,
                    cursor: 'pointer',
                    color: 'var(--text-primary)',
                    opacity: 0.6,
                }}
            >
                <Icon size={13} />
            </button>
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

/**
 * Hour/minute list for engines without a native time picker. Portaled like
 * HtmlSelect so a widget's overflow cannot clip it, and clamped into the
 * viewport.
 */
const THEME_VAR_NAMES = [
    '--app-bg',
    '--app-surface',
    '--app-border',
    '--text-primary',
    '--text-secondary',
    '--accent',
] as const;

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
    const portalTarget = usePortalTarget();
    const panelRef = useRef<HTMLDivElement>(null);
    const parts = /^(\d{2}):(\d{2})/.exec(value);
    const curH = parts?.[1] ?? '00';
    const curM = parts?.[2] ?? '00';

    useLayoutEffect(() => {
        const panel = panelRef.current;
        const anchor = anchorRef.current;
        if (!panel || !anchor) return;

        // Inherit the widget's theme even when the portal lands in another scope.
        const cs = getComputedStyle(anchor);
        for (const name of THEME_VAR_NAMES) {
            const v = cs.getPropertyValue(name).trim();
            if (v) panel.style.setProperty(name, v);
        }

        const p = panel.getBoundingClientRect();
        const a = anchor.getBoundingClientRect();
        const GAP = 4;
        let left = a.right - p.width;
        if (left + p.width > window.innerWidth - GAP) left = window.innerWidth - GAP - p.width;
        if (left < GAP) left = GAP;
        let top = a.bottom + GAP;
        if (top + p.height > window.innerHeight - GAP) top = a.top - p.height - GAP;
        if (top < GAP) top = GAP;
        panel.style.top = `${top}px`;
        panel.style.left = `${left}px`;
        panel.style.visibility = 'visible';
        panel.querySelectorAll<HTMLElement>('[data-sel="1"]').forEach((el) => el.scrollIntoView({ block: 'center' }));
    }, [anchorRef]);

    useEffect(() => {
        const away = (e: MouseEvent) => {
            if (!panelRef.current?.contains(e.target as Node) && !anchorRef.current?.contains(e.target as Node)) {
                onClose();
            }
        };
        const key = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('mousedown', away);
        document.addEventListener('keydown', key);
        return () => {
            document.removeEventListener('mousedown', away);
            document.removeEventListener('keydown', key);
        };
    }, [anchorRef, onClose]);

    const column = (items: string[], current: string, onSelect: (v: string) => void, label: string) => (
        <div className="overflow-y-auto" style={{ maxHeight: 176, scrollbarWidth: 'thin' }} aria-label={label}>
            {items.map((it) => {
                const sel = it === current;
                return (
                    <button
                        key={it}
                        type="button"
                        data-sel={sel ? '1' : '0'}
                        onClick={() => onSelect(it)}
                        className="block w-full text-center px-3 py-1 text-xs hover:opacity-80"
                        style={{
                            background: sel ? 'var(--accent)' : 'transparent',
                            color: sel ? '#fff' : 'var(--text-primary)',
                        }}
                    >
                        {it}
                    </button>
                );
            })}
        </div>
    );

    return createPortal(
        <div
            ref={panelRef}
            className="nodrag fixed z-[9999] rounded-lg shadow-2xl flex"
            style={{
                top: -9999,
                left: -9999,
                visibility: 'hidden',
                background: 'var(--app-surface)',
                border: '1px solid var(--app-border)',
                overflow: 'hidden',
            }}
            onMouseDown={(e) => e.stopPropagation()}
        >
            {column(HOURS, curH, (h) => onPick(`${h}:${curM}`, false), 'Stunde')}
            <div style={{ width: 1, background: 'var(--app-border)' }} />
            {column(MINUTES, curM, (m) => onPick(`${curH}:${m}`, true), 'Minute')}
        </div>,
        portalTarget,
    );
}
