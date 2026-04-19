import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, Loader2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ICON_CATEGORIES } from '../../utils/iconCategories';
import { usePortalTarget } from '../../contexts/PortalTargetContext';

// ── Lazy icon cache ────────────────────────────────────────────────────────────
let iconCache: Record<string, LucideIcon> | null = null;
let loadPromise: Promise<Record<string, LucideIcon>> | null = null;

async function loadAllIcons(): Promise<Record<string, LucideIcon>> {
  if (iconCache) return iconCache;
  if (!loadPromise) {
    loadPromise = import('lucide-react').then((mod) => {
      // lucide-react exports `icons` as a clean namespace (icons/index.js):
      // only PascalCase names, no Lucide-prefix or Icon-suffix aliases.
      // This is exactly what we want as the icon map.
      const ns = (mod as Record<string, unknown>)['icons'] as Record<string, LucideIcon> | undefined;
      if (ns) {
        iconCache = ns;
        return ns;
      }
      // Fallback: filter module exports manually
      const excluded = new Set(['Icon', 'LucideProvider', 'createLucideIcon', 'default', 'icons', 'useLucideContext']);
      const map: Record<string, LucideIcon> = {};
      for (const [key, val] of Object.entries(mod as Record<string, unknown>)) {
        if (typeof val === 'function' && /^[A-Z]/.test(key) && !key.startsWith('Lucide') && !key.endsWith('Icon') && !excluded.has(key)) {
          map[key] = val as LucideIcon;
        }
      }
      iconCache = map;
      return map;
    });
  }
  return loadPromise;
}

/** Returns cached icon if already loaded (synchronous, for widget rendering) */
export function getCachedLucideIcon(name: string): LucideIcon | null {
  return iconCache?.[name] ?? null;
}

// ── Props ──────────────────────────────────────────────────────────────────────
interface IconPickerModalProps {
  current: string;
  onSelect: (name: string) => void;
  onClose: () => void;
}

// ── Icon grid item ─────────────────────────────────────────────────────────────
function IconItem({
  name,
  icon: Icon,
  selected,
  onSelect,
}: {
  name: string;
  icon: LucideIcon;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      title={name}
      onClick={onSelect}
      className="w-9 h-9 rounded-lg flex flex-col items-center justify-center transition-colors"
      style={{
        background: selected ? 'var(--accent)' : 'var(--app-bg)',
        color: selected ? '#fff' : 'var(--text-secondary)',
        border: `1px solid ${selected ? 'var(--accent)' : 'var(--app-border)'}`,
      }}
    >
      <Icon size={15} />
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
  const [icons, setIcons] = useState<Record<string, LucideIcon>>(iconCache ?? {});
  const [loading, setLoading] = useState(!iconCache);
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState('all');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!iconCache) {
      setLoading(true);
      loadAllIcons().then((map) => {
        setIcons(map);
        setLoading(false);
      });
    } else {
      setIcons(iconCache);
    }
    // Auto-focus search
    setTimeout(() => searchRef.current?.focus(), 50);
  }, []);

  // Build list of icon names to show
  const entries = useMemo<[string, LucideIcon][]>(() => {
    const allNames = Object.keys(icons);
    const q = query.toLowerCase().trim();

    let names: string[];
    if (q) {
      // When searching, always search across ALL icons
      names = allNames.filter((n) => n.toLowerCase().includes(q));
    } else if (categoryId === 'all') {
      names = allNames;
    } else {
      const cat = ICON_CATEGORIES.find((c) => c.id === categoryId);
      const catSet = new Set(cat?.icons ?? []);
      names = allNames.filter((n) => catSet.has(n));
    }

    names.sort();
    return names.map((n) => [n, icons[n]]);
  }, [icons, query, categoryId]);

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
          height: 680,
          maxHeight: '92vh',
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
              label={`Alle (${Object.keys(icons).length})`}
              active={!query && categoryId === 'all'}
              onClick={() => { setQuery(''); setCategoryId('all'); }}
            />
            {ICON_CATEGORIES.map((cat) => {
              const count = cat.icons.filter((n) => n in icons).length;
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
            {loading ? (
              <div className="h-full flex items-center justify-center gap-2"
                style={{ color: 'var(--text-secondary)' }}>
                <Loader2 size={18} className="animate-spin" />
                <span className="text-xs">Icons werden geladen…</span>
              </div>
            ) : entries.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Keine Icons gefunden
                </p>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1">
                {entries.map(([name, Icon]) => (
                  <IconItem
                    key={name}
                    name={name}
                    icon={Icon}
                    selected={current === name}
                    onSelect={() => { onSelect(name); onClose(); }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer: count + remove */}
        <div className="h-px shrink-0" style={{ background: 'var(--app-border)' }} />
        <div className="flex items-center gap-2 px-3 py-2 shrink-0">
          <span className="text-[11px] flex-1" style={{ color: 'var(--text-secondary)' }}>
            {entries.length} Icons
            {current && (
              <span className="ml-2 font-medium" style={{ color: 'var(--text-primary)' }}>
                • {current}
              </span>
            )}
          </span>
          {current && (
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
