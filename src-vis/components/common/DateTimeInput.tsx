import { useRef } from 'react';
import { CalendarDays, Clock } from 'lucide-react';

/**
 * A native date/time field that always carries a visible way to open its picker.
 *
 * Browsers disagree on that affordance: Chromium paints a calendar/clock button
 * into every date/time field, Gecko paints one for date fields but leaves a
 * `time` field completely bare. The very same widget therefore offered a
 * dropdown in one browser and looked like a plain typing field in the other
 * (issue #544), so we draw a button of our own and open the picker through
 * `showPicker()` — the one API every engine that HAS a picker implements.
 *
 * Where we draw it depends on what the engine does, because two picker buttons
 * in one field would be worse than the bug:
 *
 *   • Blink/WebKit expose the native button as ::-webkit-calendar-picker-indicator,
 *     which `.aura-dt-input` (index.css) hides — ours replaces it everywhere.
 *   • Gecko exposes no such pseudo-element, so its calendar button cannot be
 *     removed. There we only step in for the field types it leaves bare.
 *
 * Engines without `showPicker`, and field types an engine does not implement at
 * all (Gecko has no `month` field), keep the plain native input: a button that
 * cannot open anything would be worse than none.
 */

export type PickerKind = 'date' | 'time' | 'datetime-local' | 'month';

/** Whether the engine lets us take its own picker button out of the field. */
const CAN_HIDE_NATIVE =
    typeof CSS !== 'undefined' &&
    typeof CSS.supports === 'function' &&
    CSS.supports('selector(::-webkit-calendar-picker-indicator)');

/**
 * Field types that get no picker button from an engine whose own button we
 * cannot hide. Gecko is the case in point: its date fields carry a calendar
 * button, its time fields carry nothing — that gap is issue #544.
 */
const BARE_WITHOUT_OURS: PickerKind[] = ['time'];

const supportCache = new Map<PickerKind, boolean>();

/** Whether this browser implements the field type AND can open its picker on demand. */
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

/** Room reserved at the right edge of the field for the button. */
const BTN_SPACE = 22;

interface Props extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
    kind: PickerKind;
    /**
     * Classes for the wrapper. Layout classes that used to sit on the input
     * (`flex-1`, `w-full`) belong here as soon as the button wraps it.
     */
    wrapClassName?: string;
    wrapStyle?: React.CSSProperties;
}

export function DateTimeInput({ kind, className = '', style, wrapClassName = '', wrapStyle, ...rest }: Props) {
    const ref = useRef<HTMLInputElement>(null);

    if (!canOpenPicker(kind)) {
        return <input ref={ref} type={kind} className={className} style={style} {...rest} />;
    }

    const open = () => {
        const el = ref.current;
        if (!el) return;
        try {
            el.showPicker();
        } catch {
            // Blocked (no user activation) or unsupported after all — at least
            // put the caret in the field so the value stays editable.
            el.focus();
        }
    };

    const Icon = kind === 'time' ? Clock : CalendarDays;
    return (
        <span className={`relative inline-flex items-center ${wrapClassName}`} style={{ flexShrink: 0, ...wrapStyle }}>
            <input
                ref={ref}
                type={kind}
                className={`aura-dt-input ${className}`}
                style={{ ...style, paddingRight: BTN_SPACE }}
                {...rest}
            />
            <button
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
        </span>
    );
}
