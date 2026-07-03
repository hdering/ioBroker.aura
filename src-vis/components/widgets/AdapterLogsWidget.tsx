import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollText, Pause, Play, Trash2, ArrowDownToLine, Search } from 'lucide-react';
import { getObjectViewDirect, sendToDirect, useIoBroker, type LogEntry } from '../../hooks/useIoBroker';
import type { WidgetProps } from '../../types';
import { getWidgetIcon } from '../../utils/widgetIconMap';

// ── Types ───────────────────────────────────────────────────────────────────

type Severity = 'debug' | 'info' | 'warn' | 'error';
const SEVERITY_ORDER: Severity[] = ['debug', 'info', 'warn', 'error'];

const SEVERITY_LABEL: Record<Severity, string> = {
    debug: 'Debug',
    info: 'Info',
    warn: 'Warn',
    error: 'Error',
};

const SEVERITY_COLOR: Record<Severity, string> = {
    debug: '#94a3b8',
    info: '#3b82f6',
    warn: '#f59e0b',
    error: '#ef4444',
};

const DEFAULT_BUFFER = 500;
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
        return `${d.toLocaleTimeString('de-DE', { hour12: false })}.${String(d.getMilliseconds()).padStart(3, '0')}`;
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
    const showTitle = o.showTitle !== false;
    const showIcon = o.showIcon !== false;
    const titleAlign = (o.titleAlign as 'left' | 'center' | 'right') ?? 'left';
    const iconSize = (o.iconSize as number) || 20;
    const showSearch = o.showSearch !== false;
    const showFilter = o.showFilter !== false;
    const showControls = o.showControls !== false;
    const transparent = !!o.transparent;
    const striped = o.striped !== false;
    const compact = !!o.compact;
    const bufferSize = Math.max(50, Math.min(5000, (o.bufferSize as number) || DEFAULT_BUFFER));
    const visibleLimit = Math.max(20, Math.min(bufferSize, (o.visibleLimit as number) || DEFAULT_VISIBLE));
    const newestFirst = o.newestFirst !== false;
    const defaultLevels = (() => {
        const raw = o.levels as Severity[] | undefined;
        if (Array.isArray(raw) && raw.length > 0)
            return new Set(raw.filter((s): s is Severity => SEVERITY_ORDER.includes(s)));
        return new Set<Severity>(['info', 'warn', 'error']);
    })();
    // Backend pre-filter: comma-separated instances ("aura, admin" matches every
    // instance of those adapters; "aura.0, admin.1" matches exact instances).
    // Normalised to a stable string so it can drive the poll effect deps.
    const instancesFilter = ((o.adapterFilter as string) ?? '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
        .join(',');

    const { connected } = useIoBroker();

    const [levels, setLevels] = useState<Set<Severity>>(defaultLevels);
    // Runtime adapter filter — multi-select. Empty set = show all adapters.
    const [selectedAdapters, setSelectedAdapters] = useState<Set<string>>(new Set());
    const [query, setQuery] = useState('');
    const [paused, setPaused] = useState(false);
    const [autoScroll, setAutoScroll] = useState(true);

    // Live ring buffer of recent entries. Kept outside React state so paused mode
    // can still collect without forcing re-renders.
    const bufferRef = useRef<LogEntry[]>([]);
    const seenSeqRef = useRef(0);
    const [tick, setTick] = useState(0);
    const pausedRef = useRef(paused);
    useEffect(() => {
        pausedRef.current = paused;
    }, [paused]);

    const Icon = getWidgetIcon((o.icon as string) ?? 'ScrollText', ScrollText);

    // Backend health: null = unknown, true = answered, false = timed out
    const [backendOk, setBackendOk] = useState<boolean | null>(null);

    // Changing the backend instance pre-filter invalidates the buffer: the old
    // entries belong to a different filter and seq numbers must restart.
    useEffect(() => {
        bufferRef.current = [];
        seenSeqRef.current = 0;
        setTick((t) => t + 1);
    }, [instancesFilter]);

    // Poll the aura backend for new log entries. The frontend would need admin
    // permissions to receive `requireLog` events directly from iobroker.web —
    // anonymous web users do not, so we route through aura's sendTo handler.
    useEffect(() => {
        if (!connected) return;
        let cancelled = false;
        let auraInstance: string | null = null;
        let timer: ReturnType<typeof setTimeout> | null = null;

        const pollOnce = async () => {
            if (cancelled || !auraInstance) return;
            const result = await sendToDirect<{
                ok?: boolean;
                entries?: Array<LogEntry & { seq: number }>;
                latestSeq?: number;
            }>(auraInstance, 'getRecentLogs', { sinceSeq: seenSeqRef.current, instances: instancesFilter }, 10000);
            if (cancelled) return;
            if (result && typeof result === 'object' && '__timeout' in (result as object)) {
                setBackendOk(false);
            } else if (result && typeof result === 'object' && 'entries' in result && Array.isArray(result.entries)) {
                setBackendOk(true);
                if (result.entries.length > 0) {
                    const buf = bufferRef.current;
                    for (const e of result.entries) {
                        if (e.seq && e.seq <= seenSeqRef.current) continue;
                        buf.push(e);
                        if (e.seq && e.seq > seenSeqRef.current) seenSeqRef.current = e.seq;
                    }
                    if (buf.length > bufferSize) buf.splice(0, buf.length - bufferSize);
                    if (!pausedRef.current) setTick((t) => t + 1);
                }
                if (typeof result.latestSeq === 'number' && result.latestSeq > seenSeqRef.current) {
                    seenSeqRef.current = result.latestSeq;
                }
            }
            timer = setTimeout(pollOnce, 1500);
        };

        (async () => {
            const view = await getObjectViewDirect('instance', 'system.adapter.aura.', 'system.adapter.aura.香');
            if (cancelled) return;
            const row = view.rows[0];
            if (!row) return;
            auraInstance = row.id.slice('system.adapter.'.length);
            pollOnce();
        })();

        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
        };
    }, [connected, bufferSize, instancesFilter]);

    // Auto-scroll handling — follow whichever end shows the newest entry.
    const listRef = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        if (!autoScroll || paused) return;
        const el = listRef.current;
        if (!el) return;
        el.scrollTop = newestFirst ? 0 : el.scrollHeight;
    }, [tick, autoScroll, paused, newestFirst]);

    // Adapter list — names seen in the current buffer (sorted).
    const adapters = useMemo(() => {
        const set = new Set<string>();
        for (const e of bufferRef.current) {
            const a = adapterFromSource(e.from);
            if (a) set.add(a);
        }
        return Array.from(set).sort();
    }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps

    // Filter + slice. `out` is built newest→oldest; we flip back to chronological
    // order only when the user wants oldest-first display.
    const visible = useMemo(() => {
        const lc = query.trim().toLowerCase();
        const out: LogEntry[] = [];
        const buf = bufferRef.current;
        for (let i = buf.length - 1; i >= 0 && out.length < visibleLimit; i--) {
            const e = buf[i];
            const sev = normalizeSeverity(e.severity);
            if (!levels.has(sev)) continue;
            if (selectedAdapters.size > 0 && !selectedAdapters.has(adapterFromSource(e.from))) continue;
            if (lc && !e.message.toLowerCase().includes(lc) && !e.from.toLowerCase().includes(lc)) continue;
            out.push(e);
        }
        return newestFirst ? out : out.reverse();
    }, [tick, levels, selectedAdapters, query, visibleLimit, newestFirst]); // eslint-disable-line react-hooks/exhaustive-deps

    // Counts (over whole buffer)
    const counts = useMemo(() => {
        const c: Record<Severity, number> = { debug: 0, info: 0, warn: 0, error: 0 };
        for (const e of bufferRef.current) c[normalizeSeverity(e.severity)]++;
        return c;
    }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps

    const toggleLevel = (s: Severity) => {
        setLevels((prev) => {
            const next = new Set(prev);
            if (next.has(s)) next.delete(s);
            else next.add(s);
            return next;
        });
    };

    const toggleAdapter = (a: string) => {
        setSelectedAdapters((prev) => {
            const next = new Set(prev);
            if (next.has(a)) next.delete(a);
            else next.add(a);
            return next;
        });
    };

    // Drop selections for adapters that have aged out of the buffer.
    useEffect(() => {
        setSelectedAdapters((prev) => {
            if (prev.size === 0) return prev;
            const avail = new Set(adapters);
            const next = new Set([...prev].filter((a) => avail.has(a)));
            return next.size === prev.size ? prev : next;
        });
    }, [adapters]);

    const clearBuffer = () => {
        bufferRef.current = [];
        setTick((t) => t + 1);
    };

    return (
        <div className="aura-widget-row w-full h-full flex flex-col gap-2 overflow-hidden">
            {/* Header */}
            {(showTitle || showIcon) && (
                <div className="flex items-center gap-2 shrink-0">
                    {showIcon && (
                        <Icon
                            size={iconSize}
                            style={{ color: 'var(--accent)' }}
                            className="aura-widget-icon shrink-0"
                        />
                    )}
                    {showTitle && (
                        <p
                            className="aura-widget-title text-xs flex-1 min-w-0 truncate"
                            style={{
                                color: 'var(--text-secondary)',
                                textAlign: titleAlign as React.CSSProperties['textAlign'],
                            }}
                        >
                            {config.title || 'Adapter-Logs'}
                        </p>
                    )}
                    {showControls && (
                        <div className="flex items-center gap-1 shrink-0">
                            <button
                                onClick={() => setAutoScroll((v) => !v)}
                                className="p-1 rounded transition-opacity"
                                style={{
                                    color: autoScroll ? 'var(--accent)' : 'var(--text-secondary)',
                                    opacity: autoScroll ? 1 : 0.6,
                                }}
                                title={autoScroll ? 'Auto-Scroll an' : 'Auto-Scroll aus'}
                            >
                                <ArrowDownToLine size={14} />
                            </button>
                            <button
                                onClick={() => setPaused((p) => !p)}
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
                    {SEVERITY_ORDER.map((s) => {
                        const active = levels.has(s);
                        const color = SEVERITY_COLOR[s];
                        return (
                            <button
                                key={s}
                                onClick={() => toggleLevel(s)}
                                className="text-[10px] px-2 py-0.5 rounded-full transition-colors"
                                style={{
                                    background: active ? color : transparent ? 'transparent' : 'var(--app-bg)',
                                    color: active ? '#fff' : 'var(--text-secondary)',
                                    border: `1px solid ${active ? color : 'var(--app-border)'}`,
                                }}
                                title={`${SEVERITY_LABEL[s]} ein-/ausblenden`}
                            >
                                {SEVERITY_LABEL[s]} <span className="opacity-80">{counts[s]}</span>
                            </button>
                        );
                    })}
                    {adapters.length > 0 && (
                        <>
                            <button
                                onClick={() => setSelectedAdapters(new Set())}
                                className="text-[10px] px-2 py-0.5 rounded-full transition-colors"
                                style={{
                                    background:
                                        selectedAdapters.size === 0
                                            ? 'var(--accent)'
                                            : transparent
                                              ? 'transparent'
                                              : 'var(--app-bg)',
                                    color: selectedAdapters.size === 0 ? '#fff' : 'var(--text-secondary)',
                                    border: `1px solid ${
                                        selectedAdapters.size === 0 ? 'var(--accent)' : 'var(--app-border)'
                                    }`,
                                }}
                                title="Alle Adapter anzeigen"
                            >
                                Alle
                            </button>
                            {adapters.map((a) => {
                                const active = selectedAdapters.has(a);
                                return (
                                    <button
                                        key={a}
                                        onClick={() => toggleAdapter(a)}
                                        className="text-[10px] px-2 py-0.5 rounded-full transition-colors"
                                        style={{
                                            background: active
                                                ? 'var(--accent)'
                                                : transparent
                                                  ? 'transparent'
                                                  : 'var(--app-bg)',
                                            color: active ? '#fff' : 'var(--text-secondary)',
                                            border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                                        }}
                                        title={`${a} ein-/ausblenden`}
                                    >
                                        {a}
                                    </button>
                                );
                            })}
                        </>
                    )}
                </div>
            )}

            {/* Search */}
            {showSearch && (
                <div
                    className="flex items-center gap-1 shrink-0 rounded-md px-2 py-1"
                    style={{
                        background: transparent ? 'transparent' : 'var(--app-bg)',
                        border: '1px solid var(--app-border)',
                    }}
                >
                    <Search size={12} style={{ color: 'var(--text-secondary)' }} />
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Freitext-Filter…"
                        className="flex-1 bg-transparent text-xs focus:outline-none"
                        style={{ color: 'var(--text-primary)' }}
                    />
                </div>
            )}

            {/* Status bar */}
            <div className="flex items-center gap-2 text-[10px] shrink-0" style={{ color: 'var(--text-secondary)' }}>
                <span>
                    {visible.length}/{bufferRef.current.length} Zeilen
                </span>
                {paused && <span style={{ color: '#f59e0b' }}>• pausiert</span>}
                {!connected && <span style={{ color: '#ef4444' }}>• getrennt</span>}
                {connected && backendOk === false && (
                    <span
                        style={{ color: '#ef4444' }}
                        title="Der Aura-Adapter antwortet nicht auf getRecentLogs — bitte Adapter aktualisieren und neu starten."
                    >
                        • Backend antwortet nicht
                    </span>
                )}
                {connected && backendOk === null && (
                    <span style={{ color: '#94a3b8' }}>• Backend wird kontaktiert…</span>
                )}
            </div>

            {/* Log table */}
            <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto pr-1">
                {visible.length === 0 ? (
                    <div
                        className="flex items-center justify-center h-full text-[11px]"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        {!connected
                            ? 'Nicht verbunden'
                            : backendOk === false
                              ? 'Aura-Adapter antwortet nicht — bitte Adapter neu starten/aktualisieren.'
                              : backendOk === null
                                ? 'Backend wird kontaktiert…'
                                : 'Warte auf Log-Einträge…'}
                    </div>
                ) : (
                    <table className="w-full text-[10px] font-mono border-collapse">
                        <thead
                            className="sticky top-0 z-10"
                            style={{
                                background: transparent ? 'transparent' : 'var(--app-surface)',
                                color: 'var(--text-secondary)',
                                borderBottom: '1px solid var(--app-border)',
                            }}
                        >
                            <tr>
                                <th className="text-left px-1.5 py-1 font-semibold whitespace-nowrap">Quelle</th>
                                <th className="text-left px-1.5 py-1 font-semibold whitespace-nowrap">Zeitstempel</th>
                                <th className="text-left px-1.5 py-1 font-semibold whitespace-nowrap">Typ</th>
                                <th className="text-left px-1.5 py-1 font-semibold w-full">Nachricht</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visible.map((e, i) => {
                                const sev = normalizeSeverity(e.severity);
                                const color = SEVERITY_COLOR[sev];
                                const message =
                                    compact && e.message.length > 120 ? `${e.message.slice(0, 120)}…` : e.message;
                                return (
                                    <tr
                                        key={`${e.seq ?? e.ts}-${i}`}
                                        style={{
                                            background:
                                                striped && i % 2 === 1
                                                    ? 'color-mix(in srgb, var(--app-bg) 60%, transparent)'
                                                    : 'transparent',
                                        }}
                                    >
                                        <td
                                            className="px-1.5 py-0.5 align-top whitespace-nowrap"
                                            style={{ color: 'var(--text-primary)', borderLeft: `2px solid ${color}` }}
                                        >
                                            {e.from || '—'}
                                        </td>
                                        <td
                                            className="px-1.5 py-0.5 align-top whitespace-nowrap"
                                            style={{ color: 'var(--text-secondary)' }}
                                        >
                                            {formatTime(e.ts)}
                                        </td>
                                        <td className="px-1.5 py-0.5 align-top whitespace-nowrap">
                                            <span
                                                className="inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase"
                                                style={{
                                                    background: `${color}22`,
                                                    color,
                                                    border: `1px solid ${color}55`,
                                                }}
                                            >
                                                {SEVERITY_LABEL[sev]}
                                            </span>
                                        </td>
                                        <td
                                            className="px-1.5 py-0.5 align-top break-words"
                                            style={{ color: 'var(--text-primary)', wordBreak: 'break-word' }}
                                        >
                                            {message}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
