/**
 * StaticListConfig – config panel for the "Statische Liste" widget.
 *
 * Unlike AutoListConfig (filter-based discovery), entries are added
 * manually one at a time via the DatapointPicker (object browser).
 */
import { useState } from 'react';
import { Database, X, ChevronRight, Settings2 } from 'lucide-react';
import type { WidgetConfig } from '../../types';
import type { StaticListEntry, StaticListOptions } from '../widgets/ListWidget';
import { DatapointPicker } from './DatapointPicker';
import { saveAll, saveToIoBroker } from '../../store/persistManager';

interface Props {
  config: WidgetConfig;
  onConfigChange: (config: WidgetConfig) => void;
}

// ── Per-entry row ─────────────────────────────────────────────────────────────

function EntryRow({
  entry,
  onUpdate,
  onRemove,
}: {
  entry: StaticListEntry;
  onUpdate: (patch: Partial<StaticListEntry>) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
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
        <span className="flex-1 text-[10px] truncate" style={{ color: 'var(--text-primary)' }}>
          {entry.label || entry.id.split('.').pop() || entry.id}
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
        </div>
      )}
    </div>
  );
}

// ── Main config panel ─────────────────────────────────────────────────────────

export function StaticListConfig({ config, onConfigChange }: Props) {
  const opts = (config.options ?? { entries: [] }) as unknown as StaticListOptions;
  const entries = opts.entries ?? [];
  const [showPicker, setShowPicker] = useState(false);

  const setOpts = (patch: Partial<StaticListOptions>) => {
    const updated = { ...config, options: { ...opts, ...patch } };
    onConfigChange(updated);
    saveAll();
    saveToIoBroker();
  };

  const addEntry = (id: string, name?: string, unit?: string) => {
    if (entries.find(e => e.id === id)) return; // already in list
    setOpts({ entries: [...entries, { id, label: name || undefined, unit: unit || undefined }] });
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
            <label className="text-[11px] mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>
              Datenpunkte ({entries.length})
            </label>
            <div className="aura-scroll space-y-1 max-h-72 overflow-y-auto">
              {entries.map(e => (
                <EntryRow
                  key={e.id}
                  entry={e}
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
      <div>
        <label className="text-[11px] mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Anzeige-Filter (Frontend)</label>
        <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--app-border)' }}>
          {(['all', 'active', 'inactive'] as const).map((v) => {
            const label = v === 'all' ? 'Alle' : v === 'active' ? 'Nur aktive' : 'Nur inaktive';
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
        <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>DP-ID anzeigen</label>
        <button onClick={() => setOpts({ showId: !(opts.showId ?? false) })}
          className="relative w-9 h-5 rounded-full transition-colors"
          style={{ background: (opts.showId ?? false) ? 'var(--accent)' : 'var(--app-border)' }}>
          <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all"
            style={{ left: (opts.showId ?? false) ? '18px' : '2px' }} />
        </button>
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
              .map(p => ({ id: p.id, label: p.name || undefined, unit: p.unit || undefined }));
            if (newEntries.length > 0) setOpts({ entries: [...entries, ...newEntries] });
            setShowPicker(false);
          }}
        />
      )}
    </>
  );
}
