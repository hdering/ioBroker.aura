import { useEffect, useMemo, useState } from 'react';
import { ServerCog, RotateCcw, Download, AlertTriangle, CircleDot, Search } from 'lucide-react';
import {
    getObjectViewDirect,
    subscribeStateDirect,
    getStateDirect,
    sendToDirect,
    useIoBroker,
} from '../../hooks/useIoBroker';
import { useWidgetWriteLock } from '../../hooks/widgetWriteLock';
import type { WidgetProps, ioBrokerState, ioBrokerObject } from '../../types';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { NS } from '../../utils/namespace';
import { HeaderGroup, HeaderSlotsInline, HeaderSlotsRow2, TitleRow } from '../layout/HeaderSlotsContext';

// ── Types ───────────────────────────────────────────────────────────────────

type FilterMode = 'all' | 'enabled' | 'running' | 'scheduled' | 'stopped' | 'disabled' | 'updates';

const FILTER_LABELS: Record<FilterMode, string> = {
    all: 'Alle',
    enabled: 'Aktiv',
    running: 'Läuft',
    scheduled: 'Geplant',
    stopped: 'Gestoppt',
    disabled: 'Deaktiviert',
    updates: 'Updates',
};

interface AdapterInstance {
    /** "adapter.0" (no leading "system.adapter.") */
    id: string;
    adapter: string; // "hm-rpc"
    instance: string; // "0"
    name: string; // common.name (or id)
    title: string; // common.title / common.titleLang
    host: string; // common.host
    enabled: boolean; // common.enabled
    mode: string; // common.mode — "daemon" | "schedule" | "subscribe" | "once" | "extension"
    version: string; // common.version
    icon?: string; // common.extIcon / common.icon
}

interface UpdateInfo {
    /** Version available in the latest repository */
    version: string;
    /** Current installed version */
    installed?: string;
}

// Body text follows the "fontSize" option (#971); secondary texts keep the old
// 10:12 ratio to the row text, so the default look is unchanged.
const SMALL = '0.833em';
const DEFAULT_BUTTON_SIZE = 14;

// ── Helpers ─────────────────────────────────────────────────────────────────

