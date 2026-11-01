import type { ListRowDensity } from '../../utils/listDensity';
import { Unavailable } from './Unavailable';

const OPTIONS: { id: ListRowDensity; label: string }[] = [
    { id: 'compact', label: 'Kompakt' },
    { id: 'normal', label: 'Normal' },
    { id: 'comfortable', label: 'Großzügig' },
];

/** Zeilenabstand der statischen und dynamischen Liste (#890) — getrennt von der Textgröße. */
export function ListDensityField({
    layout,
    value,
    onChange,
}: {
    layout: string | undefined;
    value: ListRowDensity | undefined;
    onChange: (v: ListRowDensity | undefined) => void;
}) {
    const current = value ?? 'normal';
    // Only the row layouts have rows to space: cards are tiles, "minimal" draws pills.
    const rowLayout = !layout || layout === 'default' || layout === 'compact';
    return (
        <Unavailable reason={rowLayout ? undefined : 'Nur in den Layouts Standard und Kompakt'}>
            <div>
                <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                    Zeilenabstand
                </label>
                <div className="flex gap-1">
                    {OPTIONS.map((opt) => {
                        const on = opt.id === current;
                        return (
                            <button
                                key={opt.id}
                                type="button"
                                // 'normal' is the default — stored as absent, like every other default.
                                onClick={() => onChange(opt.id === 'normal' ? undefined : opt.id)}
                                className="flex-1 text-[11px] py-1 px-1.5 rounded-md transition-opacity hover:opacity-80"
                                style={{
                                    background: on ? 'var(--accent)' : 'var(--app-bg)',
                                    color: on ? '#fff' : 'var(--text-secondary)',
                                    border: `1px solid ${on ? 'var(--accent)' : 'var(--app-border)'}`,
                                }}
                            >
                                {opt.label}
                            </button>
                        );
                    })}
                </div>
            </div>
        </Unavailable>
    );
}
