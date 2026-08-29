/**
 * Per-entry colour scale — the "Farbschwellen" block of a list entry's detail
 * editor. Shared by the static and the dynamic list so both offer the same thing:
 * a row's own scale beats the list-wide one, exactly like the Wert widget's.
 */
import { ColorPicker } from '../../common/ColorPicker';
import { sortColorThresholds, type ColorThreshold } from '../../../utils/colorThresholds';

export function EntryThresholdsFields({
    thresholds,
    onChange,
}: {
    thresholds?: ColorThreshold[];
    onChange: (next: ColorThreshold[] | undefined) => void;
}) {
    const list = thresholds ?? [];
    return (
        <div>
            <div className="flex items-center justify-end mb-1">
                <button
                    onClick={() => onChange([...list, [100, '#22c55e']])}
                    className="text-[10px] px-1.5 py-0.5 rounded hover:opacity-80"
                    style={{
                        background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                        color: 'var(--accent)',
                    }}
                >
                    + Hinzufügen
                </button>
            </div>
            {list.length > 0 && (
                <p className="text-[9px] mb-1" style={{ color: 'var(--text-secondary)', opacity: 0.65 }}>
                    Wert &lt; Schwelle → Farbe · Reihenfolge beliebig
                </p>
            )}
            <div className="space-y-1">
                {list.map(([thresh, color], i) => (
                    <div key={i} className="flex items-center gap-1">
                        <button
                            onClick={() => {
                                const next = list.filter((_, j) => j !== i);
                                onChange(next.length ? next : undefined);
                            }}
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
                            value={color.match(/#[0-9a-fA-F]{6}/)?.[0] ?? '#22c55e'}
                            onChange={(v) => {
                                const n = [...list];
                                n[i] = [thresh, v];
                                onChange(n);
                            }}
                            className="w-7 h-6 rounded cursor-pointer shrink-0"
                            style={{ border: '1px solid var(--app-border)', padding: '1px' }}
                        />
                        <span className="text-[9px] shrink-0" style={{ color: 'var(--text-secondary)' }}>
                            Wert &lt;
                        </span>
                        <input
                            type="number"
                            value={thresh}
                            onChange={(e) => {
                                const n = [...list];
                                n[i] = [Number(e.target.value), color];
                                onChange(n);
                            }}
                            // Sorting on blur, not while typing - the rows must not
                            // jump around under the cursor. Matching is order-free
                            // anyway, this only keeps the list readable.
                            onBlur={() => onChange(sortColorThresholds(list))}
                            className="flex-1 text-[10px] rounded px-1.5 py-0.5 focus:outline-none"
                            style={{
                                background: 'var(--app-bg)',
                                color: 'var(--text-primary)',
                                border: '1px solid var(--app-border)',
                            }}
                        />
                    </div>
                ))}
            </div>
            {list.length === 0 && (
                <p className="text-[9px] italic" style={{ color: 'var(--text-secondary)', opacity: 0.45 }}>
                    Keine Farbschwellen konfiguriert
                </p>
            )}
        </div>
    );
}
