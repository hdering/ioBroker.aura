import { useState, useEffect } from 'react';
import { Filter } from 'lucide-react';
import { useIoBroker } from '../../hooks/useIoBroker';
import { useGroupStore } from '../../store/groupStore';
import type { WidgetProps, ioBrokerState } from '../../types';

type FilterMode = 'all' | 'active' | 'inactive';

const FILTER_LABELS: Record<FilterMode, string> = {
  all: 'Alle',
  active: 'Aktiv / AN',
  inactive: 'Inaktiv / AUS',
};

function isActive(val: ioBrokerState['val']): boolean {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val > 0;
  return false;
}

export function ListWidget({ config }: WidgetProps) {
  const groupId = config.datapoint; // datapoint-Feld enthält die Gruppen-ID
  const { groups } = useGroupStore();
  const group = groups.find((g) => g.id === groupId);
  const { subscribe, setState, connected } = useIoBroker();

  const [states, setStates] = useState<Map<string, ioBrokerState>>(new Map());
  const [filterMode, setFilterMode] = useState<FilterMode>(
    (config.options?.defaultFilter as FilterMode) ?? 'all',
  );
  const [showFilter, setShowFilter] = useState(false);

  useEffect(() => {
    if (!group || !connected) return;
    const unsubs = group.datapoints.map((dp) =>
      subscribe(dp.id, (state) => {
        setStates((prev) => new Map(prev).set(dp.id, state));
      }),
    );
    return () => unsubs.forEach((u) => u());
  }, [group, connected, subscribe]);

  if (!group) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Gruppe nicht gefunden</p>
      </div>
    );
  }

  const filtered = group.datapoints.filter((dp) => {
    const state = states.get(dp.id);
    if (!state) return filterMode === 'all';
    if (filterMode === 'active') return isActive(state.val);
    if (filterMode === 'inactive') return !isActive(state.val);
    return true;
  });

  const activeCount = group.datapoints.filter((dp) => {
    const s = states.get(dp.id);
    return s && isActive(s.val);
  }).length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-2 shrink-0">
        <div>
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{config.title || group.name}</p>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {activeCount} / {group.datapoints.length} aktiv
          </p>
        </div>
        <div className="relative">
          <button
            onClick={() => setShowFilter((v) => !v)}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs hover:opacity-80"
            style={{
              background: filterMode !== 'all' ? 'var(--accent)22' : 'var(--app-bg)',
              color: filterMode !== 'all' ? 'var(--accent)' : 'var(--text-secondary)',
              border: '1px solid var(--app-border)',
            }}
          >
            <Filter size={11} />
            {FILTER_LABELS[filterMode]}
          </button>
          {showFilter && (
            <div className="absolute right-0 top-7 rounded-lg shadow-xl z-20 overflow-hidden"
              style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)', minWidth: 110 }}>
              {(Object.keys(FILTER_LABELS) as FilterMode[]).map((mode) => (
                <button key={mode}
                  onClick={() => { setFilterMode(mode); setShowFilter(false); }}
                  className="w-full px-3 py-2 text-xs text-left hover:opacity-80"
                  style={{
                    background: filterMode === mode ? 'var(--accent)22' : 'transparent',
                    color: filterMode === mode ? 'var(--accent)' : 'var(--text-primary)',
                  }}>
                  {FILTER_LABELS[mode]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Liste */}
      <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {filterMode === 'all' ? 'Keine Datenpunkte' : `Keine ${FILTER_LABELS[filterMode]}`}
            </p>
          </div>
        ) : (
          filtered.map((dp) => {
            const state = states.get(dp.id);
            const val = state?.val ?? null;
            const active = val !== null && isActive(val);

            return (
              <div key={dp.id}
                className="flex items-center gap-2 px-2.5 py-2 rounded-lg"
                style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}>
                {/* Status-Dot */}
                <span className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: val === null ? 'var(--app-border)' : active ? 'var(--accent-green)' : 'var(--text-secondary)', }} />

                {/* Label */}
                <span className="flex-1 text-xs truncate" style={{ color: 'var(--text-primary)' }}>{dp.label}</span>

                {/* Wert / Toggle */}
                {dp.type === 'boolean' && dp.writable ? (
                  <button
                    onClick={() => setState(dp.id, !active)}
                    className="relative w-9 h-5 rounded-full transition-colors duration-200 focus:outline-none shrink-0"
                    style={{ background: active ? 'var(--accent-green)' : 'var(--app-border)' }}>
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${active ? 'translate-x-4' : 'translate-x-0'}`} />
                  </button>
                ) : (
                  <span className="text-xs font-mono shrink-0" style={{ color: active ? 'var(--accent-green)' : 'var(--text-secondary)' }}>
                    {val === null ? '–' : typeof val === 'boolean' ? (val ? 'AN' : 'AUS') : `${val}${dp.unit ? ` ${dp.unit}` : ''}`}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>

      {showFilter && <div className="fixed inset-0 z-10" onClick={() => setShowFilter(false)} />}
    </div>
  );
}
