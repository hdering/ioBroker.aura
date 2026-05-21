import { useEffect, useMemo, useState } from 'react';
import {
  ServerCog, RotateCcw, Download, AlertTriangle, CircleDot, Search,
} from 'lucide-react';
import {
  getObjectViewDirect,
  subscribeStateDirect,
  getStateDirect,
  extendObjectDirect,
  sendToDirect,
  useIoBroker,
} from '../../hooks/useIoBroker';
import type { WidgetProps, ioBrokerState, ioBrokerObject } from '../../types';
import { getWidgetIcon } from '../../utils/widgetIconMap';

// ── Types ───────────────────────────────────────────────────────────────────

interface AdapterInstance {
  /** "adapter.0" (no leading "system.adapter.") */
  id:       string;
  adapter:  string;          // "hm-rpc"
  instance: string;          // "0"
  name:     string;          // common.name (or id)
  title:    string;          // common.title / common.titleLang
  host:     string;          // common.host
  enabled:  boolean;         // common.enabled
  version:  string;          // common.version
  icon?:    string;          // common.extIcon / common.icon
}

interface UpdateInfo {
  /** Version available in the latest repository */
  version:  string;
  /** Current installed version */
  installed?: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function resolveTitle(obj: ioBrokerObject, fallback: string): string {
  const t = (obj.common as { titleLang?: Record<string, string>; title?: string }).titleLang;
  if (t && typeof t === 'object') return t.de ?? t.en ?? Object.values(t)[0] ?? fallback;
  const tt = (obj.common as { title?: string }).title;
  if (tt && typeof tt === 'string') return tt;
  const n = obj.common?.name;
  if (typeof n === 'string') return n;
  if (n && typeof n === 'object') return (n as Record<string, string>).de ?? (n as Record<string, string>).en ?? Object.values(n)[0] ?? fallback;
  return fallback;
}

function parseUpdatesJson(raw: string | number | boolean | null | undefined): Record<string, UpdateInfo> {
  if (!raw || typeof raw !== 'string') return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, UpdateInfo> = {};
    for (const [adapter, info] of Object.entries(parsed)) {
      if (!info || typeof info !== 'object') continue;
      const i = info as { version?: string; availableVersion?: string; installedVersion?: string };
      const version = i.availableVersion ?? i.version;
      if (!version) continue;
      out[adapter] = { version, installed: i.installedVersion };
    }
    return out;
  } catch {
    return {};
  }
}

// ── Single row ──────────────────────────────────────────────────────────────

