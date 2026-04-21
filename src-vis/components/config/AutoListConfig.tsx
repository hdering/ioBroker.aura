import { useState, useEffect } from 'react';
import { RefreshCw, Search, Check, X, ChevronDown, Settings2, ChevronRight, ChevronUp } from 'lucide-react';
import type { WidgetConfig } from '../../types';
import { discoverDatapoints, loadFilterOptions } from '../widgets/AutoListWidget';
import type { AutoListOptions, AutoListEntry, DiscoveredDp } from '../widgets/AutoListWidget';
import { useT } from '../../i18n';
import { ensureDatapointCache } from '../../hooks/useDatapointList';

// ── MultiSelect dropdown ───────────────────────────────────────────────────────

function MultiSelect({
  label,
  options,
  selected,
  onChange,
  loading,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
  loading?: boolean;
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
          {loading ? 'Lade…' : selected.length === 0 ? 'Alle' : selected.join(', ')}
        </span>
        <ChevronDown size={11} className={`shrink-0 ml-1 transition-transform ${open ? 'rotate-180' : ''}`}
          style={{ color: 'var(--text-secondary)' }} />
      </button>

      {open && (
        <>
          {/* Transparent backdrop – closes dropdown on outside click */}
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

// ── Per-entry config row ───────────────────────────────────────────────────────

function EntryConfigRow({
  entry,
  resolvedName,
  onUpdate,
  onRemove,
}: {
  entry: AutoListEntry;
  resolvedName?: string;
  onUpdate: (patch: Partial<AutoListEntry>) => void;
  onRemove: () => void;
}) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const iSty = { background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' } as React.CSSProperties;
  const iCls = 'w-full text-[10px] rounded px-2 py-1 focus:outline-none font-mono';

  return (
    <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--app-border)' }}>
      {/* Header row */}
      <div className="flex items-center gap-1.5 px-2 py-1.5" style={{ background: 'var(--app-bg)' }}>
        <button onClick={() => setExpanded(e => !e)} className="shrink-0 hover:opacity-70 transition-transform"
          style={{ color: 'var(--text-secondary)', transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
          <ChevronRight size={11} />
        </button>
        <span className="flex-1 text-[10px] truncate" style={{ color: 'var(--text-primary)' }}>
          {entry.label || resolvedName || entry.id.split('.').pop() || entry.id}
        </span>
        <button onClick={() => setExpanded(e => !e)} className="shrink-0 hover:opacity-70 p-0.5"
          style={{ color: 'var(--text-secondary)' }} title={t('autolist.settings')}>
          <Settings2 size={10} />
        </button>
        <button onClick={onRemove} className="shrink-0 hover:opacity-70"
          style={{ color: 'var(--text-secondary)' }}>
          <X size={11} />
        </button>
      </div>

      {/* Expanded config */}
      {expanded && (
        <div className="px-2.5 pb-2.5 pt-1 space-y-1.5" style={{ borderTop: '1px solid var(--app-border)', background: 'var(--app-surface)' }}>
          <div className="text-[9px] font-mono truncate mb-1" style={{ color: 'var(--text-secondary)' }}>{entry.id}</div>
          <div className="grid grid-cols-2 gap-1.5">
            <div>
              <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>{t('endpoints.dp.label')}</label>
              <input className={iCls} style={iSty} placeholder={t('autolist.auto')}
                value={entry.label ?? ''}
                onChange={e => onUpdate({ label: e.target.value || undefined })} />
            </div>
            <div>
              <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>{t('endpoints.dp.unit')}</label>
              <input className={iCls} style={iSty} placeholder={t('endpoints.dp.unitPh')}
                value={entry.unit ?? ''}
                onChange={e => onUpdate({ unit: e.target.value || undefined })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <div>
              <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>{t('autolist.trueText')}</label>
              <input className={iCls} style={iSty} placeholder="AN"
                value={entry.trueLabel ?? ''}
                onChange={e => onUpdate({ trueLabel: e.target.value || undefined })} />
            </div>
            <div>
              <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>{t('autolist.falseText')}</label>
              <input className={iCls} style={iSty} placeholder="AUS"
                value={entry.falseLabel ?? ''}
                onChange={e => onUpdate({ falseLabel: e.target.value || undefined })} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main config panel ──────────────────────────────────────────────────────────

interface Props {
  config: WidgetConfig;
  onConfigChange: (config: WidgetConfig) => void;
}

function toArr(csv?: string): string[] {
  return csv ? csv.split(',').map(s => s.trim()).filter(Boolean) : [];
}
function toCsv(arr: string[]): string | undefined {
  return arr.length ? arr.join(', ') : undefined;
}

export function AutoListConfig({ config, onConfigChange }: Props) {
  const t = useT();
  const opts = (config.options ?? { entries: [] }) as unknown as AutoListOptions;

  // Filter options loaded from ioBroker
  const [availRoles, setAvailRoles] = useState<string[]>([]);
  const [availRooms, setAvailRooms] = useState<string[]>([]);
  const [availFuncs, setAvailFuncs] = useState<string[]>([]);
  const [optLoading, setOptLoading] = useState(true);
  const [resolvedNames, setResolvedNames] = useState<Record<string, string>>({});

  useEffect(() => {
    loadFilterOptions().then(({ roles, rooms, funcs }) => {
      setAvailRoles(roles);
      setAvailRooms(rooms);
      setAvailFuncs(funcs);
      setOptLoading(false);
    });
    ensureDatapointCache().then(cache => {
      const map: Record<string, string> = {};
      for (const e of cache) map[e.id] = e.name;
      setResolvedNames(map);
    });
  }, []);

  // Filter state
  const [selRoles, setSelRoles] = useState<string[]>(toArr(opts.filterRoles));
  const [selRooms, setSelRooms] = useState<string[]>(toArr(opts.filterRooms));
  const [selFuncs, setSelFuncs] = useState<string[]>(toArr(opts.filterFuncs));
  const [idPat, setIdPat]       = useState(opts.filterIdPattern ?? '');

  // Search results – reset whenever any filter changes
  const [results, setResults]     = useState<DiscoveredDp[]>([]);
  const [selected, setSelected]   = useState<Set<string>>(new Set());
  const [loading, setLoading]     = useState(false);
  const [searched, setSearched]   = useState(false);
  const [showOthers, setShowOthers] = useState(false);

  // Reset search results when any filter value changes
  const resetSearch = () => { setResults([]); setSelected(new Set()); setSearched(false); setShowOthers(false); };

  const setOpts = (patch: Partial<AutoListOptions>) => {
    onConfigChange({ ...config, options: { ...opts, ...patch } });
  };

  const search = async () => {
    setLoading(true);
    try {
      const found = await discoverDatapoints({
        filterRoles: toCsv(selRoles),
        filterIdPattern: idPat || undefined,
        filterRooms: toCsv(selRooms),
        filterFuncs: toCsv(selFuncs),
      });
      setResults(found);
      setSearched(true);
      // Pre-select only relevant DPs; non-relevant start deselected
      setSelected(new Set(found.filter(d => d.isRelevant).map(d => d.id)));
      setShowOthers(false);
    } finally {
      setLoading(false);
    }
  };

  // Apply merges new entries with existing ones to preserve custom labels/units
  const apply = () => {
    const discovered = new Map(results.map(d => [d.id, d]));
    const existingMap = new Map((opts.entries ?? []).map(e => [e.id, e]));
    const entries: AutoListEntry[] = [...selected].map(id => {
      const existing = existingMap.get(id);
      if (existing) return existing; // preserve user-edited label/unit/trueLabel/falseLabel
      const dp = discovered.get(id);
      return { id, label: undefined, rooms: dp?.rooms, unit: dp?.unit, role: dp?.role, writable: dp?.write };
    });
    setOpts({
      entries,
      filterRoles: toCsv(selRoles),
      filterIdPattern: idPat || undefined,
      filterRooms: toCsv(selRooms),
      filterFuncs: toCsv(selFuncs),
    });
  };

  const toggle = (id: string) =>
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const removeEntry = (id: string) =>
    setOpts({ entries: (opts.entries ?? []).filter(e => e.id !== id) });

  const updateEntry = (id: string, patch: Partial<AutoListEntry>) =>
    setOpts({ entries: (opts.entries ?? []).map(e => e.id === id ? { ...e, ...patch } : e) });

  const iSty = { background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' } as React.CSSProperties;
  const iCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none';
  const canSearch = selRoles.length > 0 || selRooms.length > 0 || selFuncs.length > 0 || !!idPat;

  return (
    <>
      {/* ── Filters ── */}
      <div className="grid grid-cols-2 gap-2">
        <MultiSelect label={t('autolist.roles')} options={availRoles} selected={selRoles}
          onChange={v => { setSelRoles(v); resetSearch(); }} loading={optLoading} />
        <MultiSelect label={t('autolist.room')} options={availRooms} selected={selRooms}
          onChange={v => { setSelRooms(v); resetSearch(); }} loading={optLoading} />
        <MultiSelect label={t('autolist.func')} options={availFuncs} selected={selFuncs}
          onChange={v => { setSelFuncs(v); resetSearch(); }} loading={optLoading} />
        <div>
          <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('autolist.idContains')}</label>
          <input className={iCls} style={iSty} placeholder={t('autolist.idPh')} value={idPat}
            onChange={e => { setIdPat(e.target.value); resetSearch(); }}
            onKeyDown={e => e.key === 'Enter' && canSearch && search()} />
        </div>
      </div>

      <button
        onClick={search}
        disabled={loading || !canSearch}
        className="w-full flex items-center justify-center gap-1.5 text-xs py-2 rounded-lg hover:opacity-80 disabled:opacity-40"
        style={{ background: 'var(--accent)', color: '#fff' }}
      >
        {loading ? <RefreshCw size={11} className="animate-spin" /> : <Search size={11} />}
        {t('autolist.search')}
      </button>

      {/* ── Search results ── */}
      {searched && results.length === 0 && (
        <p className="text-[11px] text-center py-2" style={{ color: 'var(--text-secondary)' }}>
          {t('autolist.noneFound')}
        </p>
      )}
      {searched && results.length > 0 && (() => {
        const relevant = results.filter(d => d.isRelevant);
        const others   = results.filter(d => !d.isRelevant);
        const DpRow = ({ dp, dimmed }: { dp: DiscoveredDp; dimmed?: boolean }) => (
          <label key={dp.id}
            className="flex items-center gap-2 px-2.5 py-2 rounded cursor-pointer hover:opacity-90"
            style={{
              background: selected.has(dp.id) ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'transparent',
              opacity: dimmed ? 0.55 : 1,
            }}>
            <div className="w-3.5 h-3.5 rounded shrink-0 flex items-center justify-center"
              style={{ background: selected.has(dp.id) ? 'var(--accent)' : 'var(--app-border)' }}>
              {selected.has(dp.id) && <Check size={9} color="#fff" />}
            </div>
            <input type="checkbox" className="sr-only" checked={selected.has(dp.id)}
              onChange={() => toggle(dp.id)} />
            <div className="min-w-0 flex-1">
              <div className="text-xs truncate" style={{ color: 'var(--text-primary)' }}>
                {dp.name}
                {dp.unit && <span className="ml-1 text-[10px]" style={{ color: 'var(--text-secondary)' }}>[{dp.unit}]</span>}
              </div>
              <div className="text-[10px] truncate font-mono" style={{ color: 'var(--text-secondary)' }}>
                {dp.id}{dp.rooms.length > 0 ? ` · ${dp.rooms[0]}` : ''}
              </div>
            </div>
          </label>
        );
        return (
          <>
            <div className="flex items-center justify-between">
              <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                {t('autolist.found', { count: results.length, selected: selected.size })}
              </span>
              <div className="flex gap-2">
                <button className="text-[10px] hover:opacity-70" style={{ color: 'var(--accent)' }}
                  onClick={() => setSelected(new Set(relevant.map(d => d.id)))}>{t('common.all')}</button>
                <button className="text-[10px] hover:opacity-70" style={{ color: 'var(--text-secondary)' }}
                  onClick={() => setSelected(new Set())}>{t('common.none')}</button>
              </div>
            </div>
            <div className="aura-scroll space-y-0.5 max-h-56 overflow-y-auto -mx-1 px-1">
              {relevant.map(dp => <DpRow key={dp.id} dp={dp} />)}
              {others.length > 0 && (
                <>
                  <button
                    onClick={() => setShowOthers(v => !v)}
                    className="w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[10px] hover:opacity-80 transition-opacity mt-1"
                    style={{ background: 'var(--app-border)', color: 'var(--text-secondary)' }}>
                    {showOthers ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                    <span>Weitere Datenpunkte ({others.length})</span>
                  </button>
                  {showOthers && others.map(dp => <DpRow key={dp.id} dp={dp} dimmed />)}
                </>
              )}
            </div>
            <button
              onClick={apply}
              disabled={selected.size === 0}
              className="w-full flex items-center justify-center gap-1.5 text-xs py-2 rounded-lg hover:opacity-80 disabled:opacity-40"
              style={{ background: 'var(--accent-green)', color: '#fff' }}
            >
              <Check size={11} /> {t('autolist.apply', { count: selected.size })}
            </button>
          </>
        );
      })()}

      {/* ── Divider ── */}
      <div style={{ height: 1, background: 'var(--app-border)' }} />

      {/* ── Current entries ── */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            {t('autolist.datapoints')} {(opts.entries ?? []).length > 0 && `(${opts.entries.length})`}
          </label>
          {(opts.entries ?? []).length > 0 && (
            <button onClick={() => setOpts({ entries: [] })}
              className="text-[10px] hover:opacity-70"
              style={{ color: 'var(--accent-red, #ef4444)' }}>
              Alle löschen
            </button>
          )}
        </div>
        {(opts.entries ?? []).length > 0 && (
          <div className="aura-scroll space-y-1 max-h-72 overflow-y-auto mb-1.5">
            {opts.entries.map(e => (
              <EntryConfigRow
                key={e.id}
                entry={e}
                resolvedName={resolvedNames[e.id]}
                onUpdate={patch => updateEntry(e.id, patch)}
                onRemove={() => removeEntry(e.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Settings ── */}
      <div style={{ height: 1, background: 'var(--app-border)' }} />
      <div>
        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('autolist.syncMin')}</label>
        <input type="number" min={1} className={iCls} style={iSty}
          value={opts.syncIntervalMin ?? 5}
          onChange={e => setOpts({ syncIntervalMin: Number(e.target.value) })} />
      </div>
      <div className="flex items-center justify-between">
        <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Anzahl anzeigen</label>
        <button onClick={() => setOpts({ showCount: !(opts.showCount ?? true) })}
          className="relative w-9 h-5 rounded-full transition-colors"
          style={{ background: (opts.showCount ?? true) ? 'var(--accent)' : 'var(--app-border)' }}>
          <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all"
            style={{ left: (opts.showCount ?? true) ? '18px' : '2px' }} />
        </button>
      </div>
      <div className="flex items-center justify-between">
        <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{t('autolist.showRoom')}</label>
        <button onClick={() => setOpts({ showRoom: !(opts.showRoom ?? false) })}
          className="relative w-9 h-5 rounded-full transition-colors"
          style={{ background: (opts.showRoom ?? false) ? 'var(--accent)' : 'var(--app-border)' }}>
          <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all"
            style={{ left: (opts.showRoom ?? false) ? '18px' : '2px' }} />
        </button>
      </div>
      <div className="flex items-center justify-between">
        <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>DP-ID anzeigen</label>
        <button onClick={() => setOpts({ showId: !(opts.showId ?? false) })}
          className="relative w-9 h-5 rounded-full transition-colors"
          style={{ background: (opts.showId ?? false) ? 'var(--accent)' : 'var(--app-border)' }}>
          <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all"
            style={{ left: (opts.showId ?? false) ? '18px' : '2px' }} />
        </button>
      </div>
      <div className="flex items-center justify-between">
        <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Nur relevante DPs (Auto-Sync)</label>
        <button onClick={() => setOpts({ filterRelevant: !(opts.filterRelevant ?? false) })}
          className="relative w-9 h-5 rounded-full transition-colors"
          style={{ background: (opts.filterRelevant ?? false) ? 'var(--accent)' : 'var(--app-border)' }}>
          <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all"
            style={{ left: (opts.filterRelevant ?? false) ? '18px' : '2px' }} />
        </button>
      </div>
      <div>
        <label className="text-[11px] mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Anzeige-Filter (Frontend)</label>
        <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--app-border)' }}>
          {(['all', 'active', 'inactive'] as const).map((v) => {
            const label = v === 'all' ? 'Alle' : v === 'active' ? (opts.filterActiveLabel || 'Nur aktive') : (opts.filterInactiveLabel || 'Nur inaktive');
            const active = (opts.valueFilter ?? 'all') === v;
            return (
              <button key={v} onClick={() => setOpts({ valueFilter: v })}
                className="flex-1 text-[11px] py-1.5 transition-colors"
                style={{
                  background: active ? 'var(--accent)' : 'var(--app-bg)',
                  color: active ? '#fff' : 'var(--text-secondary)',
                  borderRight: v !== 'inactive' ? '1px solid var(--app-border)' : undefined,
                }}>
                {label}
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-1.5 mt-1.5">
          <div>
            <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>Label &quot;aktiv&quot;</label>
            <input className="w-full text-[10px] rounded px-2 py-1 focus:outline-none"
              style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}
              placeholder="Nur aktive"
              value={opts.filterActiveLabel ?? ''}
              onChange={e => setOpts({ filterActiveLabel: e.target.value || undefined })} />
          </div>
          <div>
            <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>Label &quot;inaktiv&quot;</label>
            <input className="w-full text-[10px] rounded px-2 py-1 focus:outline-none"
              style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}
              placeholder="Nur inaktive"
              value={opts.filterInactiveLabel ?? ''}
              onChange={e => setOpts({ filterInactiveLabel: e.target.value || undefined })} />
          </div>
        </div>
      </div>
    </>
  );
}
