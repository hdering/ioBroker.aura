/**
 * Field for a custom date pattern that no native input covers — `yyyy`, `dd.MM`,
 * `MM` and friends.
 *
 * Such a pattern used to render as a bare text box: the browser has no year (or
 * day-without-year, …) field, so there was nothing to open and the widget looked
 * dead. The field stays free text — typing and Enter/blur keep working exactly as
 * before — but it now carries the same picker button as every other date field,
 * and that button opens a list of our own with one column per part the pattern
 * names. Parts the pattern leaves out keep their stored value.
 */
import { useRef, useState } from 'react';
import { PickerButton, PickerColumn, PickerPopover, PICKER_BTN_SPACE, type PickerItem } from './PickerPopover';
import { patternTokens, type DateToken } from '../../utils/datePattern';

const pad = (n: number) => String(n).padStart(2, '0');

/** How far the year column reaches on either side of the current year. */
const YEAR_SPAN = 25;

const TOKEN_LABEL: Record<DateToken, string> = {
    yyyy: 'Jahr',
    yy: 'Jahr',
    MM: 'Monat',
    dd: 'Tag',
    HH: 'Stunde',
    hh: 'Stunde',
    mm: 'Minute',
    ss: 'Sekunde',
};

const TIME_TOKENS: DateToken[] = ['HH', 'hh', 'mm', 'ss'];

const numbers = (from: number, to: number): PickerItem[] =>
    Array.from({ length: to - from + 1 }, (_, i) => ({ value: pad(from + i), label: pad(from + i) }));

/** The entries a token's column offers, centred on / clamped to `d`. */
function itemsFor(tok: DateToken, d: Date): PickerItem[] {
    switch (tok) {
        case 'yyyy':
        case 'yy': {
            const y = d.getFullYear();
            return Array.from({ length: YEAR_SPAN * 2 + 1 }, (_, i) => {
                const year = String(y - YEAR_SPAN + i);
                // A `yy` pattern prints two digits — the column has to read the same.
                return { value: year, label: tok === 'yy' ? year.slice(-2) : year };
            });
        }
        case 'MM':
            return numbers(1, 12);
        case 'dd':
            // Never offer a day the selected month does not have.
            return numbers(1, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate());
        case 'HH':
            return numbers(0, 23);
        case 'hh':
            return numbers(1, 12);
        default:
            return numbers(0, 59);
    }
}

/** Which entry of a token's column `d` currently sits on. */
function currentOf(tok: DateToken, d: Date): string {
    switch (tok) {
        case 'yyyy':
        case 'yy':
            return String(d.getFullYear());
        case 'MM':
            return pad(d.getMonth() + 1);
        case 'dd':
            return pad(d.getDate());
        case 'HH':
            return pad(d.getHours());
        case 'hh':
            return pad(d.getHours() % 12 || 12);
        case 'mm':
            return pad(d.getMinutes());
        default:
            return pad(d.getSeconds());
    }
}

/** `d` with one part replaced; every other part — including those no column shows — is kept. */
export function withPart(d: Date, tok: DateToken, value: string): Date {
    const n = Number(value);
    let year = d.getFullYear();
    let month = d.getMonth();
    let day = d.getDate();
    let hours = d.getHours();
    let minutes = d.getMinutes();
    let seconds = d.getSeconds();
    switch (tok) {
        case 'yyyy':
        case 'yy':
            year = n;
            break;
        case 'MM':
            month = n - 1;
            break;
        case 'dd':
            day = n;
            break;
        case 'HH':
            hours = n;
            break;
        case 'hh':
            // A 12-hour column cannot say morning or afternoon — keep the stored half.
            hours = hours >= 12 ? (n % 12) + 12 : n % 12;
            break;
        case 'mm':
            minutes = n;
            break;
        case 'ss':
            seconds = n;
            break;
    }
    // 31 carried into a shorter month would roll over into the next one.
    return new Date(year, month, Math.min(day, new Date(year, month + 1, 0).getDate()), hours, minutes, seconds, 0);
}

interface Props extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> {
    /** The token pattern the field reads and writes, e.g. `KW ww/yyyy`. */
    pattern: string;
    value: string;
    /** The stored date the picker starts from; parts outside the pattern come from here. */
    base: Date | null;
    /** Every keystroke — the field stays controlled by its owner. */
    onText: (value: string) => void;
    /** Enter or leaving the field: parse and write, or mark it invalid. */
    onCommit: (raw: string) => void;
    /** A date assembled in our picker. */
    onPick: (date: Date) => void;
    /** Classes/styles for the wrapper the button needs — layout classes belong here. */
    wrapClassName?: string;
    wrapStyle?: React.CSSProperties;
}

export function PatternInput({
    pattern,
    value,
    base,
    onText,
    onCommit,
    onPick,
    className = '',
    style,
    wrapClassName = '',
    wrapStyle,
    ...rest
}: Props) {
    const btnRef = useRef<HTMLButtonElement>(null);
    /** The date the open panel is building — `null` while it is closed. */
    const [draft, setDraft] = useState<Date | null>(null);

    const tokens = patternTokens(pattern);

    const input = (
        <input
            type="text"
            value={value}
            onChange={(e) => onText(e.target.value)}
            onBlur={(e) => onCommit(e.target.value)}
            onKeyDown={(e) => {
                if (e.key === 'Enter') onCommit((e.target as HTMLInputElement).value);
            }}
            className={className}
            style={tokens.length ? { ...style, paddingRight: PICKER_BTN_SPACE } : style}
            {...rest}
        />
    );

    // A pattern of pure literals has nothing to pick — no button in front of it.
    if (!tokens.length) return input;

    const pick = (tok: DateToken, v: string, last: boolean) => {
        const next = withPart(draft ?? new Date(), tok, v);
        onPick(next);
        // The last column ends the round trip, like the minute in the time list.
        setDraft(last ? null : next);
    };

    return (
        <span className={`relative inline-flex items-center ${wrapClassName}`} style={{ flexShrink: 0, ...wrapStyle }}>
            {input}
            <PickerButton
                icon={tokens.every((t) => TIME_TOKENS.includes(t)) ? 'time' : 'date'}
                onOpen={() => setDraft(base && !isNaN(base.getTime()) ? base : new Date())}
                btnRef={btnRef}
            />
            {draft && (
                <PickerPopover anchorRef={btnRef} onClose={() => setDraft(null)}>
                    {tokens.map((tok, i) => (
                        <PickerColumn
                            key={tok}
                            items={itemsFor(tok, draft)}
                            current={currentOf(tok, draft)}
                            onSelect={(v) => pick(tok, v, i === tokens.length - 1)}
                            label={TOKEN_LABEL[tok]}
                            divider={i > 0}
                        />
                    ))}
                </PickerPopover>
            )}
        </span>
    );
}
