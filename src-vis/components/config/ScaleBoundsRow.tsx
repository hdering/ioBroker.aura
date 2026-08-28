/**
 * ScaleBoundsRow — the two optional datapoints behind a scale's Min/Max.
 *
 * Gauge and Füllstandsanzeige both scale their value into a fixed `minValue`…`maxValue`
 * window. A bound that is itself a datapoint lets the 100 % reference live in ioBroker —
 * a monthly prepayment, a budget, a tank size the installation already knows (issue #596).
 * A filled datapoint always wins over the number next to it; emptying the field falls
 * straight back to the static value, so nothing has to be reset.
 */
import { Database } from 'lucide-react';

interface ScaleBoundsRowProps {
    /** Current `minDatapoint` (empty = use the static min). */
    minDatapoint?: string;
    /** Current `maxDatapoint` (empty = use the static max). */
    maxDatapoint?: string;
    onChange: (patch: { minDatapoint?: string; maxDatapoint?: string }) => void;
    /** Opens the panel's datapoint picker for that bound. */
    onPick: (which: 'min' | 'max') => void;
    /** Panel input classes (gCls / fCls …). */
    inputClassName: string;
    /** Panel input styling (gSty / fSty …). */
    inputStyle?: React.CSSProperties;
}

export function ScaleBoundsRow({
    minDatapoint,
    maxDatapoint,
    onChange,
    onPick,
    inputClassName,
    inputStyle,
}: ScaleBoundsRowProps) {
    const row = (which: 'min' | 'max') => {
        const value = (which === 'min' ? minDatapoint : maxDatapoint) ?? '';
        const emit = (v: string | undefined) => onChange(which === 'min' ? { minDatapoint: v } : { maxDatapoint: v });
        return (
            <div>
                <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                    {which === 'min' ? 'Min aus Datenpunkt' : 'Max aus Datenpunkt'}
                </label>
                <div className="flex gap-1">
                    <input
                        type="text"
                        value={value}
                        onChange={(e) => emit(e.target.value || undefined)}
                        placeholder="Datenpunkt-ID (leer = fester Wert)"
                        className={`${inputClassName} font-mono flex-1 min-w-0`}
                        style={inputStyle}
                    />
                    <button
                        type="button"
                        onClick={() => onPick(which)}
                        className="px-2 rounded-lg hover:opacity-80 shrink-0"
                        style={{
                            background: 'var(--app-bg)',
                            color: 'var(--text-secondary)',
                            border: '1px solid var(--app-border)',
                        }}
                        title="Datenpunkt wählen"
                    >
                        <Database size={13} />
                    </button>
                </div>
            </div>
        );
    };

    return (
        <>
            {row('min')}
            {row('max')}
            <p className="text-[10px]" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                Ein Datenpunkt gewinnt über den festen Wert darüber — so kommt die 100-%-Vorgabe (Abschlag, Budget,
                Tankgröße) aus ioBroker.
            </p>
        </>
    );
}
