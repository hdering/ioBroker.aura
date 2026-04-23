import { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export function MultiSelect({
  label,
  options,
  selected,
  onChange,
  loading,
  placeholder,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
  loading?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = options.filter(o => o.toLowerCase().includes(search.toLowerCase()));
  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter(s => s !== v) : [...selected, v]);

  return (
    <div className="relative">
      <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary)' }}>{label}</label>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between text-xs rounded-lg px-3 py-2.5 focus:outline-none text-left"
        style={{
          background: 'var(--app-bg)',
          color: selected.length ? 'var(--text-primary)' : 'var(--text-secondary)',
          border: '1px solid var(--app-border)',
        }}
      >
        <span className="truncate flex-1 min-w-0">
          {loading ? 'Lade…' : selected.length === 0 ? (placeholder ?? 'Alle') : selected.join(', ')}
        </span>
        <ChevronDown size={11} className={`shrink-0 ml-1 transition-transform ${open ? 'rotate-180' : ''}`}
          style={{ color: 'var(--text-secondary)' }} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onMouseDown={() => setOpen(false)} />
          <div className="absolute z-50 left-0 right-0 mt-1 rounded-lg shadow-2xl overflow-hidden"
            style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}>
            {options.length > 8 && (
              <div className="p-1.5" style={{ borderBottom: '1px solid var(--app-border)' }}>
                <input
                  autoFocus
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Suchen…"
                  className="w-full text-xs px-2 py-1 rounded focus:outline-none"
                  style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: 'none' }}
                />
              </div>
            )}
            <div className="aura-scroll max-h-56 overflow-y-auto">
              {filtered.length === 0 && (
                <p className="text-[10px] p-2 text-center" style={{ color: 'var(--text-secondary)' }}>
                  Keine Ergebnisse
                </p>
              )}
              {filtered.map(opt => {
                const on = selected.includes(opt);
                return (
                  <label key={opt}
                    className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:opacity-90"
                    style={{ background: on ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent' }}>
                    <div className="w-3.5 h-3.5 rounded shrink-0 flex items-center justify-center"
                      style={{ background: on ? 'var(--accent)' : 'var(--app-border)' }}>
                      {on && <Check size={9} color="#fff" />}
                    </div>
                    <input type="checkbox" className="sr-only" checked={on} onChange={() => toggle(opt)} />
                    <span className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>{opt}</span>
                  </label>
                );
              })}
            </div>
            {selected.length > 0 && (
              <div className="p-1.5" style={{ borderTop: '1px solid var(--app-border)' }}>
                <button type="button" onClick={() => onChange([])}
                  className="text-[10px] hover:opacity-70 w-full text-center"
                  style={{ color: 'var(--text-secondary)' }}>
                  Auswahl aufheben
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
