import { useState } from 'react';
import { VALUE_TRANSFORM_PRESETS, matchValueTransformPreset } from '../../utils/valueTransform';

export interface ValueTransformPatch {
    valueFactor?: number;
    valueOffset?: number;
    /** Only emitted when `fillUnit` is set and the chosen preset suggests a unit. */
    unit?: string;
}

/**
 * Preset dropdown + optional manual factor/offset inputs for display-only value
 * transformation. Stores the result as `valueFactor` / `valueOffset` on the
 * caller's options/cell object via `onPatch`.
 */
export function ValueTransformFields({
    factor,
    offset,
    onPatch,
    fillUnit = false,
    inputStyle,
    inputClassName = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none',
}: {
    factor?: number;
    offset?: number;
    onPatch: (patch: ValueTransformPatch) => void;
    /** When true, selecting a preset also fills the `unit` field. */
    fillUnit?: boolean;
    inputStyle?: React.CSSProperties;
    inputClassName?: string;
}) {
    const matched = matchValueTransformPreset(factor, offset);
    // Stay in manual mode even when factor/offset happen to equal a preset (e.g. 1 / 0).
    const [manual, setManual] = useState(matched === 'custom');
    const selected = manual ? 'custom' : matched;

    const sty: React.CSSProperties = inputStyle ?? {
        background: 'var(--app-bg)',
        color: 'var(--text-primary)',
        border: '1px solid var(--app-border)',
    };
    const labelSty = { color: 'var(--text-secondary)' };

    const choose = (id: string) => {
        if (id === 'custom') {
            setManual(true);
            onPatch({ valueFactor: factor ?? 1, valueOffset: offset });
            return;
        }
        setManual(false);
        const p = VALUE_TRANSFORM_PRESETS.find((x) => x.id === id);
        if (!p || p.id === 'none') {
            onPatch({ valueFactor: undefined, valueOffset: undefined });
            return;
        }
        const patch: ValueTransformPatch = { valueFactor: p.factor, valueOffset: p.offset || undefined };
        if (fillUnit && p.unit) patch.unit = p.unit;
        onPatch(patch);
    };

    return (
        <div className="flex flex-col gap-2">
            <div>
                <label className="text-[11px] mb-1 block" style={labelSty}>
                    Umrechnung (nur Anzeige)
                </label>
                <select
                    value={selected}
                    onChange={(e) => choose(e.target.value)}
                    className={inputClassName}
                    style={sty}
                >
                    {VALUE_TRANSFORM_PRESETS.map((p) => (
                        <option key={p.id} value={p.id}>
                            {p.label}
                        </option>
                    ))}
                    <option value="custom">Eigene…</option>
                </select>
            </div>
            {selected === 'custom' && (
                <div className="flex gap-2">
                    <div className="flex-1">
                        <label className="text-[11px] mb-1 block" style={labelSty}>
                            Anzeigefaktor
                        </label>
                        <input
                            type="number"
                            step="any"
                            value={factor ?? 1}
                            onChange={(e) =>
                                onPatch({
                                    valueFactor: e.target.value === '' ? undefined : Number(e.target.value),
                                    valueOffset: offset,
                                })
                            }
                            className={inputClassName}
                            style={sty}
                        />
                    </div>
                    <div className="flex-1">
                        <label className="text-[11px] mb-1 block" style={labelSty}>
                            Anzeige-Offset
                        </label>
                        <input
                            type="number"
                            step="any"
                            value={offset ?? 0}
                            onChange={(e) =>
                                onPatch({
                                    valueFactor: factor,
                                    valueOffset: e.target.value === '' ? undefined : Number(e.target.value),
                                })
                            }
                            className={inputClassName}
                            style={sty}
                        />
                    </div>
                </div>
            )}
            <p className="text-[10px]" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
                Nur für die Anzeige. Der Datenpunktwert wird nicht verändert. Anzeige = Wert × Faktor + Offset
            </p>
        </div>
    );
}
