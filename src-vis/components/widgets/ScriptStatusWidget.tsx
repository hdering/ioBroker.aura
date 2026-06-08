import { useEffect, useMemo, useState } from 'react';
import { Code2, Play, Square, AlertTriangle, Search } from 'lucide-react';
import {
  getObjectViewDirect,
  subscribeStateDirect,
  getStateDirect,
  sendToDirect,
  invalidateObjectCache,
  useIoBroker,
} from '../../hooks/useIoBroker';
import type { WidgetProps, ioBrokerState, ioBrokerObject } from '../../types';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { NS } from '../../utils/namespace';

// ── Types ───────────────────────────────────────────────────────────────────

type FilterMode = 'all' | 'running' | 'stopped';

const FILTER_LABELS: Record<FilterMode, string> = {
  all:     'Alle',
  running: 'Läuft',
  stopped: 'Gestoppt',
};

interface ScriptInstance {
  /** Full id, e.g. "script.js.common.MyScript" */
  id:         string;
  /** Path under script.js., e.g. "common.MyScript" */
  shortId:    string;
  /** common.name resolved to a string */
  name:       string;
  /** Folder prefix without the leaf, e.g. "common" */
  group:      string;
  /** Leaf name, e.g. "MyScript" */
  leaf:       string;
  /** Initial enabled flag from common.enabled — updated live via state subscription. */
  enabled:    boolean;
  /** "Javascript/js" | "Javascript/ts" | "Blockly" | "Rules" | "TypeScript/ts" | … */
  engineType: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function resolveName(obj: ioBrokerObject, fallback: string): string {
  const n = obj.common?.name;
  if (typeof n === 'string') return n;
  if (n && typeof n === 'object') {
    const m = n as Record<string, string>;
    return m.de ?? m.en ?? Object.values(m)[0] ?? fallback;
  }
  return fallback;
}

function shortEngine(engineType: string): string {
  const e = engineType.toLowerCase();
  if (e.includes('blockly'))   return 'Blockly';
  if (e.includes('rules'))     return 'Rules';
  if (e.includes('typescript') || e.endsWith('/ts')) return 'TS';
  if (e.includes('javascript') || e.endsWith('/js')) return 'JS';
  return engineType || '?';
}

function engineColor(label: string): string {
  switch (label) {
    case 'JS':      return '#f7df1e';
    case 'TS':      return '#3178c6';
    case 'Blockly': return '#22c55e';
    case 'Rules':   return '#a855f7';
    default:        return '#94a3b8';
  }
}

// ── Single row ──────────────────────────────────────────────────────────────

function ScriptRow({
  script,
  enabled,
  allowStart,
  allowStop,
  showEngine,
  compact,
  onToggle,
}: {
  script:     ScriptInstance;
  enabled:    boolean;
  allowStart: boolean;
  allowStop:  boolean;
  showEngine: boolean;
  compact:    boolean;
  onToggle:   (script: ScriptInstance, next: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const statusColor = enabled ? '#22c55e' : '#ef4444';
  const statusLabel = enabled ? 'läuft' : 'gestoppt';
  const eng = shortEngine(script.engineType);
  const engColor = engineColor(eng);

  // Hide buttons completely when neither action is permitted.
  const canToggle = enabled ? allowStop : allowStart;

  const runToggle = async () => {
    if (busy) return;
    setBusy(true);
    try { await onToggle(script, !enabled); } finally { setTimeout(() => setBusy(false), 1200); }
  };

  return (
    <div
      className="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs"
      style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}
    >
      {/* Status dot */}
      <span
        className="shrink-0 inline-block rounded-full"
        style={{ width: 8, height: 8, background: statusColor, boxShadow: enabled ? `0 0 6px ${statusColor}` : 'none' }}
        title={statusLabel}
      />

      {/* Name + path */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-medium truncate" style={{ color: 'var(--text-primary)' }}>{script.name || script.leaf}</span>
          {showEngine && (
            <span
              className="shrink-0 text-[9px] font-semibold px-1 py-0.5 rounded"
              style={{ background: `${engColor}22`, color: engColor, border: `1px solid ${engColor}55` }}
            >
              {eng}
            </span>
          )}
        </div>
        {!compact && (
          <div className="truncate text-[10px]" style={{ color: 'var(--text-secondary)' }}>{script.shortId}</div>
        )}
      </div>

      {/* Status label */}
      <span className="shrink-0 text-[10px] font-medium" style={{ color: statusColor }}>{statusLabel}</span>

      {/* Start/Stop button */}
      {canToggle && (
        <button
          onClick={runToggle}
          disabled={busy}
          className="shrink-0 p-1 rounded transition-opacity"
          style={{
            color: enabled ? '#ef4444' : '#22c55e',
            opacity: busy ? 0.5 : 1,
            cursor: busy ? 'default' : 'pointer',
          }}
          title={enabled ? 'Skript stoppen' : 'Skript starten'}
        >
          {enabled
            ? <Square size={14} className={busy ? 'animate-pulse' : ''} fill="currentColor" />
            : <Play   size={14} className={busy ? 'animate-pulse' : ''} fill="currentColor" />}
        </button>
      )}
    </div>
  );
}

// ── Main widget ─────────────────────────────────────────────────────────────

export function ScriptStatusWidget({ config }: WidgetProps) {
  const o = config.options ?? {};
  const showTitle      = o.showTitle    !== false;
  const showIcon       = o.showIcon     !== false;
  const titleAlign     = (o.titleAlign as 'left' | 'center' | 'right') ?? 'left';
  const iconSize       = (o.iconSize as number) || 20;
  const showEngine     = o.showEngine !== false;
  const showSearch     = o.showSearch  !== false;
  const showFilter     = o.showFilter  !== false;
  const defaultFilter  = (o.filterMode as FilterMode) ?? 'all';
  const compact        = !!o.compact;
  const sortBy         = (o.sortBy as 'name' | 'status') ?? 'name';
  const defaultGroup   = ((o.groupFilter as string) ?? '').trim();
  const searchScope    = (o.searchScope as 'name' | 'path' | 'both') ?? 'both';
  const allowStart     = !!o.allowStart;
  const allowStop      = !!o.allowStop;

  const { connected } = useIoBroker();

  const [scripts,  setScripts]  = useState<ScriptInstance[]>([]);
  const [states,   setStates]   = useState<Record<string, ioBrokerState | null>>({});
  const [query,    setQuery]    = useState('');
  const [filter,   setFilter]   = useState<FilterMode>(defaultFilter);
  const [groupFilter, setGroupFilter] = useState<string>(defaultGroup);
  useEffect(() => { setFilter(defaultFilter); }, [defaultFilter]);
  useEffect(() => { setGroupFilter(defaultGroup); }, [defaultGroup]);
  // Always target the aura instance that serves this page (NS), not the first
  // aura.* instance found in ioBroker — relevant for multi-instance setups.
  const auraInstance = NS;
  const [actionError,  setActionError]  = useState<string | null>(null);

  const Icon = getWidgetIcon((o.icon as string) ?? 'Code2', Code2);

  // Load script list
  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    (async () => {
      const result = await getObjectViewDirect('script', 'script.js.', 'script.js.香');
      if (cancelled) return;
      const list: ScriptInstance[] = [];
      for (const row of result.rows) {
        const id = row.id;
        if (!id.startsWith('script.js.')) continue;
        if (row.value?.type !== 'script') continue;
        const shortId = id.slice('script.js.'.length);
        const lastDot = shortId.lastIndexOf('.');
        const group = lastDot >= 0 ? shortId.slice(0, lastDot) : '';
        const leaf  = lastDot >= 0 ? shortId.slice(lastDot + 1) : shortId;
        const c = row.value.common ?? {} as ioBrokerObject['common'];
        list.push({
          id,
          shortId,
          name:       resolveName(row.value, leaf),
          group,
          leaf,
          enabled:    c.enabled === true,
          engineType: (c as { engineType?: string }).engineType ?? '',
        });
      }
      list.sort((a, b) => a.shortId.localeCompare(b.shortId));
      setScripts(list);
    })();
    return () => { cancelled = true; };
  }, [connected]);

  // Subscribe to each script's own state (mirrors common.enabled).
  const idsKey = useMemo(() => scripts.map(s => s.id).join('|'), [scripts]);
  useEffect(() => {
    if (scripts.length === 0) return;
    const unsubs: Array<() => void> = [];
    for (const s of scripts) {
      void getStateDirect(s.id).then(st => setStates(p => ({ ...p, [s.id]: st })));
      unsubs.push(subscribeStateDirect(s.id, st => setStates(p => ({ ...p, [s.id]: st }))));
    }
    return () => unsubs.forEach(u => u());
  }, [idsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Resolve current running state per script (prefer live state, fall back to object snapshot).
  const isRunning = (s: ScriptInstance): boolean => {
    const v = states[s.id]?.val;
    if (typeof v === 'boolean') return v;
    return s.enabled;
  };

  // Action — go through aura backend so we have a permission gate.
  const handleResult = (label: string, result: unknown): boolean => {
    if (result && typeof result === 'object' && '__timeout' in (result as object)) {
      setActionError(`${label}: keine Antwort von ${auraInstance} (30 s)`);
      return false;
    }
    if (typeof result === 'string') {
      setActionError(`${label}: ${result === 'permissionError' ? 'Berechtigung verweigert' : result}`);
      return false;
    }
    const r = result as { ok?: boolean; error?: string } | null;
    if (!r?.ok) {
      setActionError(`${label}: ${r?.error ?? 'fehlgeschlagen'}`);
      return false;
    }
    return true;
  };

  const toggleScript = async (s: ScriptInstance, next: boolean) => {
    setActionError(null);
    const result = await sendToDirect(auraInstance, 'setScriptEnabled', { id: s.id, enabled: next });
    if (handleResult(`${next ? 'Start' : 'Stopp'} ${s.shortId}`, result)) {
      // Optimistic update — state subscription will confirm shortly after.
      setScripts(prev => prev.map(p => p.id === s.id ? { ...p, enabled: next } : p));
      // Bust the cached object so next read sees fresh common.enabled.
      invalidateObjectCache(s.id);
    }
  };

  // Unique group list (for the group dropdown)
  const groups = useMemo(() => {
    const set = new Set<string>();
    for (const s of scripts) if (s.group) set.add(s.group);
    return Array.from(set).sort();
  }, [scripts]);

  // Filter + sort
  const visible = useMemo(() => {
    const lc = query.trim().toLowerCase();
    let arr = scripts.filter(s => {
      const running = isRunning(s);
      if (filter === 'running' && !running) return false;
      if (filter === 'stopped' &&  running) return false;
      if (groupFilter && s.group !== groupFilter && !s.group.startsWith(`${groupFilter}.`)) return false;
      if (lc) {
        const inName = s.name.toLowerCase().includes(lc);
        const inPath = s.shortId.toLowerCase().includes(lc);
        const hit =
          searchScope === 'name' ? inName :
          searchScope === 'path' ? inPath :
          inName || inPath;
        if (!hit) return false;
      }
      return true;
    });
    if (sortBy === 'status') {
      arr = [...arr].sort((a, b) => {
        const ra = isRunning(a);
        const rb = isRunning(b);
        if (ra !== rb) return ra ? -1 : 1;
        return a.shortId.localeCompare(b.shortId);
      });
    }
    return arr;
  }, [scripts, states, query, filter, groupFilter, sortBy, searchScope]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => {
    let running = 0, stopped = 0;
    for (const s of scripts) {
      if (isRunning(s)) running++; else stopped++;
    }
    return { running, stopped, total: scripts.length };
  }, [scripts, states]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="aura-widget-row w-full h-full flex flex-col gap-2 overflow-hidden">
      {/* Header */}
      {(showTitle || showIcon) && (
        <div className="flex items-center gap-2 shrink-0">
          {showIcon && <Icon size={iconSize} style={{ color: 'var(--accent)' }} className="aura-widget-icon shrink-0" />}
          {showTitle && (
            <p
              className="aura-widget-title text-xs flex-1 min-w-0 truncate"
              style={{ color: 'var(--text-secondary)', textAlign: titleAlign as React.CSSProperties['textAlign'] }}
            >
              {config.title || 'Skript-Status'}
            </p>
          )}
        </div>
      )}

      {/* Summary */}
      <div className="flex items-center gap-2 text-[10px] shrink-0" style={{ color: 'var(--text-secondary)' }}>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full" style={{ background: '#22c55e' }} />{counts.running}</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full" style={{ background: '#ef4444' }} />{counts.stopped}</span>
        <span className="ml-auto opacity-70">{counts.total} Skript{counts.total === 1 ? '' : 'e'}</span>
      </div>

      {/* Filter pills */}
      {showFilter && (
        <div className="flex items-center gap-1 flex-wrap shrink-0">
          {(Object.keys(FILTER_LABELS) as FilterMode[]).map(f => {
            const active = filter === f;
            const count =
              f === 'all'     ? counts.total :
              f === 'running' ? counts.running :
              f === 'stopped' ? counts.stopped : 0;
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className="text-[10px] px-2 py-0.5 rounded-full transition-colors"
                style={{
                  background: active ? 'var(--accent)' : 'var(--app-bg)',
                  color:      active ? '#fff' : 'var(--text-secondary)',
                  border:     `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                }}
              >
                {FILTER_LABELS[f]} <span className="opacity-70">{count}</span>
              </button>
            );
          })}
          {groups.length > 1 && (
            <select
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
              className="text-[10px] px-2 py-0.5 rounded-full"
              style={{
                background: 'var(--app-bg)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--app-border)',
              }}
            >
              <option value="">Alle Ordner</option>
              {groups.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          )}
        </div>
      )}

      {/* Search */}
      {showSearch && scripts.length > 5 && (
        <div className="flex items-center gap-1 shrink-0 rounded-md px-2 py-1" style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}>
          <Search size={12} style={{ color: 'var(--text-secondary)' }} />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Filter…"
            className="flex-1 bg-transparent text-xs focus:outline-none"
            style={{ color: 'var(--text-primary)' }}
          />
        </div>
      )}


      {/* Error toast */}
      {actionError && (
        <div
          className="flex items-start gap-1.5 text-[10px] px-2 py-1 rounded shrink-0"
          style={{ background: '#ef444422', color: '#ef4444', border: '1px solid #ef444455' }}
        >
          <AlertTriangle size={12} className="shrink-0 mt-0.5" />
          <span className="flex-1 break-words">{actionError}</span>
          <button onClick={() => setActionError(null)} className="shrink-0 opacity-70 hover:opacity-100" title="Schließen">×</button>
        </div>
      )}

      {/* List */}
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1 pr-1">
        {visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[11px] gap-1" style={{ color: 'var(--text-secondary)' }}>
            {connected ? (
              scripts.length === 0 ? <>Keine Skripte gefunden</> : <><AlertTriangle size={14} />Keine Treffer</>
            ) : <>Nicht verbunden</>}
          </div>
        ) : visible.map(s => (
          <ScriptRow
            key={s.id}
            script={s}
            enabled={isRunning(s)}
            allowStart={allowStart}
            allowStop={allowStop}
            showEngine={showEngine}
            compact={compact}
            onToggle={toggleScript}
          />
        ))}
      </div>
    </div>
  );
}