function InstanceRow({
  inst,
  alive,
  connected,
  updateInfo,
  allowRestart,
  allowUpdate,
  showVersion,
  compact,
  onRestart,
  onUpdate,
}: {
  inst:        AdapterInstance;
  alive:       boolean | null;
  connected:   boolean | null;
  updateInfo?: UpdateInfo;
  allowRestart: boolean;
  allowUpdate:  boolean;
  showVersion:  boolean;
  compact:      boolean;
  onRestart:    (inst: AdapterInstance) => void;
  onUpdate:     (inst: AdapterInstance) => void;
}) {
  const [busy, setBusy] = useState<'restart' | 'update' | null>(null);

  const isAlive   = alive   === true;
  const enabled   = inst.enabled;
  const hasUpdate = !!updateInfo;

  // Status pill text + color
  let statusLabel: string;
  let statusColor: string;
  if (!enabled)     { statusLabel = 'deaktiviert'; statusColor = '#64748b'; }
  else if (isAlive) { statusLabel = 'läuft';        statusColor = '#22c55e'; }
  else              { statusLabel = 'gestoppt';     statusColor = '#ef4444'; }

  const runRestart = async () => {
    if (busy) return;
    setBusy('restart');
    try { await onRestart(inst); } finally { setTimeout(() => setBusy(null), 1500); }
  };
  const runUpdate = async () => {
    if (busy) return;
    setBusy('update');
    try { await onUpdate(inst); } finally { setTimeout(() => setBusy(null), 2500); }
  };

  return (
    <div
      className="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs"
      style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}
    >
      {/* Status dot */}
      <span
        className="shrink-0 inline-block rounded-full"
        style={{ width: 8, height: 8, background: statusColor, boxShadow: isAlive ? `0 0 6px ${statusColor}` : 'none' }}
        title={statusLabel}
      />

      {/* Name + version */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-medium truncate" style={{ color: 'var(--text-primary)' }}>{inst.id}</span>
          {showVersion && inst.version && (
            <span className="shrink-0 text-[10px] font-mono opacity-60" style={{ color: 'var(--text-secondary)' }}>v{inst.version}</span>
          )}
          {hasUpdate && (
            <span
              className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded"
              style={{ background: '#f59e0b22', color: '#f59e0b', border: '1px solid #f59e0b55' }}
              title={updateInfo!.installed ? `${updateInfo!.installed} → ${updateInfo!.version}` : `Update verfügbar: ${updateInfo!.version}`}
            >
              ↑ {updateInfo!.version}
            </span>
          )}
        </div>
        {!compact && inst.title && inst.title !== inst.id && (
          <div className="truncate text-[10px]" style={{ color: 'var(--text-secondary)' }}>{inst.title}</div>
        )}
      </div>

      {/* Connected indicator (only when applicable & alive) */}
      {connected !== null && isAlive && (
        <CircleDot
          size={12}
          className="shrink-0"
          style={{ color: connected ? '#22c55e' : '#94a3b8', opacity: connected ? 1 : 0.6 }}
        />
      )}

      {/* Status label */}
      <span className="shrink-0 text-[10px] font-medium" style={{ color: statusColor }}>{statusLabel}</span>

      {/* Restart */}
      {allowRestart && (
        <button
          onClick={runRestart}
          disabled={!!busy || !enabled}
          className="shrink-0 p-1 rounded transition-opacity"
          style={{
            color: 'var(--text-secondary)',
            opacity: (!enabled || busy === 'restart') ? 0.4 : 1,
            cursor: (!enabled || busy) ? 'default' : 'pointer',
          }}
          title={enabled ? 'Neustart' : 'Adapter ist deaktiviert'}
        >
          <RotateCcw size={14} className={busy === 'restart' ? 'animate-spin' : ''} />
        </button>
      )}

      {/* Update */}
      {allowUpdate && hasUpdate && (
        <button
          onClick={runUpdate}
          disabled={!!busy}
          className="shrink-0 p-1 rounded transition-opacity"
          style={{ color: '#f59e0b', opacity: busy === 'update' ? 0.5 : 1, cursor: busy ? 'default' : 'pointer' }}
          title={`Update auf v${updateInfo!.version} installieren`}
        >
          <Download size={14} className={busy === 'update' ? 'animate-bounce' : ''} />
        </button>
      )}
    </div>
  );
}

// ── Main widget ─────────────────────────────────────────────────────────────

