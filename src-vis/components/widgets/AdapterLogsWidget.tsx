import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollText, Pause, Play, Trash2, ArrowDownToLine, Search } from 'lucide-react';
import {
  getObjectViewDirect,
  subscribeStateDirect,
  sendToDirect,
  useIoBroker,
  type LogEntry,
} from '../../hooks/useIoBroker';
import type { WidgetProps } from '../../types';
import { getWidgetIcon } from '../../utils/widgetIconMap';

// ── Types ───────────────────────────────────────────────────────────────────

type Severity = 'debug' | 'info' | 'warn' | 'error';
const SEVERITY_ORDER: Severity[] = ['debug', 'info', 'warn', 'error'];

const SEVERITY_LABEL: Record<Severity, string> = {
  debug: 'Debug',
  info:  'Info',
  warn:  'Warn',
  error: 'Error',
};

const SEVERITY_COLOR: Record<Severity, string> = {
  debug: '#94a3b8',
  info:  '#3b82f6',
  warn:  '#f59e0b',
  error: '#ef4444',
};

const DEFAULT_BUFFER  = 500;
const DEFAULT_VISIBLE = 200;

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Extract adapter name from `from` (e.g. `shelly.0` → `shelly`, `host.iobroker` → `host`). */
function adapterFromSource(from: string): string {
  if (!from) return '';
  const dot = from.indexOf('.');
  return dot > 0 ? from.slice(0, dot) : from;
}

function formatTime(ts: number): string {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString('de-DE', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
  } catch {
    return '';
  }
}

function normalizeSeverity(s: LogEntry['severity']): Severity {
  if (s === 'silly') return 'debug';
  if (s === 'debug' || s === 'info' || s === 'warn' || s === 'error') return s;
  return 'info';
}

// ── Main widget ─────────────────────────────────────────────────────────────

