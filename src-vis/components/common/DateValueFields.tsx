/**
 * Shared date/time picker fields for a datapoint.
 *
 * One implementation of "render the input(s) the configured pattern asks for,
 * keep them in sync with the datapoint and write the value back in the
 * configured output format" — used by the Datumswähler widget, the custom-layout
 * datepicker cell and the list widgets' "Datumswähler" display type.
 *
 * The caller owns the surrounding markup (layouts, cells, list rows) and only
 * places the two returned nodes.
 */
import { useEffect, useState } from 'react';
import { DateTimeInput } from './DateTimeInput';
import { PatternInput } from './PatternInput';
import { PICKER_BTN_SPACE } from './PickerPopover';
import {
    DEFAULT_DATE_PATTERN,
    formatCustom,
    formatDate,
    fromInputValue,
    inputKindFor,
    parseCustom,
    parseValue,
    toDateInputValue,
    toInputValue,
    toTimeInputValue,
    type DateOutputFormat,
} from '../../utils/dateValue';

/** Width of a free-text pattern field that fits `pattern` plus the picker button. */
function patternFieldWidth(pattern: string): string {
    return `calc(${Math.max(8, pattern.length + 2)}ch + ${PICKER_BTN_SPACE}px)`;
}

/** The picker options — identical in the widget, the grid cell and a list entry. */
export interface DateValueSettings {
    /** 'custom' replaces the native pickers with a field matching `inputPattern`. */
    inputFormat?: 'picker' | 'custom';
    inputPattern?: string;
    /** Only a time field, no date. */
    timeOnly?: boolean;
    /** Additional time field next to the date. */
    showTime?: boolean;
    outputFormat?: DateOutputFormat;
    outputPattern?: string;
}

/** Resolve the settings into the two patterns and the effective flags. */
function resolve(s: DateValueSettings) {
    const timeOnly = s.timeOnly === true;
    const outputFmt = s.outputFormat ?? 'timestamp_ms';
    const outPattern = (s.outputPattern ?? '').trim() || DEFAULT_DATE_PATTERN;
    return {
        timeOnly,
        showTime: timeOnly || s.showTime === true,
        outputFmt,
        outPattern,
        customInput: s.inputFormat === 'custom',
        inPattern: (s.inputPattern ?? '').trim() || (outputFmt === 'custom' ? outPattern : DEFAULT_DATE_PATTERN),
    };
}

/** Parsed datapoint value, honouring a custom in/out pattern. */
export function dateValueOf(val: unknown, settings: DateValueSettings): Date | null {
    const { outputFmt, outPattern, customInput, inPattern } = resolve(settings);
    return (
        parseValue(val, outputFmt === 'custom' ? outPattern : undefined) ??
        (customInput && typeof val === 'string' ? parseCustom(val, inPattern) : null)
    );
}

/**
 * Readable text of the current value — what the widget prints as "Gesetzt: …".
 * Falls back to the dash when the value is no readable point in time.
 */
