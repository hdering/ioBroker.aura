/**
 * Widget-wide colour-threshold editor — the `[Schwelle, Farbe]` band list.
 *
 * Shown in "Werte & Farben" for both lists and at the bottom of the widget dialog
 * for Werte-Anzeige / Dimmer / Rollladen / Thermostat, so all of them offer the
 * same rows. Matching is order-free (see utils/colorThresholds); the rows are
 * sorted when a threshold field is left, purely so the list mirrors the order it
 * is evaluated in.
 */
import { ColorPicker } from '../common/ColorPicker';
import { sortColorThresholds, type ColorThreshold } from '../../utils/colorThresholds';

export function ColorThresholdsEditor({
    thresholds,
    onChange,
    label = 'Farbschwellen',
}: {
    thresholds: ColorThreshold[];
    /** Receives the new rows; an empty list means "no scale configured". */
    onChange: (next: ColorThreshold[]) => void;
    label?: string;
}) {
    return (
        <div>
            <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    {label}
                </label>
                <button
                    onClick={() => onChange([...thresholds, [100, '#22c55e']])}
                    className="text-[10px] px-2 py-0.5 rounded hover:opacity-80"
                    style={{
                        background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                        color: 'var(--accent)',
                    }}
                >
                    + Hinzufügen
                </button>
            </div>
            {thresholds.length > 0 && (
                <p className="text-[10px] mb-1.5" style={{ color: 'var(--text-secondary)', opacity: 0.65 }}>
                    Wert &lt; Schwelle → Farbe · Reihenfolge beliebig
                </p>
            )}
            <div className="space-y-1">
                {thresholds.map(([thresh, color], i) => (
                    <div key={i} className="flex items-center gap-1.5">
                        <button
                            onClick={() => onChange(thresholds.filter((_, j) => j !== i))}
                            className="text-[11px] w-5 h-5 flex items-center justify-center rounded shrink-0"
                            style={{
                                color: 'var(--text-secondary)',
                                background: 'var(--app-bg)',
                                border: '1px solid var(--app-border)',
                            }}
                        >
                            ×
                        </button>
                        <ColorPicker
                            value={color}
                            fallback={'#22c55e'}
                            onChange={(v) => {
                                const n = [...thresholds];
                                n[i] = [thresh, v];
                                onChange(n);
                            }}
                            className="w-8 h-7 rounded cursor-pointer shrink-0"
                            style={{ border: '1px solid var(--app-border)', padding: '1px' }}
                        />
                        <span className="text-[10px] shrink-0" style={{ color: 'var(--text-secondary)' }}>
                            Wert &lt;
                        </span>
                        <input
                            type="number"
                            value={thresh}
                            onChange={(e) => {
                                const n = [...thresholds];
                                n[i] = [Number(e.target.value), color];
                                onChange(n);
                            }}
                            // Sorted on blur only, so the rows do not jump while a number is typed.
                            onBlur={() => onChange(sortColorThresholds(thresholds))}
                            className="flex-1 text-xs rounded-lg px-2 py-1 focus:outline-none"
                            style={{
                                background: 'var(--app-bg)',
                                color: 'var(--text-primary)',
                                border: '1px solid var(--app-border)',
                            }}
                        />
                    </div>
                ))}
            </div>
            {thresholds.length === 0 && (
                <p className="text-[10px] italic" style={{ color: 'var(--text-secondary)', opacity: 0.45 }}>
                    Keine Farbschwellen konfiguriert
                </p>
            )}
        </div>
    );
}
