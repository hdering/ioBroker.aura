import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Filter, X } from 'lucide-react';
import { useIoBroker, getObjectDirect } from '../../hooks/useIoBroker';
import { saveAll, saveToIoBroker } from '../../store/persistManager';
import type { WidgetProps, ioBrokerState } from '../../types';
import { resolveName } from './AutoListWidget';
import { CustomGridView } from './CustomGridView';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StaticListEntry {
  id: string;
  label?: string;
  unit?: string;
  trueLabel?: string;
  falseLabel?: string;
}

export interface StaticListOptions {
  entries: StaticListEntry[];
  /** 'all' = show everything (default), 'active' = only on/> 0, 'inactive' = only off/0 */
  valueFilter?: 'all' | 'active' | 'inactive';
  showId?: boolean;
  showTitle?: boolean;
  showCount?: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function isDimmerRole(id: string) {
  const r = id.toLowerCase();
  return r.includes('level') || r.includes('dimmer') || r.includes('brightness');
}

function isActive(val: ioBrokerState['val']): boolean {
  if (val === null || val === undefined) return false;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number')  return val > 0;
  if (typeof val === 'string')  return val !== '' && val !== '0' && val.toLowerCase() !== 'false';
  return false;
}

type FilterMode = 'all' | 'active' | 'inactive';
const FILTER_LABELS: Record<FilterMode, string> = {
  all: 'Alle',
  active: 'Nur aktive',
  inactive: 'Nur inaktive',
};

// ── Value cell ─────────────────────────────────────────────────────────────────

function EntryValue({ entry, val, setState }: {
  entry: StaticListEntry;
  val: ioBrokerState['val'];
  setState: (id: string, v: boolean | number | string) => void;
}) {
  const hasLabels = !!(entry.trueLabel || entry.falseLabel);
  const isBool    = typeof val === 'boolean';
  const isBoolLike = isBool || (typeof val === 'number' && (val === 0 || val === 1) && hasLabels);
  const on = val === true || val === 1;

  if (isBoolLike) {
    const toggle = () => setState(entry.id, isBool ? !on : on ? 0 : 1);
    if (hasLabels) {
      return (
        <button onClick={toggle}
          className="shrink-0 text-xs px-2.5 py-0.5 rounded-full font-medium transition-colors"
          style={{
            background: on ? 'var(--accent)' : 'var(--app-border)',
            color: on ? '#fff' : 'var(--text-secondary)',
          }}>
          {on ? (entry.trueLabel || 'AN') : (entry.falseLabel || 'AUS')}
        </button>
      );
    }
    return (
      <button onClick={toggle}
        className="shrink-0 relative w-9 h-[18px] rounded-full transition-colors"
        style={{ background: on ? 'var(--accent)' : 'var(--app-border)' }}>
        <span className="absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-all"
          style={{ left: on ? 'calc(100% - 16px)' : '2px' }} />
      </button>
    );
  }

  if (typeof val === 'number' && isDimmerRole(entry.id)) {
    return (
      <div className="shrink-0 flex items-center gap-1.5">
        <input type="range" min={0} max={100} value={val}
          onChange={e => setState(entry.id, Number(e.target.value))}
          className="w-20 h-1" style={{ accentColor: 'var(--accent)' }} />
        <span className="text-[10px] w-8 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>
          {Math.round(val)}{entry.unit ?? '%'}
        </span>
      </div>
    );
  }

  const active = isActive(val);
  return (
    <span className="shrink-0 text-xs font-medium tabular-nums"
      style={{ color: active ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
      {val != null ? `${String(val)}${entry.unit ? ' ' + entry.unit : ''}` : '–'}
    </span>
  );
}

// ── Main Widget ────────────────────────────────────────────────────────────────

export function ListWidget({ config, editMode, onConfigChange }: WidgetProps) {
  const opts = useMemo(
    () => (config.options ?? { entries: [] }) as unknown as StaticListOptions,
    [config.options],
  );
  const entries = useMemo<StaticListEntry[]>(() => opts.entries ?? [], [opts.entries]);
  const { subscribe, setState, getState } = useIoBroker();
  const [states, setStates] = useState<Record<string, ioBrokerState | null>>({});
  const [resolvedNames, setResolvedNames] = useState<Record<string, string>>({});
  const [showFilter, setShowFilter] = useState(false);

  const saveOpts = useCallback((patch: Partial<StaticListOptions>) => {
    onConfigChange({ ...config, options: { ...opts, ...patch } });
  }, [config, opts, onConfigChange]);

  // Subscribe to all entry states
  const entryKey = entries.map(e => e.id).join(',');
  const prevKey = useRef('');
  useEffect(() => {
    if (entryKey === prevKey.current) return;
    prevKey.current = entryKey;
    if (entries.length === 0) return;
    entries.forEach(e => getState(e.id).then(s => setStates(prev => ({ ...prev, [e.id]: s }))));
    const unsubs = entries.map(e =>
      subscribe(e.id, s => setStates(prev => ({ ...prev, [e.id]: s })))
    );
    entries.filter(e => !e.label).forEach(async (e) => {
      const obj = await getObjectDirect(e.id);
      if (obj?.common?.name) {
        const name = resolveName(obj.common.name as string | Record<string, string>, e.id.split('.').pop() ?? e.id);
        setResolvedNames(prev => ({ ...prev, [e.id]: name }));
      }
    });
    return () => unsubs.forEach(u => u());
  }, [entryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const removeEntry = (id: string) => {
    saveOpts({ entries: entries.filter(e => e.id !== id) });
    saveAll();
    saveToIoBroker();
  };

  const getLabel = (entry: StaticListEntry) =>
    entry.label || resolvedNames[entry.id] || entry.id.split('.').pop() || entry.id;

  // Value filter (same logic as AutoListWidget)
  const valueFilter = (opts.valueFilter ?? 'all') as FilterMode;

  const visibleEntries = useMemo(() => {
    if (editMode || valueFilter === 'all') return entries;
    return entries.filter(e => {
      const val = states[e.id]?.val ?? null;
      if (val === null) return true; // not yet loaded → show
      return valueFilter === 'active' ? isActive(val) : !isActive(val);
    });
  }, [entries, states, valueFilter, editMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeCount = entries.filter(e => isActive(states[e.id]?.val ?? null)).length;

  const showTitle = opts.showTitle !== false;
  const showCount = opts.showCount !== false;

  const layout = config.layout ?? 'default';
  if (layout === 'custom') return <CustomGridView config={config} value="" />;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      {showTitle && (
      <div className="shrink-0 flex items-center justify-between px-3 py-1.5"
        style={{ borderBottom: '1px solid var(--widget-border)' }}>
        <span className="text-xs font-semibold truncate" style={{ color: 'var(--text-secondary)' }}>
          {config.title || 'Statische Liste'}
          {showCount && entries.length > 0 && (
            <span className="ml-1 opacity-50">
              ({valueFilter !== 'all' ? `${visibleEntries.length}/` : ''}{entries.length})
            </span>
          )}
        </span>
        <div className="relative shrink-0">
          <button
            onClick={() => setShowFilter(v => !v)}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] hover:opacity-80"
            style={{
              background: valueFilter !== 'all' ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent',
              color: valueFilter !== 'all' ? 'var(--accent)' : 'var(--text-secondary)',
              border: `1px solid ${valueFilter !== 'all' ? 'color-mix(in srgb, var(--accent) 40%, transparent)' : 'transparent'}`,
            }}
            title="Filter">
            <Filter size={10} />
            {valueFilter !== 'all' && <span>{FILTER_LABELS[valueFilter]}</span>}
          </button>
          {showFilter && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowFilter(false)} />
              <div className="absolute right-0 top-6 rounded-lg shadow-xl z-20 overflow-hidden min-w-[110px]"
                style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}>
                {(Object.keys(FILTER_LABELS) as FilterMode[]).map(mode => (
                  <button key={mode}
                    onClick={() => { saveOpts({ valueFilter: mode }); setShowFilter(false); }}
                    className="w-full px-3 py-2 text-xs text-left hover:opacity-80"
                    style={{
                      background: valueFilter === mode ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent',
                      color: valueFilter === mode ? 'var(--accent)' : 'var(--text-primary)',
                    }}>
                    {FILTER_LABELS[mode]}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      )}

      {/* Active summary line */}
      {entries.length > 0 && valueFilter === 'all' && (
        <div className="shrink-0 px-3 py-0.5">
          <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
            {activeCount} / {entries.length} aktiv
          </span>
        </div>
      )}

      {/* Empty state */}
      {visibleEntries.length === 0 && (
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-xs text-center" style={{ color: 'var(--text-secondary)' }}>
            {entries.length === 0
              ? `Noch keine Datenpunkte.${editMode ? ' Bearbeiten → Datenpunkt hinzufügen.' : ''}`
              : valueFilter === 'active' ? 'Alle Datenpunkte inaktiv.'
              : 'Alle Datenpunkte aktiv.'}
          </p>
        </div>
      )}

      {/* List */}
      {visibleEntries.length > 0 && (
        <div className="aura-scroll flex-1 overflow-y-auto min-h-0">
          {visibleEntries.map(entry => {
            const state  = states[entry.id] ?? null;
            const val    = state?.val ?? null;
            const active = isActive(val);
            const label  = getLabel(entry);

            return (
              <div key={entry.id}
                className="flex items-center gap-2 px-3 py-2"
                style={{ borderBottom: '1px solid var(--widget-border)' }}>
                {/* Status dot */}
                <span className="w-2 h-2 rounded-full shrink-0"
                  style={{
                    background: val === null ? 'var(--app-border)'
                      : active ? 'var(--accent-green)' : 'var(--text-secondary)',
                  }} />

                {editMode && (
                  <button onClick={() => removeEntry(entry.id)}
                    className="shrink-0 hover:opacity-70" style={{ color: 'var(--text-secondary)' }}>
                    <X size={11} />
                  </button>
                )}

                <div className="flex-1 min-w-0">
                  <div className="text-xs truncate" style={{ color: 'var(--text-primary)' }}>{label}</div>
                  {opts.showId && (
                    <div className="text-[9px] truncate font-mono" style={{ color: 'var(--text-secondary)' }}>
                      {entry.id}
                    </div>
                  )}
                </div>

                <EntryValue entry={entry} val={val} setState={setState} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
