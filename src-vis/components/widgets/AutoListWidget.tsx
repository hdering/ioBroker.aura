import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { RefreshCw, Filter, List } from 'lucide-react';
import type { WidgetProps, ioBrokerState } from '../../types';
import { getObjectViewDirect, useIoBroker } from '../../hooks/useIoBroker';
import { ensureDatapointCache } from '../../hooks/useDatapointList';
import { saveAll, saveToIoBroker } from '../../store/persistManager';
import { isRelevantDp } from '../../utils/dpRelevance';
import { getRoleDisplay, getThresholdColor } from '../../utils/listEntryDisplay';
import { CustomGridView } from './CustomGridView';
import { applyDpNameFilter } from '../../utils/dpNameFilter';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { useT } from '../../i18n';
import { formatLastChange } from '../../utils/formatLastChange';
import { useGlobalSettingsStore } from '../../store/globalSettingsStore';
import { formatNum } from '../../utils/formatValue';
import { publishListCount, unpublishList } from '../../utils/publishWidgetState';

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
  /** Per-DP text color when on/true/>0. Overrides global activeColor. */
  activeColor?: string;
  /** Per-DP text color when off/false/0. Overrides global inactiveColor. */
  inactiveColor?: string;
  /** Per-DP entry background when on/true/>0. Overrides global activeBg. */
  activeBg?: string;
  /** Per-DP entry background when off/false/0. Overrides global inactiveBg. */
  inactiveBg?: string;
}

