import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Search, X } from 'lucide-react';
import { Icon } from '@iconify/react';
import { ICON_CATEGORIES } from '../../utils/iconCategories';
import { lucidePascalToIconify } from '../../utils/iconifyLoader';
import { usePortalTarget } from '../../contexts/PortalTargetContext';

// ── Props ──────────────────────────────────────────────────────────────────────
interface IconPickerModalProps {
  current: string;
  onSelect: (name: string) => void;
  onClose: () => void;
}

/** Normalize stored icon name to Iconify ID for display/comparison */
function toIconifyId(name: string): string {
  if (!name) return '';
  return name.includes(':') ? name : lucidePascalToIconify(name);
}

// ── Icon grid item ─────────────────────────────────────────────────────────────
function IconItem({
  id,
  selected,
  onSelect,
}: {
  id: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      title={id}
      onClick={onSelect}
      className="w-9 h-9 rounded-lg flex flex-col items-center justify-center transition-colors"
      style={{
        background: selected ? 'var(--accent)' : 'var(--app-bg)',
        color: selected ? '#fff' : 'var(--text-secondary)',
        border: `1px solid ${selected ? 'var(--accent)' : 'var(--app-border)'}`,
      }}
    >
      <Icon icon={id} width={15} height={15} />
    </button>
  );
}

// ── Category sidebar button ────────────────────────────────────────────────────
function CategoryBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-1.5 text-xs transition-colors truncate"
      style={{
        background: active ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text-secondary)',
        fontWeight: active ? 600 : 400,
        borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
      }}
    >
      {label}
    </button>
  );
}

// ── Modal ──────────────────────────────────────────────────────────────────────
export function IconPickerModal({ current, onSelect, onClose }: IconPickerModalProps) {
  const portalTarget = usePortalTarget();
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState('all');
  const searchRef = useRef<HTMLInputElement>(null);

  const currentId = toIconifyId(current);

  useEffect(() => {
    setTimeout(() => searchRef.current?.focus(), 50);
  }, []);

  // Build flat list of all Iconify IDs across all categories.
  // Validity is no longer pre-checked — icons are fetched on-demand from
  // api.iconify.design; the curated list is hand-maintained so all entries
  // are valid IDs.
  const allIds = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const cat of ICON_CATEGORIES) {
      for (const name of cat.icons) {
        const id = toIconifyId(name);
        if (!seen.has(id)) {
          seen.add(id);
          result.push(id);
        }
      }
    }
    return result;
  }, []);

  // Category counts (static, since we trust the curated list)
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: allIds.length };
    for (const cat of ICON_CATEGORIES) {
      counts[cat.id] = cat.icons.length;
    }
    return counts;
  }, [allIds]);

  // Visible icons for current selection
  const entries = useMemo<string[]>(() => {
    const q = query.toLowerCase().trim();

    if (q) {
      return allIds.filter((id) => id.toLowerCase().includes(q)).sort();
    }

    if (categoryId === 'all') {
      return allIds;
    }

    const cat = ICON_CATEGORIES.find((c) => c.id === categoryId);
    if (!cat) return [];
    return cat.icons.map(toIconifyId);
  }, [allIds, query, categoryId]);

  const modal = (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 9999 }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* Backdrop */}
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.5)' }} />

      {/* Panel */}
      <div
        className="relative rounded-xl flex flex-col"
        style={{
          background: 'linear-gradient(var(--app-surface), var(--app-surface)), var(--app-bg)',
          border: '1px solid var(--app-border)',
          width: 620,
          maxWidth: '95vw',
          height: 860,
          maxHeight: '96vh',
          boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        }}
      >
        {/* Header: search + close */}
        <div className="flex items-center gap-2 px-3 pt-3 pb-2 shrink-0">
          <Search size={13} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Icon suchen…"
            className="flex-1 min-w-0 text-sm bg-transparent focus:outline-none"
            style={{ color: 'var(--text-primary)' }}
          />
          {query && (
            <button onClick={() => setQuery('')} style={{ color: 'var(--text-secondary)' }}>
              <X size={13} />
            </button>
          )}
          <button
            onClick={onClose}
            className="ml-1 p-1 rounded hover:opacity-70 transition-opacity"
            style={{ color: 'var(--text-secondary)' }}
          >
            <X size={16} />
          </button>
        </div>

        <div className="h-px shrink-0" style={{ background: 'var(--app-border)' }} />

        {/* Body: sidebar + grid */}
        <div className="flex flex-1 min-h-0">

          {/* Left sidebar: categories */}
          <div
            className="flex flex-col overflow-y-scroll shrink-0 py-1"
            style={{ width: 160, borderRight: '1px solid var(--app-border)', scrollbarWidth: 'thin', scrollbarColor: 'var(--app-border) transparent' }}
          >
            <CategoryBtn
              label={`Alle (${categoryCounts.all ?? 0})`}
              active={!query && categoryId === 'all'}
              onClick={() => { setQuery(''); setCategoryId('all'); }}
            />
            {ICON_CATEGORIES.map((cat) => {
              const count = categoryCounts[cat.id] ?? 0;
              if (count === 0) return null;
              return (
                <CategoryBtn
                  key={cat.id}
                  label={`${cat.label} (${count})`}
                  active={!query && categoryId === cat.id}
                  onClick={() => { setQuery(''); setCategoryId(cat.id); }}
                />
              );
            })}
          </div>

          {/* Right: icon grid */}
          <div className="flex-1 overflow-y-auto min-h-0 p-2">
            {entries.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Keine Icons gefunden
                </p>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1">
                {entries.map((id) => (
                  <IconItem
                    key={id}
                    id={id}
                    selected={currentId === id}
                    onSelect={() => { onSelect(id); onClose(); }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer: count + selected name + remove */}
        <div className="h-px shrink-0" style={{ background: 'var(--app-border)' }} />
        <div className="flex items-center gap-2 px-3 py-2 shrink-0">
          <span className="text-[11px] flex-1" style={{ color: 'var(--text-secondary)' }}>
            {entries.length} Icons
            {currentId && (
              <span className="ml-2 font-medium" style={{ color: 'var(--text-primary)' }}>
                • {currentId}
              </span>
            )}
          </span>
          {currentId && (
            <button
              onClick={() => { onSelect(''); onClose(); }}
              className="text-[11px] px-2 py-1 rounded hover:opacity-70"
              style={{ color: 'var(--text-secondary)' }}
            >
              Entfernen
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, portalTarget ?? document.body);
}
