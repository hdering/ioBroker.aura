import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { RefreshCw, X, Filter } from 'lucide-react';
import type { WidgetProps, ioBrokerState } from '../../types';
import { getObjectViewDirect, getObjectDirect, useIoBroker } from '../../hooks/useIoBroker';
import { saveAll, saveToIoBroker } from '../../store/persistManager';
import { isRelevantDp } from '../../utils/dpRelevance';
import { getRoleDisplay } from '../../utils/listEntryDisplay';
import { CustomGridView } from './CustomGridView';
import { applyDpNameFilter } from '../../utils/dpNameFilter';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { useT } from '../../i18n';
import { formatLastChange } from '../../utils/formatLastChange';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AutoListEntry {
  id: string;
  label?: string;
  rooms?: string[];
  unit?: string;
  role?: string;
  trueLabel?: string;
  falseLabel?: string;
  writable?: boolean; // false = read-only; undefined/true = writable
}

export interface AutoListOptions {
  entries: AutoListEntry[];
  filterRoles?: string;
  filterIdPattern?: string;
  filterRooms?: string;
  filterFuncs?: string;
  syncIntervalMin?: number;
  showRoom?: boolean;
  showId?: boolean;
  filterRelevant?: boolean;
  /** 'all' = show everything (default), 'active' = only on/> 0, 'inactive' = only off/0 */
  valueFilter?: 'all' | 'active' | 'inactive';
  filterActiveLabel?: string;
  filterInactiveLabel?: string;
  showTitle?: boolean;
  showCount?: boolean;
}

