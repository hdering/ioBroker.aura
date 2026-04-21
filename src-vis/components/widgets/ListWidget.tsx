import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Filter } from 'lucide-react';
import { useIoBroker, getObjectViewDirect } from '../../hooks/useIoBroker';
import { ensureDatapointCache } from '../../hooks/useDatapointList';
import { applyDpNameFilter } from '../../utils/dpNameFilter';
import type { WidgetProps, ioBrokerState } from '../../types';
import { resolveName } from './AutoListWidget';
import { getRoleDisplay } from '../../utils/listEntryDisplay';
import { CustomGridView } from './CustomGridView';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { useT } from '../../i18n';
import { formatLastChange } from '../../utils/formatLastChange';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StaticListEntry {
  id: string;
  label?: string;
  unit?: string;
  role?: string;
  trueLabel?: string;
  falseLabel?: string;
  writable?: boolean; // false = read-only; undefined/true = writable
  icon?: string;
}

export interface StaticListOptions {
  entries: StaticListEntry[];
  /** 'all' = show everything (default), 'active' = only on/> 0, 'inactive' = only off/0 */
  valueFilter?: 'all' | 'active' | 'inactive';
  filterActiveLabel?: string;
  filterInactiveLabel?: string;
  showId?: boolean;
  showRoom?: boolean;
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
const DEFAULT_filterLabels: Record<FilterMode, string> = {
  all: 'Alle',
  active: 'Nur aktive',
  inactive: 'Nur inaktive',
};

// ── Value cell ─────────────────────────────────────────────────────────────────

function EntryValue({ entry, val, writable, setState }: {
  entry: StaticListEntry;
  val: ioBrokerState['val'];
  writable: boolean;
  setState: (id: string, v: boolean | number | string) => void;
}) {
  const hasLabels = !!(entry.trueLabel || entry.falseLabel);
  const isBool    = typeof val === 'boolean';
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
  const t = useT();
  const { subscribe, setState, getState } = useIoBroker();
  const [states, setStates] = useState<Record<string, ioBrokerState | null>>({});
  const [resolvedNames, setResolvedNames] = useState<Record<string, string>>({});
  const [resolvedRooms, setResolvedRooms] = useState<Record<string, string[]>>({});
  const [showFilter, setShowFilter] = useState(false);
  const [lastChangedTs, setLastChangedTs] = useState(0);

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

  // Resolve rooms for showRoom display
  useEffect(() => {
    if (!opts.showRoom || entries.length === 0) return;
    getObjectViewDirect('enum', 'enum.rooms.', 'enum.rooms.\u9999').then(result => {
      const memberRooms = new Map<string, string[]>();
      for (const { value: obj } of result.rows) {
        if (!obj?.common?.members?.length) continue;
        const label = resolveName(obj.common.name as string | Record<string, string>, obj._id.split('.').pop() ?? obj._id);
        for (const memberId of (obj.common.members as string[])) {
          if (!memberRooms.has(memberId)) memberRooms.set(memberId, []);
          memberRooms.get(memberId)!.push(label);
        }
      }
      const map: Record<string, string[]> = {};
      for (const e of entries) {
        const parts = e.id.split('.');
        const roomsSet = new Set<string>();
        for (let i = parts.length; i >= 2; i--) {
          memberRooms.get(parts.slice(0, i).join('.'))?.forEach(r => roomsSet.add(r));
        }
        if (roomsSet.size > 0) map[e.id] = [...roomsSet];
      }
      setResolvedRooms(map);
    });
  }, [opts.showRoom, entryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const getLabel = (entry: StaticListEntry) =>
    applyDpNameFilter(entry.label || resolvedNames[entry.id] || entry.id.split('.').pop() || entry.id);

  // Value filter (same logic as AutoListWidget)
  const valueFilter = (opts.valueFilter ?? 'all') as FilterMode;
  const filterLabels: Record<FilterMode, string> = {
    all: 'Alle',
    active:   opts.filterActiveLabel   || DEFAULT_filterLabels.active,
    inactive: opts.filterInactiveLabel || DEFAULT_filterLabels.inactive,
  };

  const visibleEntries = useMemo(() => {
    if (editMode || valueFilter === 'all') return entries;
    return entries.filter(e => {
      const val = states[e.id]?.val ?? null;
      if (val === null) return false;
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

  const layout = config.layout ?? 'default';
  if (layout === 'custom') return <CustomGridView config={config} value="" />;

  const iconName = (config.options as Record<string, unknown>)?.icon as string | undefined;
  const HeaderIcon = iconName ? getWidgetIcon(iconName, null!) : null;

  // ── Shared header ──────────────────────────────────────────────────────────
  const header = showTitle ? (
    <div className="shrink-0 flex items-center justify-between px-3 py-1.5"
      style={{ borderBottom: '1px solid var(--widget-border)' }}>
      <span className="flex items-center gap-1.5 text-xs font-semibold truncate" style={{ color: 'var(--text-secondary)' }}>
        {HeaderIcon && <HeaderIcon size={12} className="shrink-0" />}
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
          {valueFilter !== 'all' && <span>{filterLabels[valueFilter]}</span>}
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
    </div>
  ) : null;

  const empty = (editMode ? entries.length === 0 : visibleEntries.length === 0) && (
    <div className="flex-1 flex items-center justify-center p-4">
      <p className="text-xs text-center" style={{ color: 'var(--text-secondary)' }}>
        {entries.length === 0
          ? `Noch keine Datenpunkte.${editMode ? ' Bearbeiten → Datenpunkt hinzufügen.' : ''}`
          : valueFilter === 'active' ? 'Alle Datenpunkte inaktiv.'
          : 'Alle Datenpunkte aktiv.'}
      </p>
    </div>
  );

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
              const val = states[entry.id]?.val ?? null;
              const label = getLabel(entry);
              const EntryIcon = entry.icon ? getWidgetIcon(entry.icon, null!) : null;
              return (
                <div key={entry.id}
                  className="rounded-xl p-2.5 flex flex-col gap-2 relative"
                  style={{ background: 'var(--app-bg)', border: '1px solid var(--widget-border)' }}>
                  <span className="flex items-center gap-1 text-[10px] truncate leading-tight" style={{ color: 'var(--text-secondary)' }}>
                    {EntryIcon && <EntryIcon size={11} className="shrink-0" />}
                    {label}
                  </span>
                  <div className="flex items-center justify-center">
                    <EntryValue entry={entry} val={val} writable={entry.writable !== false} setState={setState} />
                  </div>
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
              const val = states[entry.id]?.val ?? null;
              const label = getLabel(entry);
              const isRight = i % 2 === 1;
              const EntryIcon = entry.icon ? getWidgetIcon(entry.icon, null!) : null;
              return (
                <div key={entry.id}
                  className="flex items-center gap-1.5 px-2 py-1.5"
                  style={{
                    borderBottom: '1px solid var(--widget-border)',
                    borderLeft: isRight ? '1px solid var(--widget-border)' : undefined,
                  }}>
                  {EntryIcon && <EntryIcon size={11} className="shrink-0" style={{ color: 'var(--text-secondary)' }} />}
                  <span className="flex-1 text-[11px] truncate min-w-0" style={{ color: 'var(--text-primary)' }}>{label}</span>
                  <EntryValue entry={entry} val={val} writable={entry.writable !== false} setState={setState} />
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
              const val = states[entry.id]?.val ?? null;
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
              const EntryIcon = entry.icon ? getWidgetIcon(entry.icon, null!) : null;

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
                  {EntryIcon && <EntryIcon size={11} className="shrink-0 opacity-70" />}
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
        <div className="aura-scroll flex-1 overflow-y-auto min-h-0">
          {visibleEntries.map(entry => {
            const val   = states[entry.id]?.val ?? null;
            const label = getLabel(entry);
            const EntryIcon = entry.icon ? getWidgetIcon(entry.icon, null!) : null;

            return (
              <div key={entry.id}
                className="flex items-center gap-2 px-3 py-2"
                style={{ borderBottom: '1px solid var(--widget-border)' }}>
                {EntryIcon && <EntryIcon size={13} className="shrink-0" style={{ color: 'var(--text-secondary)' }} />}
                <div className="flex-1 min-w-0">
                  <div className="text-xs truncate" style={{ color: 'var(--text-primary)' }}>{label}</div>
                  {opts.showRoom && (resolvedRooms[entry.id]?.join(', ') || null) && (
                    <div className="text-[10px] truncate" style={{ color: 'var(--text-secondary)' }}>
                      {resolvedRooms[entry.id].join(', ')}
                    </div>
                  )}
                  {opts.showId && (
                    <div className="text-[9px] truncate font-mono" style={{ color: 'var(--text-secondary)' }}>
                      {entry.id}
                    </div>
                  )}
                </div>
                <EntryValue entry={entry} val={val} writable={entry.writable !== false} setState={setState} />
              </div>
            );
          })}
        </div>
      )}
      {lcOverlay}
    </div>
  );
}
