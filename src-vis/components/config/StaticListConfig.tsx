/**
 * StaticListConfig – config panel for the "Statische Liste" widget.
 *
 * Unlike AutoListConfig (filter-based discovery), entries are added
 * manually one at a time via the DatapointPicker (object browser).
 */
import { useState, useEffect } from 'react';
import { Database, X, ChevronRight, Settings2 } from 'lucide-react';
import { Icon } from '@iconify/react';
import type { WidgetConfig } from '../../types';
import type { StaticListEntry, StaticListOptions } from '../widgets/ListWidget';
import { DatapointPicker } from './DatapointPicker';
import { IconPickerModal } from './IconPickerModal';
import { lookupDatapointEntry, ensureDatapointCache } from '../../hooks/useDatapointList';
import { lucidePascalToIconify } from '../../utils/iconifyLoader';

function toIconifyId(name: string): string {
  return name.includes(':') ? name : lucidePascalToIconify(name);
}

interface Props {
  config: WidgetConfig;
  onConfigChange: (config: WidgetConfig) => void;
}

// ── Per-entry row ─────────────────────────────────────────────────────────────

function EntryRow({
  entry,
  resolvedName,
  onUpdate,
  onRemove,
}: {
  entry: StaticListEntry;
  resolvedName?: string;
  onUpdate: (patch: Partial<StaticListEntry>) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const iSty = { background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' } as React.CSSProperties;
  const iCls = 'w-full text-[10px] rounded px-2 py-1 focus:outline-none font-mono';

  return (
    <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--app-border)' }}>
      <div className="flex items-center gap-1.5 px-2 py-1.5" style={{ background: 'var(--app-bg)' }}>
        <button onClick={() => setExpanded(e => !e)}
          className="shrink-0 hover:opacity-70 transition-transform"
          style={{ color: 'var(--text-secondary)', transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
          <ChevronRight size={11} />
        </button>
        {entry.icon && (
          <button onClick={() => setIconPickerOpen(true)} className="shrink-0 hover:opacity-70 p-0.5"
            style={{ color: 'var(--text-secondary)' }}>
            <Icon icon={toIconifyId(entry.icon)} width={11} height={11} />
          </button>
        )}
        <span className="flex-1 text-[10px] truncate" style={{ color: 'var(--text-primary)' }}>
          {entry.label || resolvedName || entry.id.split('.').pop() || entry.id}
        </span>
        <button onClick={() => setExpanded(e => !e)} className="shrink-0 hover:opacity-70 p-0.5"
          style={{ color: 'var(--text-secondary)' }}>
          <Settings2 size={10} />
        </button>
        <button onClick={onRemove} className="shrink-0 hover:opacity-70"
          style={{ color: 'var(--text-secondary)' }}>
          <X size={11} />
        </button>
      </div>

      {expanded && (
        <div className="px-2.5 pb-2.5 pt-1 space-y-1.5"
          style={{ borderTop: '1px solid var(--app-border)', background: 'var(--app-surface)' }}>
          <div className="text-[9px] font-mono truncate mb-1" style={{ color: 'var(--text-secondary)' }}>{entry.id}</div>
          <div className="grid grid-cols-2 gap-1.5">
            <div>
              <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>Bezeichnung</label>
              <input className={iCls} style={iSty} placeholder="Auto"
                value={entry.label ?? ''}
                onChange={e => onUpdate({ label: e.target.value || undefined })} />
            </div>
            <div>
              <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>Einheit</label>
              <input className={iCls} style={iSty} placeholder="z.B. °C"
                value={entry.unit ?? ''}
                onChange={e => onUpdate({ unit: e.target.value || undefined })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <div>
              <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>Text aktiv</label>
              <input className={iCls} style={iSty} placeholder="AN"
                value={entry.trueLabel ?? ''}
                onChange={e => onUpdate({ trueLabel: e.target.value || undefined })} />
            </div>
            <div>
              <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>Text inaktiv</label>
              <input className={iCls} style={iSty} placeholder="AUS"
                value={entry.falseLabel ?? ''}
                onChange={e => onUpdate({ falseLabel: e.target.value || undefined })} />
            </div>
          </div>
          <div>
            <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>Icon</label>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setIconPickerOpen(true)}
                className="flex-1 flex items-center gap-1.5 text-[10px] rounded px-2 py-1 text-left hover:opacity-80"
                style={iSty}>
                {entry.icon
                  ? <><Icon icon={toIconifyId(entry.icon)} width={11} height={11} /><span className="truncate font-mono">{entry.icon}</span></>
                  : <span style={{ color: 'var(--text-secondary)' }}>Kein Icon</span>
                }
              </button>
              {entry.icon && (
                <button onClick={() => onUpdate({ icon: undefined })}
                  className="shrink-0 hover:opacity-70 p-1"
                  style={{ color: 'var(--text-secondary)' }}>
                  <X size={10} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {iconPickerOpen && (
        <IconPickerModal
          current={entry.icon ?? ''}
          onSelect={(name) => { onUpdate({ icon: name || undefined }); setIconPickerOpen(false); }}
          onClose={() => setIconPickerOpen(false)}
        />
      )}
    </div>
  );
}

// ── Main config panel ─────────────────────────────────────────────────────────

export function StaticListConfig({ config, onConfigChange }: Props) {
  const opts = (config.options ?? { entries: [] }) as unknown as StaticListOptions;
  const entries = opts.entries ?? [];
  const [showPicker, setShowPicker] = useState(false);
  const [resolvedNames, setResolvedNames] = useState<Record<string, string>>({});

  useEffect(() => {
    ensureDatapointCache().then(cache => {
      const map: Record<string, string> = {};
      for (const e of cache) map[e.id] = e.name;
      setResolvedNames(map);
    });
  }, []);

  const setOpts = (patch: Partial<StaticListOptions>) => {
    onConfigChange({ ...config, options: { ...opts, ...patch } });
  };

  const addEntry = (id: string, _name?: string, unit?: string) => {
    if (entries.find(e => e.id === id)) return;
    const dp = lookupDatapointEntry(id);
    const writable = dp?.write !== false ? undefined : false;
    setOpts({ entries: [...entries, { id, label: undefined, unit: unit || undefined, role: dp?.role, writable }] });
  };

  const removeEntry = (id: string) =>
    setOpts({ entries: entries.filter(e => e.id !== id) });

  const updateEntry = (id: string, patch: Partial<StaticListEntry>) =>
    setOpts({ entries: entries.map(e => e.id === id ? { ...e, ...patch } : e) });

  return (
    <>
      {/* ── Add DP ── */}
      <button
        onClick={() => setShowPicker(true)}
        className="w-full flex items-center justify-center gap-1.5 text-xs py-2 rounded-lg hover:opacity-80"
        style={{ background: 'var(--accent)', color: '#fff' }}>
        <Database size={12} /> Datenpunkt hinzufügen
      </button>

      {/* ── Entry list ── */}
      {entries.length > 0 && (
        <>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                Datenpunkte ({entries.length})
              </label>
              <button onClick={() => setOpts({ entries: [] })}
                className="text-[10px] hover:opacity-70"
                style={{ color: 'var(--accent-red, #ef4444)' }}>
                Alle löschen
              </button>
            </div>
            <div className="aura-scroll space-y-1 max-h-72 overflow-y-auto">
              {entries.map(e => (
                <EntryRow
                  key={e.id}
                  entry={e}
                  resolvedName={resolvedNames[e.id]}
                  onUpdate={patch => updateEntry(e.id, patch)}
                  onRemove={() => removeEntry(e.id)}
                />
              ))}
            </div>
          </div>
          <div style={{ height: 1, background: 'var(--app-border)' }} />
        </>
      )}

      {/* ── Settings ── */}
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
        <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Raum anzeigen</label>
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

      {/* ── Sortierung ── */}
      <div>
        <label className="text-[11px] mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Sortierung</label>
        <div className="flex gap-1">
          {(['none', 'label', 'value'] as const).map(v => {
            const lbl = v === 'none' ? 'Keine' : v === 'label' ? 'Name' : 'Wert';
            const active = (opts.sortBy ?? 'none') === v;
            return (
              <button key={v} onClick={() => setOpts({ sortBy: v === 'none' ? undefined : v })}
                className="flex-1 text-[11px] py-1.5 rounded-lg transition-colors"
                style={{
                  background: active ? 'var(--accent)' : 'var(--app-bg)',
                  color: active ? '#fff' : 'var(--text-secondary)',
                  border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                }}>
                {lbl}
              </button>
            );
          })}
        </div>
        {(opts.sortBy ?? 'none') !== 'none' && (
          <div className="flex gap-1 mt-1">
            {(['asc', 'desc'] as const).map(v => {
              const lbl = v === 'asc' ? '↑ Aufsteigend' : '↓ Absteigend';
              const active = (opts.sortOrder ?? 'asc') === v;
              return (
                <button key={v} onClick={() => setOpts({ sortOrder: v })}
                  className="flex-1 text-[11px] py-1.5 rounded-lg transition-colors"
                  style={{
                    background: active ? 'var(--accent)' : 'var(--app-bg)',
                    color: active ? '#fff' : 'var(--text-secondary)',
                    border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                  }}>
                  {lbl}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── DatapointPicker (multi-select) ── */}
      {showPicker && (
        <DatapointPicker
          currentValue=""
          onSelect={(id, unit, name) => { addEntry(id, name, unit); setShowPicker(false); }}
          onClose={() => setShowPicker(false)}
          multiSelect
          onMultiSelect={(picks) => {
            const newEntries = picks
              .filter(p => !entries.find(e => e.id === p.id))
              .map(p => ({ id: p.id, label: undefined, unit: p.unit || undefined, role: p.role, writable: p.write !== false ? undefined : false }));
            if (newEntries.length > 0) setOpts({ entries: [...entries, ...newEntries] });
            setShowPicker(false);
          }}
        />
      )}
    </>
  );
}