export function AdapterLogsWidget({ config }: WidgetProps) {
  const o = config.options ?? {};
  const showTitle     = o.showTitle  !== false;
  const showIcon      = o.showIcon   !== false;
  const titleAlign    = (o.titleAlign as 'left' | 'center' | 'right') ?? 'left';
  const iconSize      = (o.iconSize as number) || 20;
  const showSearch    = o.showSearch !== false;
  const showFilter    = o.showFilter !== false;
  const showControls  = o.showControls !== false;
  const compact       = !!o.compact;
  const bufferSize    = Math.max(50, Math.min(5000, (o.bufferSize as number) || DEFAULT_BUFFER));
  const visibleLimit  = Math.max(20, Math.min(bufferSize, (o.visibleLimit as number) || DEFAULT_VISIBLE));
  const defaultLevels = (() => {
    const raw = o.levels as Severity[] | undefined;
    if (Array.isArray(raw) && raw.length > 0) return new Set(raw.filter((s): s is Severity => SEVERITY_ORDER.includes(s)));
    return new Set<Severity>(['info', 'warn', 'error']);
  })();
  const defaultAdapter = ((o.adapterFilter as string) ?? '').trim();

  const { connected } = useIoBroker();

  const [levels,  setLevels]  = useState<Set<Severity>>(defaultLevels);
  const [adapter, setAdapter] = useState<string>(defaultAdapter);
  const [query,   setQuery]   = useState('');
  const [paused,  setPaused]  = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  useEffect(() => { setAdapter(defaultAdapter); }, [defaultAdapter]);

  // Live ring buffer of recent entries. Kept outside React state so paused mode
  // can still collect without forcing re-renders.
  const bufferRef = useRef<LogEntry[]>([]);
  const seenSeqRef = useRef(0);
  const [tick, setTick] = useState(0);
  const pausedRef = useRef(paused);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  const Icon = getWidgetIcon((o.icon as string) ?? 'ScrollText', ScrollText);

  // Detect aura instance + seed initial buffer + subscribe to live updates
  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    let unsub: (() => void) | null = null;
    (async () => {
      const result = await getObjectViewDirect('instance', 'system.adapter.aura.', 'system.adapter.aura.香');
      if (cancelled) return;
      const row = result.rows[0];
      if (!row) return;
      const auraInstance = row.id.slice('system.adapter.'.length);

      // Seed buffer from backend snapshot
      const seed = await sendToDirect<{
        ok?: boolean; entries?: Array<LogEntry & { seq: number }>; latestSeq?: number;
      }>(auraInstance, 'getRecentLogs', {});
      if (cancelled) return;
      if (seed && typeof seed === 'object' && 'entries' in seed && Array.isArray(seed.entries)) {
        const buf = bufferRef.current;
        for (const e of seed.entries) buf.push(e);
        if (buf.length > bufferSize) buf.splice(0, buf.length - bufferSize);
        seenSeqRef.current = seed.latestSeq ?? 0;
        if (!pausedRef.current) setTick(t => t + 1);
      }

      // Live updates via the state aura.<inst>.logs.latest (JSON-encoded entry)
      const stateId = `${auraInstance}.logs.latest`;
      unsub = subscribeStateDirect(stateId, (st) => {
        const raw = st?.val;
        if (typeof raw !== 'string' || !raw) return;
        let parsed: LogEntry & { seq?: number };
        try { parsed = JSON.parse(raw); } catch { return; }
        if (parsed.seq && parsed.seq <= seenSeqRef.current) return; // dedupe
        if (parsed.seq) seenSeqRef.current = parsed.seq;
        const buf = bufferRef.current;
        buf.push(parsed);
        if (buf.length > bufferSize) buf.splice(0, buf.length - bufferSize);
        if (!pausedRef.current) setTick(t => t + 1);
      });
    })();
    return () => { cancelled = true; if (unsub) unsub(); };
  }, [connected, bufferSize]);

  // Auto-scroll handling
  const listRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!autoScroll || paused) return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [tick, autoScroll, paused]);

  // Adapter list — names seen in the current buffer (sorted).
  const adapters = useMemo(() => {
    const set = new Set<string>();
    for (const e of bufferRef.current) {
      const a = adapterFromSource(e.from);
      if (a) set.add(a);
    }
    return Array.from(set).sort();
  }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filter + slice
  const visible = useMemo(() => {
    const lc = query.trim().toLowerCase();
    const out: LogEntry[] = [];
    const buf = bufferRef.current;
    for (let i = buf.length - 1; i >= 0 && out.length < visibleLimit; i--) {
      const e = buf[i];
      const sev = normalizeSeverity(e.severity);
      if (!levels.has(sev)) continue;
      if (adapter && adapterFromSource(e.from) !== adapter) continue;
      if (lc && !e.message.toLowerCase().includes(lc) && !e.from.toLowerCase().includes(lc)) continue;
      out.push(e);
    }
    return out.reverse();
  }, [tick, levels, adapter, query, visibleLimit]); // eslint-disable-line react-hooks/exhaustive-deps

  // Counts (over whole buffer)
  const counts = useMemo(() => {
    const c: Record<Severity, number> = { debug: 0, info: 0, warn: 0, error: 0 };
    for (const e of bufferRef.current) c[normalizeSeverity(e.severity)]++;
    return c;
  }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleLevel = (s: Severity) => {
    setLevels(prev => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
  };

  const clearBuffer = () => {
    bufferRef.current = [];
    setTick(t => t + 1);
  };

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
              {config.title || 'Adapter-Logs'}
            </p>
          )}
          {showControls && (
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => setAutoScroll(v => !v)}
                className="p-1 rounded transition-opacity"
                style={{ color: autoScroll ? 'var(--accent)' : 'var(--text-secondary)', opacity: autoScroll ? 1 : 0.6 }}
                title={autoScroll ? 'Auto-Scroll an' : 'Auto-Scroll aus'}
              >
                <ArrowDownToLine size={14} />
              </button>
              <button
                onClick={() => setPaused(p => !p)}
                className="p-1 rounded transition-opacity"
                style={{ color: paused ? '#f59e0b' : 'var(--text-secondary)' }}
                title={paused ? 'Anzeige fortsetzen' : 'Anzeige pausieren'}
              >
                {paused ? <Play size={14} /> : <Pause size={14} />}
              </button>
              <button
                onClick={clearBuffer}
                className="p-1 rounded transition-opacity"
                style={{ color: 'var(--text-secondary)' }}
                title="Puffer leeren"
              >
                <Trash2 size={14} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Filter pills */}
      {showFilter && (
        <div className="flex items-center gap-1 flex-wrap shrink-0">
          {SEVERITY_ORDER.map(s => {
            const active = levels.has(s);
            const color = SEVERITY_COLOR[s];
            return (
              <button
                key={s}
                onClick={() => toggleLevel(s)}
                className="text-[10px] px-2 py-0.5 rounded-full transition-colors"
                style={{
                  background: active ? color : 'var(--app-bg)',
                  color:      active ? '#fff' : 'var(--text-secondary)',
                  border:     `1px solid ${active ? color : 'var(--app-border)'}`,
                }}
                title={`${SEVERITY_LABEL[s]} ein-/ausblenden`}
              >
                {SEVERITY_LABEL[s]} <span className="opacity-80">{counts[s]}</span>
              </button>
            );
          })}
          {adapters.length > 0 && (
            <select
              value={adapter}
              onChange={(e) => setAdapter(e.target.value)}
              className="text-[10px] px-2 py-0.5 rounded-full"
              style={{
                background: 'var(--app-bg)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--app-border)',
              }}
              title="Adapter filtern"
            >
              <option value="">Alle Adapter</option>
              {adapters.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          )}
        </div>
      )}

      {/* Search */}
      {showSearch && (
        <div className="flex items-center gap-1 shrink-0 rounded-md px-2 py-1" style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}>
          <Search size={12} style={{ color: 'var(--text-secondary)' }} />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Freitext-Filter…"
            className="flex-1 bg-transparent text-xs focus:outline-none"
            style={{ color: 'var(--text-primary)' }}
          />
        </div>
      )}

      {/* Status bar */}
      <div className="flex items-center gap-2 text-[10px] shrink-0" style={{ color: 'var(--text-secondary)' }}>
        <span>{visible.length}/{bufferRef.current.length} Zeilen</span>
        {paused && <span style={{ color: '#f59e0b' }}>• pausiert</span>}
        {!connected && <span style={{ color: '#ef4444' }}>• getrennt</span>}
      </div>

      {/* Log list */}
      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto font-mono text-[10px] leading-snug pr-1">
        {visible.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            {connected ? 'Warte auf Log-Einträge…' : 'Nicht verbunden'}
          </div>
        ) : visible.map((e, i) => {
          const sev = normalizeSeverity(e.severity);
          const color = SEVERITY_COLOR[sev];
          return (
            <div
              key={`${e.ts}-${i}`}
              className="px-1.5 py-0.5 rounded"
              style={{
                background: i % 2 === 0 ? 'transparent' : 'var(--app-bg)',
                borderLeft: `2px solid ${color}`,
              }}
            >
              <span className="opacity-60" style={{ color: 'var(--text-secondary)' }}>{formatTime(e.ts)}</span>
              {' '}
              <span style={{ color, fontWeight: 600 }}>{SEVERITY_LABEL[sev].toLowerCase()}</span>
              {' '}
              <span style={{ color: 'var(--text-primary)' }}>{e.from}</span>
              {!compact && (
                <>
                  <span style={{ color: 'var(--text-secondary)' }}>: </span>
                  <span style={{ color: 'var(--text-primary)' }}>{e.message}</span>
                </>
              )}
              {compact && (
                <span style={{ color: 'var(--text-primary)' }}>
                  {': '}{e.message.length > 120 ? e.message.slice(0, 120) + '…' : e.message}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
