import { useDashboardStore } from '../../../../store/dashboardStore';

interface LayoutContextSwitcherProps {
    selectedId: string | null;
    onChange: (id: string | null) => void;
}

export function LayoutContextSwitcher({ selectedId, onChange }: LayoutContextSwitcherProps) {
    const layouts = useDashboardStore((s) => s.layouts);
    return (
        <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] shrink-0" style={{ color: 'var(--text-secondary)' }}>
                Kontext:
            </span>
            <div className="flex gap-1 flex-wrap">
                <button
                    onClick={() => onChange(null)}
                    className="px-2.5 py-1 rounded-lg text-xs font-medium hover:opacity-80"
                    style={{
                        background: selectedId === null ? 'var(--accent)' : 'var(--app-bg)',
                        color: selectedId === null ? '#fff' : 'var(--text-secondary)',
                        border: `1px solid ${selectedId === null ? 'var(--accent)' : 'var(--app-border)'}`,
                    }}
                >
                    Global
                </button>
                {layouts.map((l) => (
                    <button
                        key={l.id}
                        onClick={() => onChange(l.id)}
                        className="px-2.5 py-1 rounded-lg text-xs font-medium hover:opacity-80"
                        style={{
                            background: selectedId === l.id ? 'var(--accent)' : 'var(--app-bg)',
                            color: selectedId === l.id ? '#fff' : 'var(--text-secondary)',
                            border: `1px solid ${selectedId === l.id ? 'var(--accent)' : 'var(--app-border)'}`,
                        }}
                    >
                        {l.name}
                    </button>
                ))}
            </div>
        </div>
    );
}
