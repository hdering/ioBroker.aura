/**
 * DpRangeBoundFields — a Min/Max pair that may stay empty.
 *
 * An empty bound follows the datapoint's `common.min` / `common.max` at runtime
 * (#923); the placeholder says which value applies right now — the datapoint's,
 * the fixed default, or "from the datapoint" for an id that is only resolved when
 * the popup opens. A typed value overrides it; the × empties the field again.
 */
import { X } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useDpRange } from '../../hooks/useDpRange';

interface Bound {
    /** Option key, e.g. `ctMin`. */
    key: string;
    label: string;
    /** Fallback when neither the option nor the datapoint has a value. */
    fallback: number;
}

interface DpRangeBoundFieldsProps {
    /** The datapoint whose range an empty field follows. */
    datapoint: string | undefined;
    min: Bound;
    max: Bound;
    options: Record<string, unknown>;
    onChange: (patch: Record<string, unknown>) => void;
    inputClassName: string;
    inputStyle: CSSProperties;
    labelStyle: CSSProperties;
}

export function DpRangeBoundFields({
    datapoint,
    min,
    max,
    options,
    onChange,
    inputClassName,
    inputStyle,
    labelStyle,
}: DpRangeBoundFieldsProps) {
    const range = useDpRange(datapoint);
    const placeholderDp = !!datapoint && datapoint.includes('{{');

    const field = (bound: Bound, dpValue: number | undefined) => {
        const raw = options[bound.key];
        const value = typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined;
        const placeholder = placeholderDp
            ? 'aus Datenpunkt'
            : dpValue !== undefined
              ? `${dpValue} (Datenpunkt)`
              : `${bound.fallback} (Standard)`;
        return (
            <div>
                <label className="text-[10px]" style={labelStyle}>
                    {bound.label}
                </label>
                <div className="relative">
                    <input
                        type="number"
                        value={value ?? ''}
                        placeholder={placeholder}
                        onChange={(e) =>
                            onChange({
                                [bound.key]: e.target.value === '' ? undefined : Number(e.target.value),
                            })
                        }
                        className={`${inputClassName} pr-6`}
                        style={inputStyle}
                    />
                    {value !== undefined && (
                        <button
                            type="button"
                            onClick={() => onChange({ [bound.key]: undefined })}
                            title="Leeren – Wert aus dem Datenpunkt übernehmen"
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 opacity-60 hover:opacity-100"
                            style={labelStyle}
                        >
                            <X size={12} />
                        </button>
                    )}
                </div>
            </div>
        );
    };

    return (
        <>
            <div className="grid grid-cols-2 gap-2 mt-1">
                {field(min, range?.min)}
                {field(max, range?.max)}
            </div>
            <p className="text-[10px] mt-1" style={labelStyle}>
                Leer = Bereich aus dem Datenpunkt (common.min/max), sonst Standard.
            </p>
        </>
    );
}
