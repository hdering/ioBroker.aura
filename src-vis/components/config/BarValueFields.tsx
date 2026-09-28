import { ColorPicker } from '../common/ColorPicker';
import type { BarValuePlacement } from '../widgets/BarValueLabel';

/** The keys this block edits — named alike on the fill widget and the progress cell. */
export interface BarValuePatch {
    valuePlacement?: BarValuePlacement;
    trackColor?: string;
    valueFilledColor?: string;
    valueEmptyColor?: string;
}

/**
 * Value placement and the bar's colours, one block for the fill widget's bar layout
 * and the Universal widget's progress cell (#719, #720). Both editors mount this, so
 * a setting that exists on one of the two exists on the other as well.
 *
 * The fill colour itself is passed in, because the two store it under different
 * keys: the cell has always painted its bar with the generic `color`, the widget
 * gets `fillColor`.
 */
export function BarValueFields({
    showValue,
    placement,
    fillColor,
    fillFallback,
    onFillColor,
    trackColor,
    trackFallback,
    valueFilledColor,
    valueEmptyColor,
    onChange,
    fillOnly = false,
}: {
    showValue: boolean;
    placement: BarValuePlacement;
    fillColor: string | undefined;
    /** Swatch shown while the fill colour is unset. */
    fillFallback: string;
    onFillColor: (v: string | undefined) => void;
    trackColor: string | undefined;
    trackFallback: string;
    valueFilledColor: string | undefined;
    valueEmptyColor: string | undefined;
    onChange: (patch: BarValuePatch) => void;
    /** Only the fill colour — the fill widget's other layouts draw no bar track. */
    fillOnly?: boolean;
}) {
    const row = (label: string, value: string | undefined, fallback: string, set: (v: string | undefined) => void) => (
        <div className="flex items-center justify-between gap-2">
            <label className="text-[11px] min-w-0 truncate" style={{ color: 'var(--text-secondary)' }}>
                {label}
            </label>
            <div className="flex items-center gap-1 shrink-0">
                <ColorPicker
                    value={value || fallback}
                    unset={!value}
                    onChange={(v) => set(v)}
                    className="w-8 h-7 rounded cursor-pointer shrink-0"
                    style={{ border: '1px solid var(--app-border)', padding: '1px' }}
                />
                {/* Always rendered, only hidden — the swatch would jump sideways otherwise. */}
                <button
                    onClick={() => set(undefined)}
                    title="Zurücksetzen"
                    aria-hidden={!value}
                    tabIndex={value ? 0 : -1}
                    className="text-[10px] px-1.5 py-0.5 rounded"
                    style={{
                        background: 'var(--app-bg)',
                        color: 'var(--text-secondary)',
                        border: '1px solid var(--app-border)',
                        visibility: value ? 'visible' : 'hidden',
                    }}
                >
                    Reset
                </button>
            </div>
        </div>
    );
    const inside = showValue && placement === 'inside';
    if (fillOnly) return row('Farbe Fortschritt', fillColor, fillFallback, onFillColor);
    return (
        <div className="flex flex-col gap-2">
            {showValue && (
                <div className="flex items-center justify-between gap-2">
                    <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        Wert-Position
                    </label>
                    <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--app-border)' }}>
                        {(
                            [
                                ['outside', 'Neben dem Balken'],
                                ['inside', 'Im Balken'],
                            ] as const
                        ).map(([v, lbl]) => (
                            <button
                                key={v}
                                data-aura-bar-placement={v}
                                onClick={() => onChange({ valuePlacement: v })}
                                className="px-2.5 py-1 text-[11px] transition-colors"
                                style={{
                                    background: placement === v ? 'var(--accent)' : 'var(--app-bg)',
                                    color: placement === v ? '#fff' : 'var(--text-secondary)',
                                }}
                            >
                                {lbl}
                            </button>
                        ))}
                    </div>
                </div>
            )}
            {row('Farbe Fortschritt', fillColor, fillFallback, onFillColor)}
            {row('Farbe ungefüllte Fläche', trackColor, trackFallback, (v) => onChange({ trackColor: v }))}
            {inside && (
                <>
                    {row('Schrift im Fortschritt', valueFilledColor, '#ffffff', (v) =>
                        onChange({ valueFilledColor: v }),
                    )}
                    {row('Schrift in ungefüllter Fläche', valueEmptyColor, '#e2e8f0', (v) =>
                        onChange({ valueEmptyColor: v }),
                    )}
                </>
            )}
        </div>
    );
}
