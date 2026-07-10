import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

interface Props {
    value: number[];
    onChange: (v: number[] | undefined) => void;
    className?: string;
    style?: CSSProperties;
    placeholder?: string;
}

// Parse "18; 20; 21,5" → [18, 20, 21.5]. A comma directly between two digits is
// treated as a German decimal separator; "; ", "," + space and whitespace all
// act as the value separator.
export function parseNumberList(raw: string): number[] {
    return raw
        .replace(/(\d),(?=\d)/g, '$1.')
        .split(/[\s;,]+/)
        .map((s) => parseFloat(s.trim()))
        .filter((n) => !isNaN(n));
}

function formatNumberList(v: number[]): string {
    return v.map((n) => String(n).replace('.', ',')).join('; ');
}

/**
 * Text input for a list of numbers. Keeps a local draft string so the user can
 * type separators and partial decimals (e.g. "20," on the way to "20,5")
 * without the controlled value snapping the cursor to the end on every
 * keystroke. The parsed value is pushed up on every change; the display is
 * re-normalised from props only while the field is not focused.
 */
export function NumberListInput({ value, onChange, className, style, placeholder }: Props) {
    const [text, setText] = useState(() => formatNumberList(value));
    const focused = useRef(false);

    useEffect(() => {
        if (!focused.current) setText(formatNumberList(value));
    }, [value]);

    return (
        <input
            type="text"
            value={text}
            onFocus={() => {
                focused.current = true;
            }}
            onBlur={() => {
                focused.current = false;
                setText(formatNumberList(value));
            }}
            onChange={(e) => {
                setText(e.target.value);
                const vals = parseNumberList(e.target.value);
                onChange(vals.length ? vals : undefined);
            }}
            placeholder={placeholder}
            className={className}
            style={style}
        />
    );
}
