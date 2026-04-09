import { useEffect, useRef, useState, useCallback } from 'react';
import { RefreshCw, X } from 'lucide-react';
import type { WidgetProps, ioBrokerState } from '../../types';
import { getObjectViewDirect, useIoBroker } from '../../hooks/useIoBroker';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AutoListEntry {
  id: string;
  label?: string;
}

export interface AutoListOptions {
  entries: AutoListEntry[];
  filterRoles?: string;
  filterIdPattern?: string;
  filterRooms?: string;
  filterFuncs?: string;
  syncIntervalMin?: number;
  showRoom?: boolean;
}

export interface DiscoveredDp {
  id: string;
  name: string;
  role?: string;
  type?: string;
  rooms: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isDimmerRole(role?: string) {
  const r = (role ?? '').toLowerCase();
  return r.includes('level') || r.includes('dimmer') || r.includes('brightness');
}

function resolveName(name: string | Record<string, string> | undefined, fallback: string): string {
  if (!name) return fallback;
  if (typeof name === 'string') return name;
  return name.de ?? name.en ?? Object.values(name)[0] ?? fallback;
}

export async function loadFilterOptions(): Promise<{
  roles: string[];
  rooms: string[];
  funcs: string[];
}> {
  const [stateResult, enumResult] = await Promise.all([
    getObjectViewDirect('state'),
    getObjectViewDirect('enum', 'enum.', 'enum.\u9999'),
  ]);

  const rolesSet = new Set<string>();
  for (const { value: obj } of stateResult.rows) {
    if (obj?.common?.role) rolesSet.add(obj.common.role);
  }

  const rooms: string[] = [];
  const funcs: string[] = [];
  for (const { value: obj } of enumResult.rows) {
    if (!obj) continue;
    const label = resolveName(obj.common?.name, obj._id.split('.').pop() ?? obj._id);
    if (obj._id.startsWith('enum.rooms.')) rooms.push(label);
    else if (obj._id.startsWith('enum.functions.')) funcs.push(label);
  }

  return {
    roles: Array.from(rolesSet).sort(),
    rooms: rooms.sort(),
    funcs: funcs.sort(),
  };
}

export async function discoverDatapoints(
  opts: Pick<AutoListOptions, 'filterRoles' | 'filterIdPattern' | 'filterRooms' | 'filterFuncs'>,
): Promise<DiscoveredDp[]> {
  const [stateResult, enumResult] = await Promise.all([
    getObjectViewDirect('state'),
    getObjectViewDirect('enum', 'enum.', 'enum.\u9999'),
  ]);

  const roomMap = new Map<string, string[]>();
  for (const { value: obj } of enumResult.rows) {
    if (!obj?.common?.members?.length || !obj._id.startsWith('enum.rooms.')) continue;
    const label = resolveName(obj.common.name, obj._id.split('.').pop() ?? obj._id);
    for (const id of obj.common.members) {
      if (!roomMap.has(id)) roomMap.set(id, []);
      roomMap.get(id)!.push(label);
    }
  }

  const funcMap = new Map<string, string[]>();
  for (const { value: obj } of enumResult.rows) {
    if (!obj?.common?.members?.length || !obj._id.startsWith('enum.functions.')) continue;
    const label = resolveName(obj.common.name, obj._id.split('.').pop() ?? obj._id);
    for (const id of obj.common.members) {
      if (!funcMap.has(id)) funcMap.set(id, []);
      funcMap.get(id)!.push(label);
    }
  }

  const rolePatterns = (opts.filterRoles ?? '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const idPattern = opts.filterIdPattern?.trim().toLowerCase() ?? '';
  const roomFilter = (opts.filterRooms ?? '').split(',').map(s => s.trim()).filter(Boolean);
  const funcFilter = (opts.filterFuncs ?? '').split(',').map(s => s.trim()).filter(Boolean);

  return stateResult.rows
    .filter(({ id, value: obj }) => {
      const role = (obj.common.role ?? '').toLowerCase();
      if (rolePatterns.length > 0 && !rolePatterns.some(p => role.includes(p))) return false;
      if (idPattern && !id.toLowerCase().includes(idPattern)) return false;
      if (roomFilter.length > 0) {
        const rooms = roomMap.get(id) ?? [];
        if (!roomFilter.some(r => rooms.includes(r))) return false;
      }
      if (funcFilter.length > 0) {
        const funcs = funcMap.get(id) ?? [];
        if (!funcFilter.some(f => funcs.includes(f))) return false;
      }
      return true;
    })
    .map(({ id, value: obj }) => ({
      id,
      name: resolveName(obj.common.name, id.split('.').pop() ?? id),
      role: obj.common.role,
      type: obj.common.type,
      rooms: roomMap.get(id) ?? [],
    }));
}

// ── Main Widget ───────────────────────────────────────────────────────────────

export function AutoListWidget({ config, editMode, onConfigChange }: WidgetProps) {
  const opts = (config.options ?? { entries: [] }) as unknown as AutoListOptions;
  const entries: AutoListEntry[] = opts.entries ?? [];
  const { subscribe, setState, getState } = useIoBroker();
  const [states, setStates] = useState<Record<string, ioBrokerState | null>>({});
  const [syncing, setSyncing] = useState(false);
  const syncMs = (opts.syncIntervalMin ?? 5) * 60_000;

  const saveOpts = useCallback((patch: Partial<AutoListOptions>) => {
    onConfigChange({ ...config, options: { ...opts, ...patch } });
  }, [config, opts, onConfigChange]);

  // Subscribe to all stored entries
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
    return () => unsubs.forEach(u => u());
  }, [entryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Background auto-sync
  const runSync = useCallback(async () => {
    const hasFilter = opts.filterRoles || opts.filterIdPattern || opts.filterRooms || opts.filterFuncs;
    if (!hasFilter) return;
    setSyncing(true);
    try {
      const found = await discoverDatapoints(opts);
      const existingIds = new Set(entries.map(e => e.id));
      const newEntries = found.filter(d => !existingIds.has(d.id)).map(d => ({ id: d.id }));
      if (newEntries.length > 0) saveOpts({ entries: [...entries, ...newEntries] });
    } finally {
      setSyncing(false);
    }
  }, [opts, entries, saveOpts]);

  useEffect(() => {
    const timer = setInterval(runSync, syncMs);
    return () => clearInterval(timer);
  }, [runSync, syncMs]);

  const removeEntry = (id: string) => saveOpts({ entries: entries.filter(e => e.id !== id) });

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-3 py-1.5 flex items-center justify-between"
        style={{ borderBottom: '1px solid var(--widget-border)' }}>
        <span className="text-xs font-semibold truncate" style={{ color: 'var(--text-secondary)' }}>
          {config.title || 'Auto-Liste'}
          {entries.length > 0 && <span className="ml-1 opacity-50">({entries.length})</span>}
        </span>
        <button onClick={runSync} title="Jetzt synchronisieren"
          className="hover:opacity-70 transition-opacity p-0.5" style={{ color: 'var(--text-secondary)' }}>
          <RefreshCw size={11} className={syncing ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Empty state */}
      {entries.length === 0 && (
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-xs text-center" style={{ color: 'var(--text-secondary)' }}>
            Noch keine Datenpunkte konfiguriert.{editMode ? '\nBearbeiten → Datenpunkte suchen.' : ''}
          </p>
        </div>
      )}

      {/* List */}
      {entries.length > 0 && (
        <div className="flex-1 overflow-auto min-h-0">
          {entries.map(entry => {
            const state = states[entry.id] ?? null;
            const val = state?.val;
            const isNumber = typeof val === 'number';
            const label = entry.label || entry.id.split('.').pop() || entry.id;

            return (
              <div key={entry.id} className="flex items-center gap-2 px-3 py-2"
                style={{ borderBottom: '1px solid var(--widget-border)' }}>
                {editMode && (
                  <button onClick={() => removeEntry(entry.id)} className="shrink-0 hover:opacity-70"
                    style={{ color: 'var(--text-secondary)' }}>
                    <X size={12} />
                  </button>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-xs truncate" style={{ color: 'var(--text-primary)' }}>{label}</div>
                  {opts.showRoom && (
                    <div className="text-[10px] truncate font-mono" style={{ color: 'var(--text-secondary)' }}>
                      {entry.id}
                    </div>
                  )}
                </div>

                {typeof val === 'boolean' && (
                  <button onClick={() => setState(entry.id, !val)}
                    className="shrink-0 relative w-9 h-[18px] rounded-full transition-colors"
                    style={{ background: val ? 'var(--accent)' : 'var(--app-border)' }}>
                    <span className="absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-all"
                      style={{ left: val ? 'calc(100% - 16px)' : '2px' }} />
                  </button>
                )}

                {isNumber && isDimmerRole(entry.id) && (
                  <div className="shrink-0 flex items-center gap-1.5">
                    <input type="range" min={0} max={100} value={val as number}
                      onChange={e => setState(entry.id, Number(e.target.value))}
                      className="w-20 h-1" style={{ accentColor: 'var(--accent)' }} />
                    <span className="text-[10px] w-8 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                      {Math.round(val as number)}%
                    </span>
                  </div>
                )}

                {!isNumber && typeof val !== 'boolean' && (
                  <span className="shrink-0 text-xs font-medium tabular-nums" style={{ color: 'var(--text-primary)' }}>
                    {val != null ? String(val) : '–'}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
