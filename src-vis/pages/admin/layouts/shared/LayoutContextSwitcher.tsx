import type { CSSProperties } from 'react';
import { useDashboardStore } from '../../../../store/dashboardStore';

interface LayoutContextSwitcherProps {
    selectedId: string | null;
    onChange: (id: string | null) => void;
    /** Marks the chips whose context has the option switched on (null = Global). */
    isActive?: (id: string | null) => boolean;
    /** Tooltip of the marker dot, e.g. "JS aktiv". */
    activeHint?: string;
}

export function LayoutContextSwitcher({ selectedId, onChange, isActive, activeHint }: LayoutContextSwitcherProps) {
    const layouts = useDashboardStore((s) => s.layouts);

    function chipStyle(selected: boolean): CSSProperties {
        return {
            background: selected ? 'var(--accent)' : 'var(--app-bg)',
            color: selected ? '#fff' : 'var(--text-secondary)',
            border: `1px solid ${selected ? 'var(--accent)' : 'var(--app-border)'}`,
        };
    }

    function marker(id: string | null, selected: boolean) {
        if (!isActive?.(id)) return null;
        return (
            <span
                data-testid="context-active-dot"
                title={activeHint}
                aria-label={activeHint}
                className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                style={{
                    background: 'var(--accent-green)',
                    boxShadow: selected ? '0 0 0 1.5px #fff' : undefined,
                }}
            />
        );
    }

    return (
        <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] shrink-0" style={{ color: 'var(--text-secondary)' }}>
                Kontext:
            </span>
            <div className="flex gap-1 flex-wrap">
                <button
                    onClick={() => onChange(null)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium hover:opacity-80"
                    style={chipStyle(selectedId === null)}
                >
                    {marker(null, selectedId === null)}
                    Global
                </button>
                {layouts.map((l) => (
                    <button
                        key={l.id}
                        onClick={() => onChange(l.id)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium hover:opacity-80"
                        style={chipStyle(selectedId === l.id)}
                    >
                        {marker(l.id, selectedId === l.id)}
                        {l.name}
                    </button>
                ))}
            </div>
        </div>
    );
}
