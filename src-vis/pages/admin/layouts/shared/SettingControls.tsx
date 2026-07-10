// Shared setting-control primitives used by the Design/Settings section components
// (Header, Layout menu, Behavior). Extracted from the former FrontendSection so the
// pieces can live on different admin pages without duplicating the markup.

export function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
    return (
        <button
            onClick={() => onChange(!value)}
            className="relative w-9 h-5 rounded-full transition-colors duration-200 focus:outline-none shrink-0"
            style={{ background: value ? 'var(--accent-green)' : 'var(--app-border)' }}
        >
            <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${value ? 'translate-x-4' : 'translate-x-0'}`}
            />
        </button>
    );
}

export function ToggleRow({
    label,
    hint,
    value,
    onChange,
}: {
    label: string;
    hint?: string;
    value: boolean;
    onChange: (v: boolean) => void;
}) {
    return (
        <div
            className="flex items-center justify-between gap-3 py-2 border-b last:border-b-0"
            style={{ borderColor: 'var(--app-border)' }}
        >
            <div className="min-w-0">
                <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                    {label}
                </p>
                {hint && (
                    <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                        {hint}
                    </p>
                )}
            </div>
            <Toggle value={value} onChange={onChange} />
        </div>
    );
}

/** Indented, accent-bordered container that visually groups the sub-settings of an enabled toggle. */
export function SubGroup({ children }: { children: React.ReactNode }) {
    return (
        <div className="ml-1.5 pl-3 my-1 py-1 space-y-2 border-l-2" style={{ borderColor: 'var(--accent)' }}>
            {children}
        </div>
    );
}

export function Card({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div
            className="rounded-xl p-4 space-y-3"
            style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
        >
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>
                {title}
            </p>
            {children}
        </div>
    );
}