export interface DiscoveredDp {
  id: string;
  name: string;
  role?: string;
  type?: string;
  unit?: string;
  write?: boolean;
  rooms: string[];
  /** true if the role/type matches a known widget pattern */
  isRelevant: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isDimmerRole(role?: string) {
  const r = (role ?? '').toLowerCase();
  return r.includes('level') || r.includes('dimmer') || r.includes('brightness');
}

export function resolveName(name: string | Record<string, string> | undefined, fallback: string): string {
  if (!name) return fallback;
  if (typeof name === 'string') return name;
  return name.de ?? name.en ?? Object.values(name)[0] ?? fallback;
}

export async function loadFilterOptions(): Promise<{ roles: string[]; rooms: string[]; funcs: string[] }> {
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
  return { roles: Array.from(rolesSet).sort(), rooms: rooms.sort(), funcs: funcs.sort() };
}

export async function discoverDatapoints(
  opts: Pick<AutoListOptions, 'filterRoles' | 'filterIdPattern' | 'filterRooms' | 'filterFuncs'>,
): Promise<DiscoveredDp[]> {
  const [stateResult, enumResult] = await Promise.all([
    getObjectViewDirect('state'),
    getObjectViewDirect('enum', 'enum.', 'enum.\u9999'),
  ]);

  // Build memberId → { rooms, funcs } map.
  // IMPORTANT: index by each member ID so we can do parent-path traversal below.
  // This mirrors useDatapointList which checks the state ID AND all parent paths,
  // because ioBroker adapters often assign rooms/functions to channels or devices,
  // not to individual state objects.
  const enumMap = new Map<string, { rooms: string[]; funcs: string[] }>();
  for (const { value: obj } of enumResult.rows) {
    if (!obj?.common?.members?.length) continue;
    const isRoom = obj._id.startsWith('enum.rooms.');
    const isFunc = obj._id.startsWith('enum.functions.');
    if (!isRoom && !isFunc) continue;
    const label = resolveName(obj.common.name, obj._id.split('.').pop() ?? obj._id);
    for (const memberId of obj.common.members) {
      if (!enumMap.has(memberId)) enumMap.set(memberId, { rooms: [], funcs: [] });
      const e = enumMap.get(memberId)!;
      if (isRoom) e.rooms.push(label);
      else e.funcs.push(label);
    }
  }

  // Role filter: exact match (same as DatapointPicker) with OR semantics for multiple values.
  const roleFilter  = (opts.filterRoles ?? '').split(',').map(s => s.trim()).filter(Boolean);
  const idPattern   = opts.filterIdPattern?.trim().toLowerCase() ?? '';
  const roomFilter  = (opts.filterRooms ?? '').split(',').map(s => s.trim()).filter(Boolean);
  const funcFilter  = (opts.filterFuncs ?? '').split(',').map(s => s.trim()).filter(Boolean);

  return stateResult.rows
    .filter(({ id, value: obj }) => {
      const role = obj.common.role ?? '';
      if (roleFilter.length > 0 && !roleFilter.includes(role)) return false;
      if (idPattern && !id.toLowerCase().includes(idPattern)) return false;

      // Traverse the state ID and all parent paths to find room/func memberships.
      // e.g. for "hm-rpc.0.ABC.1.STATE" check:
      //   hm-rpc.0.ABC.1.STATE → hm-rpc.0.ABC.1 → hm-rpc.0.ABC → hm-rpc.0
      if (roomFilter.length > 0 || funcFilter.length > 0) {
        const parts = id.split('.');
        const roomsSet = new Set<string>();
        const funcsSet = new Set<string>();
        for (let i = parts.length; i >= 2; i--) {
          const e = enumMap.get(parts.slice(0, i).join('.'));
          if (e) { e.rooms.forEach(r => roomsSet.add(r)); e.funcs.forEach(f => funcsSet.add(f)); }
        }
        if (roomFilter.length > 0 && !roomFilter.some(r => roomsSet.has(r))) return false;
        if (funcFilter.length > 0 && !funcFilter.some(f => funcsSet.has(f))) return false;
      }
      return true;
    })
    .map(({ id, value: obj }) => {
      // Build rooms array via parent-path traversal (same logic as filter above)
      const parts = id.split('.');
      const roomsSet = new Set<string>();
      for (let i = parts.length; i >= 2; i--) {
        const e = enumMap.get(parts.slice(0, i).join('.'));
        if (e) e.rooms.forEach(r => roomsSet.add(r));
      }
      const role = obj.common.role as string | undefined;
      const type = obj.common.type as string | undefined;
      return {
        id,
        name: resolveName(obj.common.name as string | Record<string, string>, id.split('.').pop() ?? id),
        role,
        type,
        unit: (obj.common.unit as string | undefined) || undefined,
        write: obj.common.write !== false ? undefined : false,
        rooms: [...roomsSet],
        isRelevant: isRelevantDp(role, type),
      };
    });
}

// ── Value display: row variant ────────────────────────────────────────────────

function EntryValue({ entry, val, writable, setState }: {
  entry: AutoListEntry;
  val: ioBrokerState['val'];
  writable: boolean;
  setState: (id: string, v: boolean | number | string) => void;
}) {
  const hasLabels = !!(entry.trueLabel || entry.falseLabel);
  const isBool = typeof val === 'boolean';
  const isBoolLike = isBool || (typeof val === 'number' && (val === 0 || val === 1));
  const on = val === true || val === 1;

  // Role-based display for sensors (window, door, motion, smoke, …)
  if (isBoolLike && !hasLabels) {
    const roleDisplay = getRoleDisplay(entry.role, val);
    if (roleDisplay) {
      return (
        <span className="shrink-0 text-xs font-medium px-2 py-0.5 rounded-full"
          style={{ background: `${roleDisplay.color}22`, color: roleDisplay.color }}>
          {roleDisplay.label}
        </span>
      );
    }
  }

  if (isBoolLike) {
    if (hasLabels) {
      return (
        <button onClick={writable ? () => setState(entry.id, isBool ? !on : on ? 0 : 1) : undefined}
          className="shrink-0 text-xs px-2.5 py-0.5 rounded-full font-medium"
          style={{
            background: on ? 'var(--accent)' : 'var(--app-border)',
            color: on ? '#fff' : 'var(--text-secondary)',
            cursor: writable ? 'pointer' : 'default',
          }}>
          {on ? (entry.trueLabel || 'AN') : (entry.falseLabel || 'AUS')}
        </button>
      );
    }
    if (!writable) {
      return (
        <span className="shrink-0 relative w-9 h-[18px] rounded-full pointer-events-none"
          style={{ background: on ? 'var(--accent)' : 'var(--app-border)' }}>
          <span className="absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white"
            style={{ left: on ? 'calc(100% - 16px)' : '2px' }} />
        </span>
      );
    }
    return (
      <button onClick={() => setState(entry.id, isBool ? !on : on ? 0 : 1)}
        className="shrink-0 relative w-9 h-[18px] rounded-full transition-colors"
        style={{ background: on ? 'var(--accent)' : 'var(--app-border)' }}>
        <span className="absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-all"
          style={{ left: on ? 'calc(100% - 16px)' : '2px' }} />
      </button>
    );
  }

  if (typeof val === 'number' && isDimmerRole(entry.id)) {
    if (!writable) {
      return (
        <span className="shrink-0 text-xs font-medium tabular-nums" style={{ color: 'var(--text-primary)' }}>
          {Math.round(val)}{entry.unit ?? '%'}
        </span>
      );
    }
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

  return (
    <span className="shrink-0 text-xs font-medium tabular-nums" style={{ color: 'var(--text-primary)' }}>
      {val != null ? `${String(val)}${entry.unit ? ' ' + entry.unit : ''}` : '–'}
    </span>
  );
}

// ── Value display: card variant (larger) ──────────────────────────────────────

function CardEntryValue({ entry, val, writable, setState }: {
  entry: AutoListEntry;
  val: ioBrokerState['val'];
  writable: boolean;
  setState: (id: string, v: boolean | number | string) => void;
}) {
  const hasLabels = !!(entry.trueLabel || entry.falseLabel);
  const isBool = typeof val === 'boolean';
  const isBoolLike = isBool || (typeof val === 'number' && (val === 0 || val === 1));
  const on = val === true || val === 1;

  // Role-based display for sensors
  if (isBoolLike && !hasLabels) {
    const roleDisplay = getRoleDisplay(entry.role, val);
    if (roleDisplay) {
      return (
        <span className="w-full py-1.5 rounded-lg text-xs font-semibold text-center block"
          style={{ background: `${roleDisplay.color}22`, color: roleDisplay.color }}>
          {roleDisplay.label}
        </span>
      );
    }
  }

  if (isBoolLike) {
    return (
      <button onClick={writable ? () => setState(entry.id, isBool ? !on : on ? 0 : 1) : undefined}
        className="w-full py-1.5 rounded-lg text-xs font-semibold"
        style={{
          background: on ? 'var(--accent)' : 'var(--app-border)',
          color: on ? '#fff' : 'var(--text-secondary)',
          cursor: writable ? 'pointer' : 'default',
        }}>
        {on ? (entry.trueLabel || 'AN') : (entry.falseLabel || 'AUS')}
      </button>
    );
  }

  if (typeof val === 'number' && isDimmerRole(entry.id)) {
    if (!writable) {
      return (
        <span className="text-xl font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>
          {Math.round(val)}
          <span className="text-sm ml-0.5 font-normal" style={{ color: 'var(--text-secondary)' }}>{entry.unit ?? '%'}</span>
        </span>
      );
    }
    return (
      <div className="w-full flex flex-col items-center gap-1">
        <span className="text-xl font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>
          {Math.round(val)}
          <span className="text-sm ml-0.5 font-normal" style={{ color: 'var(--text-secondary)' }}>{entry.unit ?? '%'}</span>
        </span>
        <input type="range" min={0} max={100} value={val}
          onChange={e => setState(entry.id, Number(e.target.value))}
          className="w-full h-1.5 rounded-full" style={{ accentColor: 'var(--accent)' }} />
      </div>
    );
  }

  return (
    <span className="text-2xl font-bold tabular-nums text-center leading-none" style={{ color: 'var(--text-primary)' }}>
      {val != null ? String(val) : '–'}
      {entry.unit && <span className="text-sm ml-0.5 font-normal" style={{ color: 'var(--text-secondary)' }}>{entry.unit}</span>}
    </span>
  );
}

// ── Main Widget ───────────────────────────────────────────────────────────────

export function AutoListWidget({ config, editMode, onConfigChange }: WidgetProps) {
  const opts = useMemo(
    () => (config.options ?? { entries: [] }) as unknown as AutoListOptions,
    [config.options],
  );
  const entries = useMemo<AutoListEntry[]>(() => opts.entries ?? [], [opts.entries]);
  const t = useT();
  const { subscribe, setState, getState } = useIoBroker();
  const [states, setStates] = useState<Record<string, ioBrokerState | null>>({});
  const [resolvedNames, setResolvedNames] = useState<Record<string, string>>({});
  const [syncing, setSyncing] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [lastChangedTs, setLastChangedTs] = useState(0);
  const syncMs = (opts.syncIntervalMin ?? 5) * 60_000;
  const layout = config.layout ?? 'default';

  const saveOpts = useCallback((patch: Partial<AutoListOptions>) => {
    onConfigChange({ ...config, options: { ...opts, ...patch } });
  }, [config, opts, onConfigChange]);

  const entryKey = entries.map(e => e.id).join(',');
  const prevKey = useRef('');
  useEffect(() => {
    if (entryKey === prevKey.current) return;
    prevKey.current = entryKey;
    if (entries.length === 0) return;
    entries.forEach(e => getState(e.id).then(s => setStates(prev => ({ ...prev, [e.id]: s }))));
    const unsubs = entries.map(e =>
      subscribe(e.id, s => {
        setStates(prev => ({ ...prev, [e.id]: s }));
        setLastChangedTs(prev => Math.max(prev, s.lc > 0 ? s.lc : s.ts));
      })
    );
    entries.filter(e => !e.label).forEach(async (e) => {
      const obj = await getObjectDirect(e.id);
      if (!obj?.common?.name) return;
      const name = resolveName(obj.common.name as string | Record<string, string>, e.id.split('.').pop() ?? e.id);
      setResolvedNames(prev => ({ ...prev, [e.id]: name }));
    });
    return () => unsubs.forEach(u => u());
  }, [entryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const runSync = useCallback(async () => {
    const hasFilter = opts.filterRoles || opts.filterIdPattern || opts.filterRooms || opts.filterFuncs;
    if (!hasFilter) return;
    setSyncing(true);
    try {
      const found = await discoverDatapoints(opts);
      const filtered = opts.filterRelevant ? found.filter(d => d.isRelevant) : found;
      const existingIds = new Set(entries.map(e => e.id));
      const newEntries = filtered.filter(d => !existingIds.has(d.id)).map(d => ({ id: d.id, label: undefined as string | undefined, rooms: d.rooms, unit: d.unit, role: d.role, writable: d.write }));
      if (newEntries.length > 0) {
        saveOpts({ entries: [...entries, ...newEntries] });
        saveAll();
        saveToIoBroker();
      }
    } finally {
      setSyncing(false);
    }
  }, [opts, entries, saveOpts]);

  useEffect(() => {
    const timer = setInterval(runSync, syncMs);
    return () => clearInterval(timer);
  }, [runSync, syncMs]);

  const removeEntry = (id: string) => saveOpts({ entries: entries.filter(e => e.id !== id) });

  const getLabel = (entry: AutoListEntry) =>
    applyDpNameFilter(entry.label || resolvedNames[entry.id] || entry.id.split('.').pop() || entry.id);

  // ── Value filter ───────────────────────────────────────────────────────────
  const valueFilter = opts.valueFilter ?? 'all';
  const filterActiveLabel   = opts.filterActiveLabel   || 'Nur aktive';
  const filterInactiveLabel = opts.filterInactiveLabel || 'Nur inaktive';
  type FilterMode = 'all' | 'active' | 'inactive';
  const filterLabels: Record<FilterMode, string> = { all: 'Alle', active: filterActiveLabel, inactive: filterInactiveLabel };

  /** true = value is considered "active" (on / > 0) */
  const isActive = (val: ioBrokerState['val']): boolean => {
    if (val === null || val === undefined) return false;
    if (typeof val === 'boolean') return val;
    if (typeof val === 'number')  return val > 0;
    if (typeof val === 'string')  return val !== '' && val !== '0' && val.toLowerCase() !== 'false';
    return false;
  };

  // In edit mode always show all entries so the user can manage them.
  const visibleEntries = useMemo(() => {
    if (editMode || valueFilter === 'all') return entries;
    return entries.filter(e => {
      const val = states[e.id]?.val ?? null;
      // If state not yet loaded, show the entry (avoid flicker on load)
      if (val === null) return true;
      return valueFilter === 'active' ? isActive(val) : !isActive(val);
    });
  }, [entries, states, valueFilter, editMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const hideTitle = !!(config.options as Record<string, unknown>)?.hideTitle;
  const showTitle = opts.showTitle !== false && !hideTitle;
  const showCount = opts.showCount !== false;
  const showLastChange = !!(config.options as Record<string, unknown>)?.showLastChange;
  const lastChangePos  = ((config.options as Record<string, unknown>)?.lastChangePosition as string) ?? 'left';

  const lcOverlay = showLastChange && lastChangedTs > 0 ? (() => {
    const text = formatLastChange(t as (k: string, v?: Record<string, string | number>) => string, lastChangedTs);
    const posStyle: React.CSSProperties = lastChangePos === 'center'
      ? { position: 'absolute', bottom: 6, left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap' }
      : lastChangePos === 'right'
        ? { position: 'absolute', bottom: 6, right: 8 }
        : { position: 'absolute', bottom: 6, left: 8 };
    return (
      <div className="pointer-events-none text-[8px] opacity-50 whitespace-nowrap"
        style={{ ...posStyle, color: 'var(--text-secondary)' }}>
        {text}
      </div>
    );
  })() : null;

  const iconName = (config.options as Record<string, unknown>)?.icon as string | undefined;
  const HeaderIcon = iconName ? getWidgetIcon(iconName, null!) : null;

  // ── Shared header ──────────────────────────────────────────────────────────
  const header = showTitle ? (
    <div className="shrink-0 px-3 py-1.5 flex items-center justify-between"
      style={{ borderBottom: '1px solid var(--widget-border)' }}>
      <span className="flex items-center gap-1.5 text-xs font-semibold truncate" style={{ color: 'var(--text-secondary)' }}>
        {HeaderIcon && <HeaderIcon size={12} className="shrink-0" />}
        {config.title || 'Dynamische Liste'}
        {showCount && entries.length > 0 && (
          <span className="ml-1 opacity-50">
            ({valueFilter !== 'all' ? `${visibleEntries.length}/` : ''}{entries.length})
          </span>
        )}
      </span>
      <div className="flex items-center gap-1 shrink-0">
        <div className="relative">
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
            {valueFilter !== 'all' && <span>{filterLabels[valueFilter as FilterMode]}</span>}
          </button>
          {showFilter && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowFilter(false)} />
              <div className="absolute right-0 top-6 rounded-lg shadow-xl z-20 overflow-hidden min-w-[110px]"
                style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}>
                {(Object.keys(filterLabels) as FilterMode[]).map(mode => (
                  <button key={mode}
                    onClick={() => { saveOpts({ valueFilter: mode }); setShowFilter(false); }}
                    className="w-full px-3 py-2 text-xs text-left hover:opacity-80"
                    style={{
                      background: valueFilter === mode ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent',
                      color: valueFilter === mode ? 'var(--accent)' : 'var(--text-primary)',
                    }}>
                    {filterLabels[mode]}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <button onClick={runSync} title="Jetzt synchronisieren"
          className="hover:opacity-70 transition-opacity p-0.5" style={{ color: 'var(--text-secondary)' }}>
          <RefreshCw size={11} className={syncing ? 'animate-spin' : ''} />
        </button>
      </div>
    </div>
  ) : null;

  const empty = (editMode ? entries.length === 0 : visibleEntries.length === 0) && (
    <div className="flex-1 flex items-center justify-center p-4">
      <p className="text-xs text-center" style={{ color: 'var(--text-secondary)' }}>
        {entries.length === 0
          ? `Noch keine Datenpunkte konfiguriert.${editMode ? ' Bearbeiten → Datenpunkte suchen.' : ''}`
          : valueFilter === 'active' ? `Alle Datenpunkte "${filterInactiveLabel.replace('Nur ', '')}".`
          : `Alle Datenpunkte "${filterActiveLabel.replace('Nur ', '')}".`}
      </p>
    </div>
  );

  if (layout === 'custom') return <CustomGridView config={config} value="" />;

  // ── KACHELN (card) ─────────────────────────────────────────────────────────
  if (layout === 'card') {
    return (
      <div className="relative flex flex-col h-full">
        {header}
        {empty}
        {visibleEntries.length > 0 && (
          <div className="aura-scroll flex-1 overflow-auto min-h-0 p-2"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: 6, alignContent: 'start' }}>
            {visibleEntries.map(entry => {
              const state = states[entry.id] ?? null;
              const label = getLabel(entry);
              return (
                <div key={entry.id}
                  className="rounded-xl p-2.5 flex flex-col gap-2 relative"
                  style={{ background: 'var(--app-bg)', border: '1px solid var(--widget-border)' }}>
                  {editMode && (
                    <button onClick={() => removeEntry(entry.id)}
                      className="absolute top-1 right-1 hover:opacity-70" style={{ color: 'var(--text-secondary)' }}>
                      <X size={10} />
                    </button>
                  )}
                  <span className="text-[10px] truncate leading-tight pr-2" style={{ color: 'var(--text-secondary)' }}>{label}</span>
                  <div className="flex items-center justify-center">
                    <CardEntryValue entry={entry} val={state?.val ?? null} writable={entry.writable !== false} setState={setState} />
                  </div>
                  {opts.showRoom && entry.rooms?.length ? (
                    <span className="text-[9px] truncate opacity-50" style={{ color: 'var(--text-secondary)' }}>
                      {entry.rooms.join(', ')}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
        {lcOverlay}
      </div>
    );
  }

  // ── KOMPAKT (compact) — 2-column dense list ────────────────────────────────
  if (layout === 'compact') {
    return (
      <div className="relative flex flex-col h-full">
        {header}
        {empty}
        {visibleEntries.length > 0 && (
          <div className="aura-scroll flex-1 overflow-auto min-h-0"
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', alignContent: 'start' }}>
            {visibleEntries.map((entry, i) => {
              const state = states[entry.id] ?? null;
              const label = getLabel(entry);
              const isRight = i % 2 === 1;
              return (
                <div key={entry.id}
                  className="flex items-center gap-1.5 px-2 py-1.5"
                  style={{
                    borderBottom: '1px solid var(--widget-border)',
                    borderLeft: isRight ? '1px solid var(--widget-border)' : undefined,
                  }}>
                  {editMode && (
                    <button onClick={() => removeEntry(entry.id)} className="shrink-0 hover:opacity-70"
                      style={{ color: 'var(--text-secondary)' }}>
                      <X size={10} />
                    </button>
                  )}
                  <span className="flex-1 text-[11px] truncate min-w-0" style={{ color: 'var(--text-primary)' }}>{label}</span>
                  <EntryValue entry={entry} val={state?.val ?? null} writable={entry.writable !== false} setState={setState} />
                </div>
              );
            })}
          </div>
        )}
        {lcOverlay}
      </div>
    );
  }

  // ── BADGES (minimal) — inline pill per entry ───────────────────────────────
  if (layout === 'minimal') {
    return (
      <div className="relative flex flex-col h-full">
        {header}
        {empty}
        {visibleEntries.length > 0 && (
          <div className="aura-scroll flex-1 overflow-auto min-h-0 p-2 flex flex-wrap gap-1.5 content-start">
            {visibleEntries.map(entry => {
              const state = states[entry.id] ?? null;
              const val = state?.val ?? null;
              const label = getLabel(entry);
              const writable = entry.writable !== false;
              const hasLabels = !!(entry.trueLabel || entry.falseLabel);
              const isBool = typeof val === 'boolean';
              const isBoolLike = isBool || (typeof val === 'number' && (val === 0 || val === 1));
              const on = val === true || val === 1;
              const roleDisplay = (isBoolLike && !hasLabels) ? getRoleDisplay(entry.role, val) : null;
              const valueStr = roleDisplay
                ? roleDisplay.label
                : isBoolLike && hasLabels
                  ? (on ? (entry.trueLabel || 'AN') : (entry.falseLabel || 'AUS'))
                  : val != null ? `${String(val)}${entry.unit ? '\u202f' + entry.unit : ''}` : '–';
              const pillColor = roleDisplay ? roleDisplay.color : (isBoolLike && on ? 'var(--accent)' : null);

              return (
                <button key={entry.id}
                  onClick={() => {
                    if (!writable || roleDisplay) return;
                    if (isBool) setState(entry.id, !on);
                    else if (isBoolLike) setState(entry.id, on ? 0 : 1);
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors hover:opacity-80"
                  style={{
                    background: pillColor ? `${pillColor}1a` : 'var(--app-bg)',
                    color: pillColor ?? 'var(--text-secondary)',
                    border: `1px solid ${pillColor ? `${pillColor}55` : 'var(--widget-border)'}`,
                    cursor: isBoolLike && writable && !roleDisplay ? 'pointer' : 'default',
                  }}>
                  <span className="opacity-70 truncate" style={{ maxWidth: 80 }}>{label}</span>
                  <span className="font-semibold tabular-nums" style={{ color: isBoolLike || roleDisplay ? 'inherit' : 'var(--text-primary)' }}>
                    {valueStr}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {lcOverlay}
      </div>
    );
  }

  // ── STANDARD (default) — full-width rows ───────────────────────────────────
  return (
    <div className="relative flex flex-col h-full">
      {header}
      {empty}
      {visibleEntries.length > 0 && (
        <div className="aura-scroll flex-1 overflow-auto min-h-0">
          {visibleEntries.map(entry => {
            const state = states[entry.id] ?? null;
            const label = getLabel(entry);
            const roomLabel = entry.rooms?.join(', ');
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
                  {opts.showRoom && (roomLabel || entry.id) && (
                    <div className="text-[10px] truncate" style={{ color: 'var(--text-secondary)' }}>
                      {roomLabel || entry.id}
                    </div>
                  )}
                  {opts.showId && (
                    <div className="text-[9px] truncate font-mono" style={{ color: 'var(--text-secondary)' }}>
                      {entry.id}
                    </div>
                  )}
                </div>
                <EntryValue entry={entry} val={state?.val ?? null} writable={entry.writable !== false} setState={setState} />
              </div>
            );
          })}
        </div>
      )}
      {lcOverlay}
    </div>
  );
}