export interface AutoListOptions {
  entries: AutoListEntry[];
  filterRoles?: string;
  filterIdPattern?: string;
  filterRooms?: string;
  filterFuncs?: string;
  filterTypes?: string;
  excludeIdPatterns?: string;
  excludeIds?: string[];
  syncIntervalMin?: number;
  decimals?: number;
  showRoom?: boolean;
  showId?: boolean;
  filterRelevant?: boolean;
  /** 'all' = show everything (default), 'active' = only on/> 0, 'inactive' = only off/0 */
  valueFilter?: 'all' | 'active' | 'inactive';
  filterActiveLabel?: string;
  filterInactiveLabel?: string;
  showTitle?: boolean;
  showCount?: boolean;
  sortBy?: 'none' | 'label' | 'value';
  sortOrder?: 'asc' | 'desc';
  sortBy2?: 'none' | 'label' | 'value';
  sortOrder2?: 'asc' | 'desc';
  filterAdapters?: string;
  cardMinWidth?: number;
  /** Global default label for on/true/>0 state (fallback when entry has no trueLabel). */
  trueText?: string;
  /** Global default label for off/false/0 state (fallback when entry has no falseLabel). */
  falseText?: string;
  /** Global text color when on. Per-DP activeColor overrides. Default: green. */
  activeColor?: string;
  /** Global text color when off. Per-DP inactiveColor overrides. */
  inactiveColor?: string;
  /** Global entry background when on. Per-DP activeBg overrides. */
  activeBg?: string;
  /** Global entry background when off. Per-DP inactiveBg overrides. */
  inactiveBg?: string;
  /** Publish the filtered count to aura.0.lists.<widgetId>.count */
  publishCount?: boolean;
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

/**
 * Match id against a pattern that is either:
 *   - plain text  → case-insensitive substring match
 *   - /regex/flags → RegExp test (default flag: i)
 */
export function matchesIdPattern(id: string, pattern: string): boolean {
  const p = pattern.trim();
  if (p.startsWith('/')) {
    const lastSlash = p.lastIndexOf('/');
    const body  = p.slice(1, lastSlash > 0 ? lastSlash : undefined);
    const flags = lastSlash > 0 ? p.slice(lastSlash + 1) : 'i';
    try { return new RegExp(body, flags || 'i').test(id); }
    catch { return false; }
  }
  return id.toLowerCase().includes(p.toLowerCase());
}

function compareVals(a: ioBrokerState['val'], b: ioBrokerState['val']): number {
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  if (typeof a === 'boolean' && typeof b === 'boolean') return (a ? 1 : 0) - (b ? 1 : 0);
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

function isDimmerRole(role?: string) {
  const r = (role ?? '').toLowerCase();
  return r.includes('level') || r.includes('dimmer') || r.includes('brightness');
}

/** Returns true when the role explicitly describes a numeric value — these must
 *  never be rendered as a switch even if their live value happens to be 0 or 1. */
function isNumericRole(role?: string) {
  const r = (role ?? '').toLowerCase();
  return r.startsWith('value.') || r === 'value' || r.startsWith('level.') || r === 'level';
}

export function resolveName(name: string | Record<string, string> | undefined, fallback: string): string {
  if (!name) return fallback;
  if (typeof name === 'string') return name;
  return name.de ?? name.en ?? Object.values(name)[0] ?? fallback;
}

export async function loadFilterOptions(): Promise<{ roles: string[]; rooms: string[]; funcs: string[]; types: string[]; adapters: string[] }> {
  const [stateResult, enumResult] = await Promise.all([
    getObjectViewDirect('state'),
    getObjectViewDirect('enum', 'enum.', 'enum.\u9999'),
  ]);
  const rolesSet = new Set<string>();
  const typesSet = new Set<string>();
  const adaptersSet = new Set<string>();
  for (const { id, value: obj } of stateResult.rows) {
    if (obj?.common?.role) rolesSet.add(obj.common.role);
    if (obj?.common?.type) typesSet.add(obj.common.type);
    const parts = id.split(".");
    if (parts.length >= 2) adaptersSet.add(`${parts[0]}.${parts[1]}`);
  }
  const rooms: string[] = [];
  const funcs: string[] = [];
  for (const { value: obj } of enumResult.rows) {
    if (!obj) continue;
    const label = resolveName(obj.common?.name, obj._id.split('.').pop() ?? obj._id);
    if (obj._id.startsWith('enum.rooms.')) rooms.push(label);
    else if (obj._id.startsWith('enum.functions.')) funcs.push(label);
  }
  return { roles: Array.from(rolesSet).sort(), rooms: rooms.sort(), funcs: funcs.sort(), types: Array.from(typesSet).sort(), adapters: Array.from(adaptersSet).sort() };
}

export async function discoverDatapoints(
  opts: Pick<AutoListOptions, 'filterRoles' | 'filterIdPattern' | 'filterRooms' | 'filterFuncs' | 'filterTypes' | 'excludeIdPatterns' | 'excludeIds' | 'filterAdapters'>,
): Promise<DiscoveredDp[]> {
  const [stateResult, channelResult, deviceResult, enumResult] = await Promise.all([
    getObjectViewDirect('state'),
    getObjectViewDirect('channel'),
    getObjectViewDirect('device'),
    getObjectViewDirect('enum', 'enum.', 'enum.\u9999'),
  ]);

  // Build parent name map (channels override devices when both exist)
  const parentNames = new Map<string, string>();
  for (const { id, value: obj } of [...deviceResult.rows, ...channelResult.rows]) {
    if (!obj?.common?.name) continue;
    const n = resolveName(obj.common.name as string | Record<string, string>, '');
    if (n) parentNames.set(id, n);
  }

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
  const roleFilter    = (opts.filterRoles ?? '').split(',').map(s => s.trim()).filter(Boolean);
  const idPatterns    = (opts.filterIdPattern ?? '').split(',').map(s => s.trim()).filter(Boolean);
  const roomFilter    = (opts.filterRooms ?? '').split(',').map(s => s.trim()).filter(Boolean);
  const funcFilter    = (opts.filterFuncs ?? '').split(',').map(s => s.trim()).filter(Boolean);
  const typeFilter    = (opts.filterTypes ?? '').split(',').map(s => s.trim()).filter(Boolean);
  const adapterFilter = (opts.filterAdapters ?? '').split(',').map(s => s.trim()).filter(Boolean);
  const excludePats   = (opts.excludeIdPatterns ?? '').split(',').map(s => s.trim()).filter(Boolean);
  const excludeIdsSet = new Set<string>(opts.excludeIds ?? []);

  return stateResult.rows
    .filter(({ id, value: obj }) => {
      const role = obj.common.role ?? '';
      if (roleFilter.length > 0 && !roleFilter.includes(role)) return false;
      if (idPatterns.length > 0 && !idPatterns.some(p => matchesIdPattern(id, p))) return false;
      if (adapterFilter.length > 0) {
        const prefix = id.split('.').slice(0, 2).join('.');
        if (!adapterFilter.includes(prefix)) return false;
      }
      const type = (obj.common.type as string | undefined) ?? '';
      if (typeFilter.length > 0 && !typeFilter.includes(type)) return false;
      if (excludeIdsSet.has(id)) return false;
      if (excludePats.some(p => matchesIdPattern(id, p))) return false;

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
      const stateName = resolveName(obj.common.name as string | Record<string, string>, '');
      let parentName = '';
      for (let i = parts.length - 1; i >= 2; i--) {
        const pName = parentNames.get(parts.slice(0, i).join('.'));
        if (pName) { parentName = pName; break; }
      }
      let name: string;
      if (parentName && stateName && parentName !== stateName) {
        name = `${parentName} › ${stateName}`;
      } else if (stateName) {
        name = stateName;
      } else if (parentName) {
        name = `${parentName} › ${parts[parts.length - 1]}`;
      } else {
        name = parts[parts.length - 1] ?? id;
      }
      return {
        id,
        name,
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

function EntryValue({ entry, val, writable, setState, thresholds, decimals, activeColor, inactiveColor, trueText, falseText }: {
  entry: AutoListEntry;
  val: ioBrokerState['val'];
  writable: boolean;
  setState: (id: string, v: boolean | number | string) => void;
  thresholds?: [number, string][];
  decimals: number;
  activeColor: string;
  inactiveColor: string;
  trueText?: string;
  falseText?: string;
}) {
  const trueLabel  = entry.trueLabel ?? trueText;
  const falseLabel = entry.falseLabel ?? falseText;
  const hasLabels = !!(trueLabel || falseLabel);
  const isBool = typeof val === 'boolean';
  const isBoolLike = (isBool || (typeof val === 'number' && (val === 0 || val === 1))) && !isNumericRole(entry.role);
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
      const fill = on ? activeColor : inactiveColor;
      return (
        <button onClick={writable ? () => setState(entry.id, isBool ? !on : on ? 0 : 1) : undefined}
          className="shrink-0 text-xs px-2.5 py-0.5 rounded-full font-medium"
          style={{
            background: `color-mix(in srgb, ${fill} 18%, transparent)`,
            color: fill,
            cursor: writable ? 'pointer' : 'default',
          }}>
          {on ? (trueLabel || 'AN') : (falseLabel || 'AUS')}
        </button>
      );
    }
    if (!writable) {
      return (
        <span className="shrink-0 relative w-9 h-[18px] rounded-full pointer-events-none"
          style={{ background: on ? activeColor : 'var(--app-border)' }}>
          <span className="absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white"
            style={{ left: on ? 'calc(100% - 16px)' : '2px' }} />
        </span>
      );
    }
    return (
      <button onClick={() => setState(entry.id, isBool ? !on : on ? 0 : 1)}
        className="shrink-0 relative w-9 h-[18px] rounded-full transition-colors"
        style={{ background: on ? activeColor : 'var(--app-border)' }}>
        <span className="absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-all"
          style={{ left: on ? 'calc(100% - 16px)' : '2px' }} />
      </button>
    );
  }

  const thresholdColor = getThresholdColor(val, thresholds);

  if (typeof val === 'number' && isDimmerRole(entry.id)) {
    if (!writable) {
      return (
        <span className="shrink-0 text-xs font-medium tabular-nums"
          style={{ color: thresholdColor ?? 'var(--text-primary)' }}>
          {Math.round(val)}{entry.unit ?? '%'}
        </span>
      );
    }
    return (
      <div className="shrink-0 flex items-center gap-1.5">
        <input type="range" min={0} max={100} value={val}
          onChange={e => setState(entry.id, Number(e.target.value))}
          className="w-20 h-1" style={{ accentColor: 'var(--accent)' }} />
        <span className="text-[10px] w-8 text-right tabular-nums"
          style={{ color: thresholdColor ?? 'var(--text-secondary)' }}>
          {Math.round(val)}{entry.unit ?? '%'}
        </span>
      </div>
    );
  }

  const displayVal = typeof val === 'number' ? formatNum(val, decimals) : String(val);
  return (
    <span className="shrink-0 text-xs font-medium tabular-nums"
      style={{ color: thresholdColor ?? 'var(--text-primary)' }}>
      {val != null ? `${displayVal}${entry.unit ? ' ' + entry.unit : ''}` : '–'}
    </span>
  );
}

// ── Value display: card variant (larger) ──────────────────────────────────────

function CardEntryValue({ entry, val, writable, setState, thresholds, decimals, activeColor, inactiveColor, trueText, falseText }: {
  entry: AutoListEntry;
  val: ioBrokerState['val'];
  writable: boolean;
  setState: (id: string, v: boolean | number | string) => void;
  thresholds?: [number, string][];
  decimals: number;
  activeColor: string;
  inactiveColor: string;
  trueText?: string;
  falseText?: string;
}) {
  const trueLabel  = entry.trueLabel ?? trueText;
  const falseLabel = entry.falseLabel ?? falseText;
  const hasLabels = !!(trueLabel || falseLabel);
  const isBool = typeof val === 'boolean';
  const isBoolLike = (isBool || (typeof val === 'number' && (val === 0 || val === 1))) && !isNumericRole(entry.role);
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
    if (hasLabels) {
      const fill = on ? activeColor : inactiveColor;
      return (
        <button onClick={writable ? () => setState(entry.id, isBool ? !on : on ? 0 : 1) : undefined}
          className="w-full py-1.5 rounded-lg text-xs font-semibold"
          style={{
            background: `color-mix(in srgb, ${fill} 18%, transparent)`,
            color: fill,
            cursor: writable ? 'pointer' : 'default',
          }}>
          {on ? (trueLabel || 'AN') : (falseLabel || 'AUS')}
        </button>
      );
    }
    return (
      <button onClick={writable ? () => setState(entry.id, isBool ? !on : on ? 0 : 1) : undefined}
        className="w-full py-1.5 rounded-lg text-xs font-semibold"
        style={{
          background: on ? activeColor : 'var(--app-border)',
          color: on ? '#fff' : 'var(--text-secondary)',
          cursor: writable ? 'pointer' : 'default',
        }}>
        {on ? 'AN' : 'AUS'}
      </button>
    );
  }

  const thresholdColor = getThresholdColor(val, thresholds);

  if (typeof val === 'number' && isDimmerRole(entry.id)) {
    if (!writable) {
      return (
        <span className="text-xl font-bold tabular-nums"
          style={{ color: thresholdColor ?? 'var(--text-primary)' }}>
          {Math.round(val)}
          <span className="text-sm ml-0.5 font-normal" style={{ color: 'var(--text-secondary)' }}>{entry.unit ?? '%'}</span>
        </span>
      );
    }
    return (
      <div className="w-full flex flex-col items-center gap-1">
        <span className="text-xl font-bold tabular-nums"
          style={{ color: thresholdColor ?? 'var(--text-primary)' }}>
          {Math.round(val)}
          <span className="text-sm ml-0.5 font-normal" style={{ color: 'var(--text-secondary)' }}>{entry.unit ?? '%'}</span>
        </span>
        <input type="range" min={0} max={100} value={val}
          onChange={e => setState(entry.id, Number(e.target.value))}
          className="w-full h-1.5 rounded-full" style={{ accentColor: 'var(--accent)' }} />
      </div>
    );
  }

  const displayVal = typeof val === 'number' ? formatNum(val, decimals) : String(val);
  return (
    <span className="text-xl font-bold tabular-nums text-center leading-none"
      style={{ color: thresholdColor ?? 'var(--text-primary)' }}>
      {val != null ? displayVal : '–'}
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
  const { defaultDecimals } = useGlobalSettingsStore();
  const decimals = (opts.decimals as number) ?? defaultDecimals;
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
    ensureDatapointCache().then(cache => {
      const updates: Record<string, string> = {};
      for (const e of entries.filter(en => !en.label)) {
        const found = cache.find(c => c.id === e.id);
        if (found?.name) updates[e.id] = found.name;
      }
      if (Object.keys(updates).length > 0)
        setResolvedNames(prev => ({ ...prev, ...updates }));
    });
    return () => unsubs.forEach(u => u());
  }, [entryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const runSync = useCallback(async () => {
    const hasFilter = opts.filterRoles || opts.filterIdPattern || opts.filterRooms || opts.filterFuncs || opts.filterTypes || opts.filterAdapters;
    if (!hasFilter) return;
    setSyncing(true);
    try {
      const found = await discoverDatapoints(opts);
      const filtered = (opts.filterRelevant ?? true) ? found.filter(d => d.isRelevant) : found;
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
    let result = editMode || valueFilter === 'all'
      ? entries
      : entries.filter(e => {
          const val = states[e.id]?.val ?? null;
          if (val === null) return false;
          return valueFilter === 'active' ? isActive(val) : !isActive(val);
        });
    const sortBy = opts.sortBy ?? 'none';
    const sortOrder = opts.sortOrder ?? 'asc';
    const sortBy2 = opts.sortBy2 ?? 'none';
    const sortOrder2 = opts.sortOrder2 ?? 'asc';
    if (sortBy !== 'none') {
      const cmpFor = (key: 'label' | 'value', a: AutoListEntry, b: AutoListEntry) =>
        key === 'label'
          ? getLabel(a).localeCompare(getLabel(b), undefined, { numeric: true, sensitivity: 'base' })
          : compareVals(states[a.id]?.val ?? null, states[b.id]?.val ?? null);
      result = [...result].sort((a, b) => {
        const cmp1 = cmpFor(sortBy, a, b);
        if (cmp1 !== 0) return sortOrder === 'desc' ? -cmp1 : cmp1;
        if (sortBy2 !== 'none' && sortBy2 !== sortBy) {
          const cmp2 = cmpFor(sortBy2, a, b);
          return sortOrder2 === 'desc' ? -cmp2 : cmp2;
        }
        return 0;
      });
    }
    return result;
  }, [entries, states, valueFilter, editMode, opts.sortBy, opts.sortOrder, opts.sortBy2, opts.sortOrder2, resolvedNames]); // eslint-disable-line react-hooks/exhaustive-deps

  // Count published to backend = view-mode count (independent of editMode)
  const viewCount = useMemo(() => {
    if (valueFilter === 'all') return entries.length;
    return entries.filter(e => {
      const val = states[e.id]?.val ?? null;
      if (val === null) return false;
      return valueFilter === 'active' ? isActive(val) : !isActive(val);
    }).length;
  }, [entries, states, valueFilter]);

  useEffect(() => {
    if (!opts.publishCount) return;
    publishListCount(config.id, config.title || 'Dynamische Liste', viewCount);
  }, [opts.publishCount, viewCount, config.id, config.title]);

  useEffect(() => {
    if (opts.publishCount) return;
    unpublishList(config.id).catch(() => { /* ignore */ });
  }, [opts.publishCount, config.id]);

  const o = config.options ?? {};
  const showTitle  = opts.showTitle !== false;
  const showIcon   = o.showIcon   !== false;
  const iconSize   = (o.iconSize   as number) || 20;
  const titleAlign = (o.titleAlign as string) ?? 'left';
  const showCount  = opts.showCount !== false;
  const showLastChange = !!o.showLastChange;
  const lastChangePos  = (o.lastChangePosition as string) ?? 'left';

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

  const globalThresholds = o.colorThresholds as [number, string][] | undefined;
  const globalActiveColor   = opts.activeColor   || 'var(--accent-green)';
  const globalInactiveColor = opts.inactiveColor || 'var(--text-secondary)';
  const globalActiveBg   = opts.activeBg;
  const globalInactiveBg = opts.inactiveBg;
  const HeaderIcon = getWidgetIcon(o.icon as string | undefined, List);

  // ── Shared header ──────────────────────────────────────────────────────────
  const header = (showTitle || showIcon) ? (
    <div className="shrink-0 py-1.5 flex items-center justify-between"
      style={{ borderBottom: '1px solid var(--widget-border)' }}>
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        {showIcon && <HeaderIcon size={iconSize} className="shrink-0" style={{ color: 'var(--text-secondary)' }} />}
        {showTitle && (
          <p className="text-xs font-semibold truncate flex-1 min-w-0" style={{ color: 'var(--text-secondary)', textAlign: titleAlign as React.CSSProperties['textAlign'] }}>
            {config.title || 'Dynamische Liste'}
            {showCount && entries.length > 0 && (
              <span className="ml-1 opacity-50">
                ({valueFilter !== 'all' ? `${visibleEntries.length}/` : ''}{entries.length})
              </span>
            )}
          </p>
        )}
      </div>
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

  // ── ANZAHL (count) — zeigt nur die Anzahl der Einträge ────────────────────
  if (layout === 'count') {
    const count = valueFilter === 'all' || editMode ? entries.length : visibleEntries.length;
    return (
      <div className="relative flex flex-col items-center justify-center h-full gap-1">
        {showIcon && <HeaderIcon size={iconSize} style={{ color: 'var(--text-secondary)', opacity: 0.7 }} />}
        <span className="text-xl font-bold tabular-nums leading-none" style={{ color: 'var(--text-primary)' }}>
          {count}
        </span>
        {showTitle && config.title && (
          <span className="text-xs truncate max-w-full px-2 text-center" style={{ color: 'var(--text-secondary)', textAlign: titleAlign as React.CSSProperties['textAlign'] }}>
            {config.title}
          </span>
        )}
        {lcOverlay}
      </div>
    );
  }

  // ── KACHELN (card) ─────────────────────────────────────────────────────────
  if (layout === 'card') {
    return (
      <div className="relative flex flex-col h-full">
        {header}
        {empty}
        {visibleEntries.length > 0 && (
          <div className="aura-scroll flex-1 overflow-auto min-h-0 p-2"
            style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${opts.cardMinWidth ?? 90}px, 1fr))`, gap: 6, alignContent: 'start' }}>
            {visibleEntries.map(entry => {
              const state = states[entry.id] ?? null;
              const val = state?.val ?? null;
              const label = getLabel(entry);
              const eOn = isActive(val);
              const entryActiveColor   = entry.activeColor   || globalActiveColor;
              const entryInactiveColor = entry.inactiveColor || globalInactiveColor;
              const stateBg = (eOn ? (entry.activeBg || globalActiveBg) : (entry.inactiveBg || globalInactiveBg)) || 'var(--app-bg)';
              return (
                <div key={entry.id}
                  className="rounded-xl p-2.5 flex flex-col gap-2 relative"
                  style={{ background: stateBg, border: '1px solid var(--widget-border)' }}>
                  <span className="text-[10px] truncate leading-tight" style={{ color: 'var(--text-secondary)' }}>{label}</span>
                  <div className="flex items-center justify-center">
                    <CardEntryValue entry={entry} val={val} writable={entry.writable !== false} setState={setState} thresholds={globalThresholds} decimals={decimals} activeColor={entryActiveColor} inactiveColor={entryInactiveColor} trueText={opts.trueText} falseText={opts.falseText} />
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
              const val = state?.val ?? null;
              const label = getLabel(entry);
              const isRight = i % 2 === 1;
              const eOn = isActive(val);
              const entryActiveColor   = entry.activeColor   || globalActiveColor;
              const entryInactiveColor = entry.inactiveColor || globalInactiveColor;
              const stateBg = eOn ? (entry.activeBg || globalActiveBg) : (entry.inactiveBg || globalInactiveBg);
              return (
                <div key={entry.id}
                  className="flex items-center gap-1.5 px-2 py-1.5"
                  style={{
                    background: stateBg,
                    borderBottom: '1px solid var(--widget-border)',
                    borderLeft: isRight ? '1px solid var(--widget-border)' : undefined,
                  }}>
                  <span className="flex-1 text-[11px] truncate min-w-0" style={{ color: 'var(--text-primary)' }}>{label}</span>
                  <EntryValue entry={entry} val={val} writable={entry.writable !== false} setState={setState} thresholds={globalThresholds} decimals={decimals} activeColor={entryActiveColor} inactiveColor={entryInactiveColor} trueText={opts.trueText} falseText={opts.falseText} />
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
              const trueLabel  = entry.trueLabel ?? opts.trueText;
              const falseLabel = entry.falseLabel ?? opts.falseText;
              const hasLabels = !!(trueLabel || falseLabel);
              const isBool = typeof val === 'boolean';
              const isBoolLike = isBool || (typeof val === 'number' && (val === 0 || val === 1));
              const on = val === true || val === 1;
              const roleDisplay = (isBoolLike && !hasLabels) ? getRoleDisplay(entry.role, val) : null;
              const valueStr = roleDisplay
                ? roleDisplay.label
                : isBoolLike && hasLabels
                  ? (on ? (trueLabel || 'AN') : (falseLabel || 'AUS'))
                  : val != null ? `${String(val)}${entry.unit ? '\u202f' + entry.unit : ''}` : '–';
              const entryActiveColor   = entry.activeColor   || globalActiveColor;
              const entryInactiveColor = entry.inactiveColor || globalInactiveColor;
              const eOn = isActive(val);
              const stateBg = eOn ? (entry.activeBg || globalActiveBg) : (entry.inactiveBg || globalInactiveBg);
              const pillColor = roleDisplay ? roleDisplay.color : (isBoolLike && on ? entryActiveColor : (hasLabels ? entryInactiveColor : null));

              return (
                <button key={entry.id}
                  onClick={() => {
                    if (!writable || roleDisplay) return;
                    if (isBool) setState(entry.id, !on);
                    else if (isBoolLike) setState(entry.id, on ? 0 : 1);
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors hover:opacity-80"
                  style={{
                    background: stateBg ?? (pillColor ? `color-mix(in srgb, ${pillColor} 12%, transparent)` : 'var(--app-bg)'),
                    color: pillColor ?? 'var(--text-secondary)',
                    border: `1px solid ${stateBg ? 'transparent' : (pillColor ? `color-mix(in srgb, ${pillColor} 34%, transparent)` : 'var(--widget-border)')}`,
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
            const val = state?.val ?? null;
            const label = getLabel(entry);
            const roomLabel = entry.rooms?.join(', ');
            const eOn = isActive(val);
            const entryActiveColor   = entry.activeColor   || globalActiveColor;
            const entryInactiveColor = entry.inactiveColor || globalInactiveColor;
            const stateBg = eOn ? (entry.activeBg || globalActiveBg) : (entry.inactiveBg || globalInactiveBg);
            return (
              <div key={entry.id} className="flex items-center gap-2 px-3 py-2"
                style={{ background: stateBg, borderBottom: '1px solid var(--widget-border)' }}>
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
                <EntryValue entry={entry} val={val} writable={entry.writable !== false} setState={setState} thresholds={globalThresholds} decimals={decimals} activeColor={entryActiveColor} inactiveColor={entryInactiveColor} trueText={opts.trueText} falseText={opts.falseText} />
              </div>
            );
          })}
        </div>
      )}
      {lcOverlay}
    </div>
  );
}