export function dateValueText(val: unknown, settings: DateValueSettings): string {
    const { timeOnly, showTime, outputFmt, outPattern, customInput, inPattern } = resolve(settings);
    const d = dateValueOf(val, settings);
    if (customInput) return d ? formatCustom(d, inPattern) : '–';
    if (timeOnly) return d ? toTimeInputValue(d) : typeof val === 'string' ? val.slice(0, 5) || '–' : '–';
    if (!d) return '–';
    if (outputFmt === 'custom') return formatCustom(d, outPattern);
    return showTime
        ? d.toLocaleString('de-DE', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
          })
        : d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function useDateValueFields({
    value,
    settings,
    onWrite,
    className,
    wrapClassName,
    style,
    patternAutoWidth,
}: {
    /** Raw datapoint value. */
    value: unknown;
    settings: DateValueSettings;
    /** Called with the value in the configured output format. */
    onWrite: (v: string | number) => void;
    className?: string;
    /** Class for the field's wrapper (the picker button rides along in it). */
    wrapClassName?: string;
    style?: React.CSSProperties;
    /** Size the free-text pattern field to fit the pattern instead of letting it flex. */
    patternAutoWidth?: boolean;
}): {
    /** Date / custom-pattern field; null when only a time is configured. */
    dateInput: React.ReactNode;
    /** Time field; null unless a time is shown and no custom pattern is in play. */
    timeInput: React.ReactNode;
    currentDate: Date | null;
    /** Readable current value, '–' when unreadable. */
    currentText: string;
} {
    const { timeOnly, showTime, outputFmt, outPattern, customInput, inPattern } = resolve(settings);
    const currentDate = dateValueOf(value, settings);

    const [dateVal, setDateVal] = useState(() => (currentDate ? toDateInputValue(currentDate) : ''));
    const [timeVal, setTimeVal] = useState(() => {
        if (currentDate) return toTimeInputValue(currentDate);
        // timeOnly: the value may be a plain "HH:mm" / "HH:mm:ss" string.
        if (timeOnly && typeof value === 'string' && /^\d{2}:\d{2}/.test(value)) return value.slice(0, 5);
        return '00:00';
    });
    // Custom input: the pattern picks the matching native field (month picker for
    // `MM.yyyy`, …); patterns no native field covers fall back to free text.
    const inputKind = inputKindFor(inPattern);
    const [customVal, setCustomVal] = useState(() =>
        currentDate ? toInputValue(inputKind, currentDate, inPattern) : '',
    );
    const [textErr, setTextErr] = useState(false);

    // Follow the datapoint when it changes elsewhere.
    useEffect(() => {
        if (customInput) {
            setCustomVal(currentDate ? toInputValue(inputKind, currentDate, inPattern) : '');
            setTextErr(false);
            return;
        }
        if (timeOnly) {
            if (typeof value === 'string' && /^\d{2}:\d{2}/.test(value)) setTimeVal(value.slice(0, 5));
            else if (currentDate) setTimeVal(toTimeInputValue(currentDate));
            return;
        }
        if (!currentDate) return;
        setDateVal(toDateInputValue(currentDate));
        setTimeVal(toTimeInputValue(currentDate));
    }, [value, customInput, inPattern]); // eslint-disable-line react-hooks/exhaustive-deps

    const write = (d: Date) => onWrite(formatDate(d, outputFmt, outPattern));

    const writeValue = (date: string, time: string) => {
        if (timeOnly) {
            // Write the time alone — the date part is irrelevant for the output.
            if (!time) return;
            const [h, mi] = time.split(':').map(Number);
            write(new Date(1970, 0, 1, h ?? 0, mi ?? 0));
            return;
        }
        if (!date) return;
        const [y, mo, d] = date.split('-').map(Number);
        const [h, mi] = time.split(':').map(Number);
        const dt = showTime ? new Date(y, mo - 1, d, h ?? 0, mi ?? 0) : new Date(y, mo - 1, d, 0, 0, 0, 0);
        if (isNaN(dt.getTime())) return;
        write(dt);
    };

    /** Custom input, native field: write straight away, like the standard pickers. */
    const handleCustomNative = (raw: string) => {
        setCustomVal(raw);
        const dt = fromInputValue(inputKind, raw, currentDate);
        if (dt) write(dt);
    };
    /** Custom input, free text: parse against the pattern, write only when valid. */
    const commitText = (raw: string) => {
        if (!raw.trim()) {
            setTextErr(false);
            return;
        }
        const dt = parseCustom(raw, inPattern, currentDate);
        if (!dt) {
            setTextErr(true);
            return;
        }
        setTextErr(false);
        setCustomVal(formatCustom(dt, inPattern));
        write(dt);
    };
    /** Custom input, our own parts picker: the date is already assembled. */
    const handleCustomPick = (dt: Date) => {
        setTextErr(false);
        setCustomVal(formatCustom(dt, inPattern));
        write(dt);
    };

    const dateInput = customInput ? (
        inputKind === 'text' ? (
            <PatternInput
                pattern={inPattern}
                value={customVal}
                base={currentDate}
                onText={setCustomVal}
                onCommit={commitText}
                onPick={handleCustomPick}
                placeholder={inPattern}
                title={`Format: ${inPattern}`}
                className={`${className ?? ''} font-mono`}
                style={{
                    ...style,
                    ...(patternAutoWidth ? { width: patternFieldWidth(inPattern) } : null),
                    borderColor: textErr ? '#ef4444' : style?.borderColor,
                }}
                wrapClassName={wrapClassName}
            />
        ) : (
            <DateTimeInput
                kind={inputKind}
                value={customVal}
                onValue={handleCustomNative}
                title={`Format: ${inPattern}`}
                className={className}
                style={style}
                wrapClassName={wrapClassName}
            />
        )
    ) : !timeOnly ? (
        <DateTimeInput
            kind="date"
            value={dateVal}
            onValue={(v) => {
                setDateVal(v);
                writeValue(v, timeVal);
            }}
            className={className}
            style={style}
            wrapClassName={wrapClassName}
        />
    ) : null;

    const timeInput =
        showTime && !customInput ? (
            <DateTimeInput
                kind="time"
                value={timeVal}
                onValue={(v) => {
                    setTimeVal(v);
                    writeValue(dateVal, v);
                }}
                className={className}
                style={style}
                wrapClassName={wrapClassName}
            />
        ) : null;

    // timeOnly keeps its text on the field state — the DP may hold a bare "HH:mm".
    const currentText = timeOnly && !customInput ? timeVal || '–' : dateValueText(value, settings);

    return { dateInput, timeInput, currentDate, currentText };
}
