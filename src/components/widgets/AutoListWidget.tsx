import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { WidgetProps, ioBrokerState } from '../../types';
import { useDatapointList, isCacheStale, type DatapointEntry } from '../../hooks/useDatapointList';
import { useIoBroker } from '../../hooks/useIoBroker';

export interface AutoListOptions {
  /** Comma-separated substrings matched against the datapoint role, e.g. "switch,indicator" */
  roles?: string;
  /** Substring matched against the datapoint ID, e.g. "hm-rpc" or "shelly" */
  idPattern?: string;
  /** Comma-separated room names (ioBroker enum.rooms) */
  rooms?: string;
  /** Comma-separated function names (ioBroker enum.functions) */
  funcs?: string;
  /** Show room label below the name */
  showRoom?: boolean;
  /** Auto-refresh interval in minutes (default 5) */
  syncIntervalMin?: number;
}

function isDimmerRole(role?: string): boolean {
  const r = (role ?? '').toLowerCase();
  return r.includes('level') || r.includes('dimmer') || r.includes('brightness');
}

function matchesFilter(dp: DatapointEntry, opts: AutoListOptions): boolean {
  if (opts.roles) {
    const patterns = opts.roles.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (patterns.length > 0) {
      const r = (dp.role ?? '').toLowerCase();
      if (!patterns.some((p) => r.includes(p))) return false;
    }
  }
  if (opts.idPattern?.trim()) {
    if (!dp.id.toLowerCase().includes(opts.idPattern.trim().toLowerCase())) return false;
  }
  if (opts.rooms) {
    const wanted = opts.rooms.split(',').map((s) => s.trim()).filter(Boolean);
    if (wanted.length > 0 && !wanted.some((r) => dp.rooms.includes(r))) return false;
  }
  if (opts.funcs) {
    const wanted = opts.funcs.split(',').map((s) => s.trim()).filter(Boolean);
    if (wanted.length > 0 && !wanted.some((f) => dp.funcs.includes(f))) return false;
  }
  return true;
}

export function AutoListWidget({ config }: WidgetProps) {
  const opts = (config.options ?? {}) as AutoListOptions;
  const { datapoints, loading, load } = useDatapointList();
  const { subscribe, setState } = useIoBroker();
  const [states, setStates] = useState<Record<string, ioBrokerState | null>>({});
  const syncMs = (opts.syncIntervalMin ?? 5) * 60_000;

  // Initial load (use cache if fresh) + periodic TTL refresh
  useEffect(() => {
    load(isCacheStale());
    const timer = setInterval(() => load(true), syncMs);
    return () => clearInterval(timer);
  }, [syncMs]); // eslint-disable-line react-hooks/exhaustive-deps

  const matched = datapoints.filter((dp) => matchesFilter(dp, opts));

  // Subscribe to matched datapoints – re-run when the matched set changes
  const matchedKey = matched.map((d) => d.id).join(',');
  const prevKey = useRef('');
  useEffect(() => {
    if (matchedKey === prevKey.current) return;
    prevKey.current = matchedKey;
    if (matched.length === 0) return;
    const unsubs = matched.map((dp) =>
      subscribe(dp.id, (state) => setStates((prev) => ({ ...prev, [dp.id]: state }))),
    );
    return () => unsubs.forEach((u) => u());
  }, [matchedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="shrink-0 px-3 py-1.5 flex items-center justify-between"
        style={{ borderBottom: '1px solid var(--widget-border)' }}
      >
        <span className="text-xs font-semibold truncate" style={{ color: 'var(--text-secondary)' }}>
          {config.title || 'Datenpunkte'}
          {matched.length > 0 && (
            <span className="ml-1 opacity-50">({matched.length})</span>
          )}
        </span>
        <button
          onClick={() => load(true)}
          title="Datenpunkte neu laden"
          className="hover:opacity-70 transition-opacity p-0.5"
          style={{ color: 'var(--text-secondary)' }}
        >
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-auto min-h-0">
        {loading && matched.length === 0 && (
          <p className="text-xs text-center py-4" style={{ color: 'var(--text-secondary)' }}>
            Lade…
          </p>
        )}
        {!loading && matched.length === 0 && (
          <p className="text-xs text-center py-4" style={{ color: 'var(--text-secondary)' }}>
            Keine Datenpunkte gefunden
          </p>
        )}

        {matched.map((dp) => (
          <Row
            key={dp.id}
            dp={dp}
            state={states[dp.id] ?? null}
            showRoom={opts.showRoom}
            onToggle={() => setState(dp.id, !states[dp.id]?.val)}
            onSlider={(v) => setState(dp.id, v)}
          />
        ))}
      </div>
    </div>
  );
}

interface RowProps {
  dp: DatapointEntry;
  state: ioBrokerState | null;
  showRoom?: boolean;
  onToggle: () => void;
  onSlider: (v: number) => void;
}

function Row({ dp, state, showRoom, onToggle, onSlider }: RowProps) {
  const val = state?.val;
  const isBoolean = dp.type === 'boolean';
  const isNumber = dp.type === 'number';
  const isDimmer = isNumber && isDimmerRole(dp.role);

  return (
    <div
      className="flex items-center gap-2 px-3 py-2"
      style={{ borderBottom: '1px solid var(--widget-border)' }}
    >
      {/* Name */}
      <div className="flex-1 min-w-0">
        <div className="text-xs truncate" style={{ color: 'var(--text-primary)' }}>
          {dp.name}
        </div>
        {showRoom && dp.rooms.length > 0 && (
          <div className="text-[10px] truncate" style={{ color: 'var(--text-secondary)' }}>
            {dp.rooms.join(', ')}
          </div>
        )}
      </div>

      {/* Control */}
      {isBoolean && (
        <button
          onClick={onToggle}
          className="shrink-0 relative w-9 h-[18px] rounded-full transition-colors"
          style={{ background: val ? 'var(--accent)' : 'var(--app-border)' }}
        >
          <span
            className="absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-all"
            style={{ left: val ? 'calc(100% - 16px)' : '2px' }}
          />
        </button>
      )}

      {isDimmer && (
        <div className="shrink-0 flex items-center gap-1.5">
          <input
            type="range"
            min={0}
            max={100}
            value={typeof val === 'number' ? val : 0}
            onChange={(e) => onSlider(Number(e.target.value))}
            className="w-20 h-1"
            style={{ accentColor: 'var(--accent)' }}
          />
          <span className="text-[10px] w-8 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>
            {typeof val === 'number' ? `${Math.round(val)}${dp.unit ?? ''}` : '–'}
          </span>
        </div>
      )}

      {isNumber && !isDimmer && (
        <span className="shrink-0 text-xs font-medium tabular-nums" style={{ color: 'var(--text-primary)' }}>
          {val != null ? `${val}${dp.unit ? '\u202f' + dp.unit : ''}` : '–'}
        </span>
      )}

      {!isBoolean && !isNumber && (
        <span className="shrink-0 text-xs max-w-[80px] truncate text-right" style={{ color: 'var(--text-secondary)' }}>
          {val != null ? String(val) : '–'}
        </span>
      )}
    </div>
  );
}