function resolveTitle(obj: ioBrokerObject, fallback: string): string {
    const t = (obj.common as { titleLang?: Record<string, string>; title?: string }).titleLang;
    if (t && typeof t === 'object') return t.de ?? t.en ?? Object.values(t)[0] ?? fallback;
    const tt = (obj.common as { title?: string }).title;
    if (tt && typeof tt === 'string') return tt;
    const n = obj.common?.name;
    if (typeof n === 'string') return n;
    if (n && typeof n === 'object')
        return (n as Record<string, string>).de ?? (n as Record<string, string>).en ?? Object.values(n)[0] ?? fallback;
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
    transparent,
    striped,
    index,
    buttonSize,
    onRestart,
    onUpdate,
}: {
    inst: AdapterInstance;
    alive: boolean | null;
    connected: boolean | null;
    updateInfo?: UpdateInfo;
    allowRestart: boolean;
    allowUpdate: boolean;
    showVersion: boolean;
    compact: boolean;
    transparent: boolean;
    striped: boolean;
    index: number;
    buttonSize: number;
    onRestart: (inst: AdapterInstance) => void;
    onUpdate: (inst: AdapterInstance) => void;
}) {
    const [busy, setBusy] = useState<'restart' | 'update' | null>(null);

    const isAlive = alive === true;
    const enabled = inst.enabled;
    const hasUpdate = !!updateInfo;
    // Schedule-mode adapters (cron, e.g. ical/openweathermap) only report alive=true
    // for the brief moment their job runs — the rest of the time alive=false is normal,
    // so they must not be labelled "gestoppt".
    const scheduled = inst.mode === 'schedule';

    // Status pill text + color
    let statusLabel: string;
    let statusColor: string;
    if (!enabled) {
        statusLabel = 'deaktiviert';
        statusColor = '#64748b';
    } else if (isAlive) {
        statusLabel = 'läuft';
        statusColor = '#22c55e';
    } else if (scheduled) {
        statusLabel = 'geplant';
        statusColor = '#3b82f6';
    } else {
        statusLabel = 'gestoppt';
        statusColor = '#ef4444';
    }

    // Zebra rows drop the per-card border and alternate a subtle tint, matching
    // the JSON-table widget; otherwise keep the bordered card look.
    const rowBg = striped
        ? index % 2 === 1
            ? 'color-mix(in srgb, var(--app-bg) 60%, transparent)'
            : 'transparent'
        : transparent
          ? 'transparent'
          : 'var(--app-bg)';
    const rowBorder = striped || transparent ? 'transparent' : 'var(--app-border)';
    // Touch target grows with the icon (#971): 14 px icon -> 4 px padding (old p-1).
    const buttonPad = Math.round(buttonSize * 0.3);

    const runRestart = async () => {
        if (busy) return;
        setBusy('restart');
        try {
            await onRestart(inst);
        } finally {
            setTimeout(() => setBusy(null), 1500);
        }
    };
    const runUpdate = async () => {
        if (busy) return;
        setBusy('update');
        try {
            await onUpdate(inst);
        } finally {
            setTimeout(() => setBusy(null), 2500);
        }
    };

    return (
        <div
            className={`flex items-center gap-2 px-2 py-1.5 ${striped ? '' : 'rounded-md'}`}
            style={{
                background: rowBg,
                border: `1px solid ${rowBorder}`,
            }}
        >
            {/* Status dot */}
            <span
                className="shrink-0 inline-block rounded-full"
                style={{
                    width: '0.67em',
                    height: '0.67em',
                    background: statusColor,
                    boxShadow: isAlive ? `0 0 6px ${statusColor}` : 'none',
                }}
                title={statusLabel}
            />

            {/* Name + version */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                        {inst.id}
                    </span>
                    {showVersion && inst.version && (
                        <span
                            className="shrink-0 font-mono opacity-60"
                            style={{ fontSize: SMALL, color: 'var(--text-secondary)' }}
                        >
                            v{inst.version}
                        </span>
                    )}
                    {hasUpdate && (
                        <span
                            className="shrink-0 font-semibold px-1.5 py-0.5 rounded"
                            style={{
                                fontSize: SMALL,
                                background: '#f59e0b22',
                                color: '#f59e0b',
                                border: '1px solid #f59e0b55',
                            }}
                            title={
                                updateInfo!.installed
                                    ? `${updateInfo!.installed} → ${updateInfo!.version}`
                                    : `Update verfügbar: ${updateInfo!.version}`
                            }
                        >
                            ↑ {updateInfo!.version}
                        </span>
                    )}
                </div>
                {!compact && inst.title && inst.title !== inst.id && (
                    <div className="truncate" style={{ fontSize: SMALL, color: 'var(--text-secondary)' }}>
                        {inst.title}
                    </div>
                )}
            </div>

            {/* Connected indicator (only when applicable & alive) */}
            {connected !== null && isAlive && (
                <CircleDot
                    size="1em"
                    className="shrink-0"
                    style={{ color: connected ? '#22c55e' : '#94a3b8', opacity: connected ? 1 : 0.6 }}
                />
            )}

            {/* Status label */}
            <span className="shrink-0 font-medium" style={{ fontSize: SMALL, color: statusColor }}>
                {statusLabel}
            </span>

            {/* Restart */}
            {allowRestart && (
                <button
                    onClick={runRestart}
                    disabled={!!busy || !enabled}
                    className="shrink-0 rounded transition-opacity"
                    style={{
                        padding: buttonPad,
                        color: 'var(--text-secondary)',
                        opacity: !enabled || busy === 'restart' ? 0.4 : 1,
                        cursor: !enabled || busy ? 'default' : 'pointer',
                    }}
                    title={enabled ? 'Neustart' : 'Adapter ist deaktiviert'}
                >
                    <RotateCcw size={buttonSize} className={busy === 'restart' ? 'animate-spin' : ''} />
                </button>
            )}

            {/* Update */}
            {allowUpdate && hasUpdate && (
                <button
                    onClick={runUpdate}
                    disabled={!!busy}
                    className="shrink-0 rounded transition-opacity"
                    style={{
                        padding: buttonPad,
                        color: '#f59e0b',
                        opacity: busy === 'update' ? 0.5 : 1,
                        cursor: busy ? 'default' : 'pointer',
                    }}
                    title={`Update auf v${updateInfo!.version} installieren`}
                >
                    <Download size={buttonSize} className={busy === 'update' ? 'animate-bounce' : ''} />
                </button>
            )}
        </div>
    );
}

// ── Main widget ─────────────────────────────────────────────────────────────

export function AdapterStatusWidget({ config }: WidgetProps) {
    const writeLocked = useWidgetWriteLock();
    const o = config.options ?? {};
    const showTitle = o.showTitle !== false;
    const showIcon = o.showIcon !== false;
    const titleAlign = (o.titleAlign as 'left' | 'center' | 'right') ?? 'left';
    const iconSize = (o.iconSize as number) || 20;
    const allowRestart = !!o.allowRestart;
    const allowUpdate = !!o.allowUpdate;
    const showVersion = o.showVersion !== false;
    const showSearch = o.showSearch !== false;
    const showFilter = o.showFilter !== false;
    const defaultFilter = (o.filterMode as FilterMode) ?? 'all';
    const compact = !!o.compact;
    const transparent = !!o.transparent;
    const striped = o.striped !== false;
    const sortBy = (o.sortBy as 'name' | 'status') ?? 'name';
    // Unset = text-xs (follows the global font scale); set = fixed px (#971).
    const fontSizePx = Number(o.fontSize) > 0 ? Math.max(8, Math.min(32, Number(o.fontSize))) : null;
    const bodyFontSize = fontSizePx ? `${fontSizePx}px` : 'calc(0.75rem * var(--font-scale, 1))';
    const buttonSize = Math.max(10, Math.min(48, Number(o.buttonSize) || DEFAULT_BUTTON_SIZE));

    const { connected } = useIoBroker();

    const [instances, setInstances] = useState<AdapterInstance[]>([]);
    const [states, setStates] = useState<Record<string, ioBrokerState | null>>({});
    const [updates, setUpdates] = useState<Record<string, UpdateInfo>>({});
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState<FilterMode>(defaultFilter);
    // Reset to admin-configured default when the option changes (live edit mode).
    useEffect(() => {
        setFilter(defaultFilter);
    }, [defaultFilter]);
    const [adminInstance, setAdminInstance] = useState<string>('admin.0');
    // sendTo target is always the aura instance that serves this page (NS) so a
    // second aura.* instance does not silently steal the messages.
    const auraInstance = NS;
    const [actionError, setActionError] = useState<string | null>(null);

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
                const adapter = rest.slice(0, lastDot);
                const instance = rest.slice(lastDot + 1);
                if (!/^\d+$/.test(instance)) continue;
                const c = row.value?.common ?? ({} as ioBrokerObject['common']);
                list.push({
                    id: rest,
                    adapter,
                    instance,
                    name: typeof c.name === 'string' ? c.name : ((Object.values(c.name ?? {}) as string[])[0] ?? rest),
                    title: resolveTitle(row.value, rest),
                    host: (c as { host?: string }).host ?? '',
                    enabled: c.enabled === true,
                    mode: (c as { mode?: string }).mode ?? 'daemon',
                    version: (c as { version?: string }).version ?? '',
                    icon: (c as { extIcon?: string; icon?: string }).extIcon ?? (c as { icon?: string }).icon,
                });
                if (!firstAdmin && adapter === 'admin') firstAdmin = rest;
            }
            list.sort((a, b) => a.id.localeCompare(b.id));
            setInstances(list);
            if (firstAdmin) setAdminInstance(firstAdmin);
        })();
        return () => {
            cancelled = true;
        };
    }, [connected]);

    // Subscribe to alive + connected states per instance
    const idsKey = useMemo(() => instances.map((i) => i.id).join('|'), [instances]);
    useEffect(() => {
        if (instances.length === 0) return;
        const unsubs: Array<() => void> = [];
        for (const inst of instances) {
            const aliveId = `system.adapter.${inst.id}.alive`;
            const connectedId = `system.adapter.${inst.id}.connected`;
            void getStateDirect(aliveId).then((s) => setStates((p) => ({ ...p, [aliveId]: s })));
            void getStateDirect(connectedId).then((s) => setStates((p) => ({ ...p, [connectedId]: s })));
            unsubs.push(subscribeStateDirect(aliveId, (s) => setStates((p) => ({ ...p, [aliveId]: s }))));
            unsubs.push(subscribeStateDirect(connectedId, (s) => setStates((p) => ({ ...p, [connectedId]: s }))));
        }
        return () => unsubs.forEach((u) => u());
    }, [idsKey]); // eslint-disable-line react-hooks/exhaustive-deps

    // Available updates. The aura backend compares the installed versions against
    // the *active* repositories, like the admin's adapter list does.
    // admin.X.info.updatesJson is only the fallback (older aura backend, no repo
    // data): admin rewrites it on its own schedule, so after switching the
    // repository back from Beta to Stable it kept listing the Beta offers (#962).
    const [refreshTick, setRefreshTick] = useState(0);
    useEffect(() => {
        if (!connected) return;
        let cancelled = false;
        let fallback: Record<string, UpdateInfo> = {};
        let backendOk = false;
        const askBackend = async (refresh: boolean) => {
            const r = (await sendToDirect(auraInstance, 'adapterUpdates', { refresh })) as {
                ok?: boolean;
                updates?: Record<string, { availableVersion?: string; installedVersion?: string }>;
            } | null;
            if (cancelled) return;
            if (r && typeof r === 'object' && r.ok === true && r.updates && typeof r.updates === 'object') {
                backendOk = true;
                setUpdates(parseUpdatesJson(JSON.stringify(r.updates)));
            } else {
                backendOk = false;
                setUpdates(fallback);
            }
        };
        const id = `${adminInstance}.info.updatesJson`;
        const onAdminList = (s: ioBrokerState | null | undefined) => {
            fallback = parseUpdatesJson(s?.val as string | undefined);
            if (!backendOk) setUpdates(fallback);
        };
        void getStateDirect(id).then((s) => {
            if (!cancelled) onAdminList(s);
        });
        const u = subscribeStateDirect(id, (s) => {
            onAdminList(s);
            // Admin just refreshed its repository — re-measure, skipping the cache.
            void askBackend(true);
        });
        void askBackend(refreshTick > 0);
        // A repository switch writes nothing the widget could subscribe to cheaply.
        const timer = window.setInterval(() => void askBackend(false), 5 * 60 * 1000);
        return () => {
            cancelled = true;
            u();
            window.clearInterval(timer);
        };
    }, [connected, adminInstance, auraInstance, refreshTick]);

    // Actions — go through aura backend so we don't depend on socket-port permissions.
    // Backend handler in main.js spawns `iobroker upgrade <name>` via the host's cmdExec.
    const handleResult = (label: string, result: unknown): boolean => {
        if (result && typeof result === 'object' && '__timeout' in (result as object)) {
            setActionError(
                `${label}: keine Antwort von ${auraInstance} (30 s) — läuft die aura-Instanz mit dem neuen Code?`,
            );
            return false;
        }
        if (typeof result === 'string') {
            setActionError(
                `${label}: ${result === 'permissionError' ? 'Berechtigung verweigert (Anonymous-User braucht sendTo-Rechte)' : result}`,
            );
            return false;
        }
        const r = result as { ok?: boolean; error?: string; stderr?: string } | null;
        if (!r?.ok) {
            setActionError(`${label}: ${r?.error ?? r?.stderr ?? 'fehlgeschlagen'}`);
            return false;
        }
        return true;
    };

    const restartInstance = async (inst: AdapterInstance) => {
        // Restarting an instance or installing an update reaches far past this
        // dashboard — never from a locked editor. (issue #655)
        if (writeLocked) return;
        setActionError(null);
        const result = await sendToDirect(auraInstance, 'restartAdapter', { id: inst.id });
        handleResult(`Neustart ${inst.id}`, result);
    };

    const installUpdate = async (inst: AdapterInstance) => {
        if (writeLocked) return;
        setActionError(null);
        // Upgrades take longer than the default 30s — npm install can run 1-3 minutes.
        const result = await sendToDirect(auraInstance, 'upgradeAdapter', { name: inst.adapter }, 5 * 60 * 1000);
        if (handleResult(`Update ${inst.adapter}`, result)) setRefreshTick((t) => t + 1);
    };

    // Filter + sort
    const visible = useMemo(() => {
        const lc = query.trim().toLowerCase();
        let arr = instances.filter((inst) => {
            const aliveSt = states[`system.adapter.${inst.id}.alive`]?.val === true;
            const isScheduled = inst.mode === 'schedule';
            if (filter === 'enabled' && !inst.enabled) return false;
            if (filter === 'running' && !aliveSt) return false;
            if (filter === 'scheduled' && (!isScheduled || !inst.enabled)) return false;
            if (filter === 'stopped' && (aliveSt || !inst.enabled || isScheduled)) return false;
            if (filter === 'disabled' && inst.enabled) return false;
            if (filter === 'updates' && !updates[inst.adapter]) return false;
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
        let running = 0,
            scheduled = 0,
            stopped = 0,
            disabled = 0,
            hasUpdate = 0;
        for (const inst of instances) {
            if (!inst.enabled) {
                disabled++;
                continue;
            }
            if (states[`system.adapter.${inst.id}.alive`]?.val === true) running++;
            else if (inst.mode === 'schedule') scheduled++;
            else stopped++;
            if (updates[inst.adapter]) hasUpdate++;
        }
        return { running, scheduled, stopped, disabled, hasUpdate, total: instances.length };
    }, [instances, states, updates]);

    return (
        <div
            className="aura-widget-row w-full h-full flex flex-col gap-2 overflow-hidden"
            style={{ fontSize: bodyFontSize, lineHeight: 1.333 }}
        >
            {/* Header */}
            <HeaderGroup>
                {(showTitle || showIcon) && (
                    <TitleRow align={titleAlign} className="flex items-center gap-2 shrink-0">
                        {showIcon && (
                            <Icon
                                size={iconSize}
                                style={{ '--aura-icon-color': 'var(--accent)' }}
                                className="aura-widget-icon shrink-0"
                            />
                        )}
                        {showTitle && (
                            <p
                                className="aura-widget-title text-xs flex-1 min-w-0 truncate"
                                style={{
                                    '--aura-title-color': 'var(--text-secondary)',
                                    textAlign: titleAlign as React.CSSProperties['textAlign'],
                                }}
                            >
                                {config.title || 'Adapter-Status'}
                            </p>
                        )}
                        <HeaderSlotsInline />
                    </TitleRow>
                )}
                <HeaderSlotsRow2 />
            </HeaderGroup>

            {/* Summary */}
            <div
                className="flex items-center gap-2 shrink-0"
                style={{ fontSize: SMALL, color: 'var(--text-secondary)' }}
            >
                <span className="flex items-center gap-1">
                    <span className="rounded-full" style={{ width: '0.5em', height: '0.5em', background: '#22c55e' }} />
                    {counts.running}
                </span>
                {counts.scheduled > 0 && (
                    <span className="flex items-center gap-1">
                        <span
                            className="rounded-full"
                            style={{ width: '0.5em', height: '0.5em', background: '#3b82f6' }}
                        />
                        {counts.scheduled}
                    </span>
                )}
                <span className="flex items-center gap-1">
                    <span className="rounded-full" style={{ width: '0.5em', height: '0.5em', background: '#ef4444' }} />
                    {counts.stopped}
                </span>
                <span className="flex items-center gap-1">
                    <span className="rounded-full" style={{ width: '0.5em', height: '0.5em', background: '#64748b' }} />
                    {counts.disabled}
                </span>
                {counts.hasUpdate > 0 && (
                    <span className="flex items-center gap-1 ml-auto" style={{ color: '#f59e0b' }}>
                        <Download size="1em" />
                        {counts.hasUpdate} Update{counts.hasUpdate === 1 ? '' : 's'}
                    </span>
                )}
            </div>

            {/* Filter pills */}
            {showFilter && (
                <div className="flex items-center gap-1 flex-wrap shrink-0">
                    {(Object.keys(FILTER_LABELS) as FilterMode[]).map((f) => {
                        const active = filter === f;
                        const count =
                            f === 'all'
                                ? counts.total
                                : f === 'enabled'
                                  ? counts.running + counts.scheduled + counts.stopped
                                  : f === 'running'
                                    ? counts.running
                                    : f === 'scheduled'
                                      ? counts.scheduled
                                      : f === 'stopped'
                                        ? counts.stopped
                                        : f === 'disabled'
                                          ? counts.disabled
                                          : f === 'updates'
                                            ? counts.hasUpdate
                                            : 0;
                        return (
                            <button
                                key={f}
                                onClick={() => setFilter(f)}
                                className="rounded-full transition-colors"
                                style={{
                                    fontSize: SMALL,
                                    padding: '0.2em 0.8em',
                                    background: active
                                        ? 'var(--accent)'
                                        : transparent
                                          ? 'transparent'
                                          : 'var(--app-bg)',
                                    color: active ? '#fff' : 'var(--text-secondary)',
                                    border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                                }}
                            >
                                {FILTER_LABELS[f]} <span className="opacity-70">{count}</span>
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Search */}
            {showSearch && instances.length > 5 && (
                <div
                    className="flex items-center gap-1 shrink-0 rounded-md px-2 py-1"
                    style={{
                        background: transparent ? 'transparent' : 'var(--app-bg)',
                        border: '1px solid var(--app-border)',
                    }}
                >
                    <Search size="1em" style={{ color: 'var(--text-secondary)' }} />
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Filter…"
                        className="flex-1 bg-transparent focus:outline-none"
                        style={{ fontSize: '1em', color: 'var(--text-primary)' }}
                    />
                </div>
            )}

            {/* Error toast */}
            {actionError && (
                <div
                    className="flex items-start gap-1.5 px-2 py-1 rounded shrink-0"
                    style={{
                        fontSize: SMALL,
                        background: '#ef444422',
                        color: '#ef4444',
                        border: '1px solid #ef444455',
                    }}
                >
                    <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                    <span className="flex-1 break-words">{actionError}</span>
                    <button
                        onClick={() => setActionError(null)}
                        className="shrink-0 opacity-70 hover:opacity-100"
                        title="Schließen"
                    >
                        ×
                    </button>
                </div>
            )}

            {/* List */}
            <div className={`flex-1 min-h-0 overflow-y-auto flex flex-col ${striped ? 'gap-0' : 'gap-1'} pr-1`}>
                {visible.length === 0 ? (
                    <div
                        className="flex flex-col items-center justify-center h-full gap-1"
                        style={{ fontSize: '0.92em', color: 'var(--text-secondary)' }}
                    >
                        {connected ? (
                            instances.length === 0 ? (
                                <>Lade Instanzen…</>
                            ) : (
                                <>
                                    <AlertTriangle size={14} />
                                    Keine Treffer
                                </>
                            )
                        ) : (
                            <>Nicht verbunden</>
                        )}
                    </div>
                ) : (
                    visible.map((inst, i) => (
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
                            transparent={transparent}
                            striped={striped}
                            index={i}
                            buttonSize={buttonSize}
                            onRestart={restartInstance}
                            onUpdate={installUpdate}
                        />
                    ))
                )}
            </div>
        </div>
    );
}