export function AdapterStatusWidget({ config }: WidgetProps) {
  const o = config.options ?? {};
  const showTitle    = o.showTitle    !== false;
  const showIcon     = o.showIcon     !== false;
  const titleAlign   = (o.titleAlign as 'left' | 'center' | 'right') ?? 'left';
  const iconSize     = (o.iconSize as number) || 20;
  const allowRestart = !!o.allowRestart;
  const allowUpdate  = !!o.allowUpdate;
  const showVersion  = o.showVersion !== false;
  const showSearch   = o.showSearch  !== false;
  const filter       = (o.filterMode as 'all' | 'enabled' | 'running' | 'stopped' | 'updates') ?? 'all';
  const compact      = !!o.compact;
  const sortBy       = (o.sortBy as 'name' | 'status') ?? 'name';

  const { connected } = useIoBroker();

  const [instances, setInstances]   = useState<AdapterInstance[]>([]);
  const [states,    setStates]      = useState<Record<string, ioBrokerState | null>>({});
  const [updates,   setUpdates]     = useState<Record<string, UpdateInfo>>({});
  const [query,     setQuery]       = useState('');
  const [adminInstance, setAdminInstance] = useState<string>('admin.0');

  const Icon = getWidgetIcon((o.icon as string) ?? 'ServerCog', ServerCog);

  // Load instance list + detect admin instance for update queries
  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    (async () => {
      const result = await getObjectViewDirect('instance', 'system.adapter.', 'system.adapter.香');
      if (cancelled) return;
      const list: AdapterInstance[] = [];
      let firstAdmin: string | null = null;
      for (const row of result.rows) {
        const id = row.id; // "system.adapter.<adapter>.<n>"
        if (!id.startsWith('system.adapter.')) continue;
        const rest = id.slice('system.adapter.'.length);
        const lastDot = rest.lastIndexOf('.');
        if (lastDot < 0) continue;
        const adapter  = rest.slice(0, lastDot);
        const instance = rest.slice(lastDot + 1);
        if (!/^\d+$/.test(instance)) continue;
        const c = row.value?.common ?? {} as ioBrokerObject['common'];
        list.push({
          id:       rest,
          adapter,
          instance,
          name:     typeof c.name === 'string' ? c.name : (Object.values(c.name ?? {}) as string[])[0] ?? rest,
          title:    resolveTitle(row.value, rest),
          host:     (c as { host?: string }).host ?? '',
          enabled:  c.enabled === true,
          version:  (c as { version?: string }).version ?? '',
          icon:     (c as { extIcon?: string; icon?: string }).extIcon ?? (c as { icon?: string }).icon,
        });
        if (!firstAdmin && adapter === 'admin') firstAdmin = rest;
      }
      list.sort((a, b) => a.id.localeCompare(b.id));
      setInstances(list);
      if (firstAdmin) setAdminInstance(firstAdmin);
    })();
    return () => { cancelled = true; };
  }, [connected]);

  // Subscribe to alive + connected states per instance
  const idsKey = useMemo(() => instances.map(i => i.id).join('|'), [instances]);
  useEffect(() => {
    if (instances.length === 0) return;
    const unsubs: Array<() => void> = [];
    for (const inst of instances) {
      const aliveId     = `system.adapter.${inst.id}.alive`;
      const connectedId = `system.adapter.${inst.id}.connected`;
      void getStateDirect(aliveId).then(s     => setStates(p => ({ ...p, [aliveId]:     s })));
      void getStateDirect(connectedId).then(s => setStates(p => ({ ...p, [connectedId]: s })));
      unsubs.push(subscribeStateDirect(aliveId,     s => setStates(p => ({ ...p, [aliveId]:     s }))));
      unsubs.push(subscribeStateDirect(connectedId, s => setStates(p => ({ ...p, [connectedId]: s }))));
    }
    return () => unsubs.forEach(u => u());
  }, [idsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Subscribe to admin.0.info.updatesJson (or first admin instance found)
  useEffect(() => {
    if (!connected) return;
    const id = `${adminInstance}.info.updatesJson`;
    void getStateDirect(id).then(s => setUpdates(parseUpdatesJson(s?.val as string | undefined)));
    const u = subscribeStateDirect(id, s => setUpdates(parseUpdatesJson(s?.val as string | undefined)));
    return () => u();
  }, [connected, adminInstance]);

  // Actions
  const restartInstance = async (inst: AdapterInstance) => {
    // Standard trick: extendObject triggers a publish; controller will restart adapter
    // if common.enabled is true. We toggle to guarantee a restart even when alive=true.
    await extendObjectDirect(`system.adapter.${inst.id}`, { common: { enabled: false } });
    await new Promise(r => setTimeout(r, 800));
    await extendObjectDirect(`system.adapter.${inst.id}`, { common: { enabled: true } });
  };

  const installUpdate = async (inst: AdapterInstance) => {
    // Try host command first (works on most ioBroker installs >= 4.x).
    // Fall back to admin upgrade message.
    const hostId = inst.host ? `system.host.${inst.host}` : '';
    if (hostId) {
      // Some hosts accept "upgradeAdapter" with the adapter name
      const result = await sendToDirect(hostId, 'upgradeAdapter', { name: inst.adapter });
      if (result !== null) return;
    }
    // Fallback: send to admin instance
    await sendToDirect(adminInstance, 'cmdExec', { data: `upgrade ${inst.adapter}` });
  };

  // Filter + sort
  const visible = useMemo(() => {
    const lc = query.trim().toLowerCase();
    let arr = instances.filter(inst => {
      const aliveSt = states[`system.adapter.${inst.id}.alive`]?.val === true;
      if (filter === 'enabled'  && !inst.enabled) return false;
      if (filter === 'running'  && !aliveSt)      return false;
      if (filter === 'stopped'  &&  aliveSt)      return false;
      if (filter === 'updates'  && !updates[inst.adapter]) return false;
      if (lc && !inst.id.toLowerCase().includes(lc) && !inst.title.toLowerCase().includes(lc)) return false;
      return true;
    });
    if (sortBy === 'status') {
      arr = [...arr].sort((a, b) => {
        const sa = !!states[`system.adapter.${a.id}.alive`]?.val;
        const sb = !!states[`system.adapter.${b.id}.alive`]?.val;
        if (sa !== sb) return sa ? -1 : 1;
        if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
        return a.id.localeCompare(b.id);
      });
    }
    return arr;
  }, [instances, states, updates, query, filter, sortBy]);

  const counts = useMemo(() => {
    let running = 0, stopped = 0, disabled = 0, hasUpdate = 0;
    for (const inst of instances) {
      if (!inst.enabled) { disabled++; continue; }
      if (states[`system.adapter.${inst.id}.alive`]?.val === true) running++;
      else                                                          stopped++;
      if (updates[inst.adapter]) hasUpdate++;
    }
    return { running, stopped, disabled, hasUpdate, total: instances.length };
  }, [instances, states, updates]);

  return (
    <div className="w-full h-full flex flex-col gap-2 overflow-hidden">
      {/* Header */}
      {(showTitle || showIcon) && (
        <div className="flex items-center gap-2 shrink-0">
          {showIcon && <Icon size={iconSize} style={{ color: 'var(--accent)' }} className="shrink-0" />}
          {showTitle && (
            <p
              className="text-xs flex-1 min-w-0 truncate"
              style={{ color: 'var(--text-secondary)', textAlign: titleAlign as React.CSSProperties['textAlign'] }}
            >
              {config.title || 'Adapter-Status'}
            </p>
          )}
        </div>
      )}

      {/* Summary */}
      <div className="flex items-center gap-2 text-[10px] shrink-0" style={{ color: 'var(--text-secondary)' }}>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full" style={{ background: '#22c55e' }} />{counts.running}</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full" style={{ background: '#ef4444' }} />{counts.stopped}</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full" style={{ background: '#64748b' }} />{counts.disabled}</span>
        {counts.hasUpdate > 0 && (
          <span className="flex items-center gap-1 ml-auto" style={{ color: '#f59e0b' }}>
            <Download size={10} />{counts.hasUpdate} Update{counts.hasUpdate === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {/* Search */}
      {showSearch && instances.length > 5 && (
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

      {/* List */}
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1 pr-1">
        {visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[11px] gap-1" style={{ color: 'var(--text-secondary)' }}>
            {connected ? (
              instances.length === 0 ? <>Lade Instanzen…</> : <><AlertTriangle size={14} />Keine Treffer</>
            ) : <>Nicht verbunden</>}
          </div>
        ) : visible.map(inst => (
          <InstanceRow
            key={inst.id}
            inst={inst}
            alive={(states[`system.adapter.${inst.id}.alive`]?.val as boolean | null) ?? null}
            connected={(states[`system.adapter.${inst.id}.connected`]?.val as boolean | null) ?? null}
            updateInfo={updates[inst.adapter]}
            allowRestart={allowRestart}
            allowUpdate={allowUpdate}
            showVersion={showVersion}
            compact={compact}
            onRestart={restartInstance}
            onUpdate={installUpdate}
          />
        ))}
      </div>
    </div>
  );
}
