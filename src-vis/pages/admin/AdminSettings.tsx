import { useState, useEffect, useCallback, useRef } from 'react';
import { setupPin } from '../../store/authStore';
import { useActiveLayout } from '../../store/dashboardStore';

import { useConnectionStore } from '../../store/connectionStore';
import { useConfigStore } from '../../store/configStore';
import { useAdminPrefsStore } from '../../store/adminPrefsStore';
import { useGlobalSettingsStore } from '../../store/globalSettingsStore';

import { applyRaw, rehydrateAll } from '../../utils/configLoader';
import { getObjectViewDirect, getStateDirect, setStateDirect } from '../../hooks/useIoBroker';
import {
    saveAll,
    saveToIoBroker,
    listBackupFiles,
    loadBackupPayload,
    buildBackupPayload,
    isScreenshotMode,
    type BackupFileEntry,
    type BackupChangeDetail,
} from '../../store/persistManager';
import {
    Eye,
    EyeOff,
    AlertTriangle,
    RefreshCw,
    Tablet,
    Edit3,
    Check,
    X,
    Trash2,
    History,
    Download,
} from 'lucide-react';
import { useT, type TranslationKey } from '../../i18n';
import { NS } from '../../utils/namespace';

// ── Shared primitives ──────────────────────────────────────────────────────────

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
    return (
        <button
            onClick={() => onChange(!value)}
            className="relative w-9 h-5 rounded-full transition-colors duration-200 focus:outline-none shrink-0"
            style={{ background: value ? 'var(--accent-green)' : 'var(--app-border)' }}
        >
            <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${value ? 'translate-x-4' : 'translate-x-0'}`}
            />
        </button>
    );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
    return (
        <div
            className="flex items-center justify-between py-2 border-b last:border-b-0"
            style={{ borderColor: 'var(--app-border)' }}
        >
            <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                {label}
            </p>
            <Toggle value={value} onChange={onChange} />
        </div>
    );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div
            className="rounded-xl p-4 flex flex-col gap-3"
            style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
        >
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>
                {title}
            </p>
            {children}
        </div>
    );
}

// ── Backup card (manual + auto combined) ──────────────────────────────────────

const BACKUP_SYNC_KEYS = [
    'aura-dashboard',
    'aura-theme',
    'aura-groups',
    'aura-config',
    'aura-global-settings',
    'aura-group-defs',
    'aura-popup-config',
] as const;

interface BackupEntry {
    ts: string;
    filename: string;
    size: number;
    changed: string[];
    details: BackupChangeDetail[];
}

function fmtTs(iso: string): string {
    try {
        return new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(iso));
    } catch {
        return iso;
    }
}

function applyBackupPayload(payload: Record<string, unknown>): boolean {
    let changed = false;
    BACKUP_SYNC_KEYS.forEach((key) => {
        const val = payload[key];
        if (!val) return;
        const str = typeof val === 'string' ? val : JSON.stringify(val);
        if (str.length < 3) return;
        applyRaw(key as Parameters<typeof applyRaw>[0], str);
        changed = true;
    });
    if (!changed) return false;
    rehydrateAll(true);
    // Force ALL sync keys to ioBroker — otherwise keys whose post-rehydrate value
    // byte-matches the restored value aren't marked dirty and stay un-synced,
    // letting the next page load pull stale ioBroker data and silently undo the
    // restore.
    try {
        saveAll();
        saveToIoBroker({ all: true });
    } catch {
        /* quota – non-fatal */
    }
    return true;
}

function BackupCard() {
    const t = useT();
    const tabs = useActiveLayout().tabs;
    const { backupCount, setBackupCount } = useAdminPrefsStore();
    const [backups, setBackups] = useState<BackupEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [confirmIdx, setConfirmIdx] = useState<number | null>(null);
    const [restoringIdx, setRestoringIdx] = useState<number | null>(null);
    const [downloadingIdx, setDownloadingIdx] = useState<number | null>(null);
    const [status, setStatus] = useState<'idle' | 'success' | 'error' | 'nodata'>('idle');

    // Render one structured change detail: a named single change, an aggregated
    // count, or the coarse store-level fallback.
    const fmtDetail = (d: BackupChangeDetail): string => {
        if (d.kind === 'store-changed') return t(`settings.autobackup.store.${d.label}` as TranslationKey);
        if (d.count && d.count > 1)
            return t(`settings.autobackup.change.${d.kind}.n` as TranslationKey, { count: d.count });
        return t(`settings.autobackup.change.${d.kind}` as TranslationKey, { label: d.label ?? '' });
    };

    const loadBackups = useCallback(async () => {
        // Screenshot harness: show one representative entry instead of the real
        // instance's backup files.
        if (isScreenshotMode()) {
            setBackups([
                {
                    ts: '2026-06-17T13:54:02.000Z',
                    filename: 'backup-2026-06-17T13-54-02-000Z.json.gz',
                    size: 61234,
                    changed: ['aura-dashboard'],
                    details: [{ store: 'aura-dashboard', kind: 'widget-added', label: 'CO₂' }],
                },
            ]);
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const files: BackupFileEntry[] = await listBackupFiles();
            setBackups(
                files.map((f) => ({
                    ts: f.ts,
                    filename: f.filename,
                    size: f.size,
                    changed: f.changed,
                    details: f.details,
                })),
            );
        } catch {
            setBackups([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadBackups();
    }, [loadBackups]);

    const doRestore = async (idx: number) => {
        setRestoringIdx(idx);
        setConfirmIdx(null);
        setStatus('idle');
        try {
            const entry = backups[idx];
            if (!entry) {
                setStatus('nodata');
                return;
            }
            const payload = await loadBackupPayload(entry.filename);
            if (!payload) {
                setStatus('nodata');
                return;
            }
            const ok = applyBackupPayload(payload);
            setStatus(ok ? 'success' : 'nodata');
        } catch {
            setStatus('error');
        } finally {
            setRestoringIdx(null);
        }
    };

    const doDownload = async (idx: number) => {
        setDownloadingIdx(idx);
        setStatus('idle');
        try {
            const entry = backups[idx];
            if (!entry) {
                setStatus('nodata');
                return;
            }
            const payload = await loadBackupPayload(entry.filename);
            if (!payload) {
                setStatus('nodata');
                return;
            }
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            // Decompressed plain JSON — drop the .gz so the download name matches content.
            a.download = entry.filename.replace(/\.gz$/, '');
            a.click();
            URL.revokeObjectURL(url);
        } catch {
            setStatus('error');
        } finally {
            setDownloadingIdx(null);
        }
    };

    const exportConfig = () => {
        const payload = buildBackupPayload();
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `aura-backup-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const importConfig = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const data = JSON.parse(ev.target?.result as string) as Record<string, unknown>;
                // New format: { _ts, "aura-dashboard": ..., "aura-group-defs": ..., ... }
                // Legacy format: { dashboard, theme, config, exported } — map to new keys.
                const looksNew = 'aura-dashboard' in data || 'aura-theme' in data;
                const payload: Record<string, unknown> = looksNew
                    ? data
                    : {
                          'aura-dashboard': data.dashboard !== undefined ? JSON.stringify(data.dashboard) : undefined,
                          'aura-theme': data.theme !== undefined ? JSON.stringify(data.theme) : undefined,
                          'aura-config': data.config !== undefined ? JSON.stringify(data.config) : undefined,
                      };
                const ok = applyBackupPayload(payload);
                if (!ok) {
                    alert(t('settings.backup.invalidFile'));
                    return;
                }
                window.location.reload();
            } catch {
                alert(t('settings.backup.invalidFile'));
            }
        };
        reader.readAsText(file);
    };

    const tabCount = tabs.length;

    return (
        <Card title={t('settings.backup.title')}>
            {/* Manual backup */}
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {t('settings.backup.description', { count: tabCount, s: tabCount !== 1 ? 's' : '' })}
            </p>
            <div className="flex flex-col gap-2">
                <button
                    onClick={exportConfig}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-80"
                    style={{ background: 'var(--accent)' }}
                >
                    {t('settings.backup.download')}
                </button>
                <label
                    className="px-4 py-2 rounded-lg text-sm font-medium text-center cursor-pointer hover:opacity-80"
                    style={{
                        background: 'var(--app-bg)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--app-border)',
                    }}
                >
                    {t('settings.backup.import')}
                    <input type="file" accept=".json" onChange={importConfig} className="hidden" />
                </label>
            </div>

            {/* Divider */}
            <div className="border-t mt-1" style={{ borderColor: 'var(--app-border)' }} />

            {/* Auto-backup */}
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {t('settings.autobackup.description')}
            </p>

            <div className="flex items-center gap-2 pt-1 pb-2 border-b" style={{ borderColor: 'var(--app-border)' }}>
                <span className="text-xs flex-1" style={{ color: 'var(--text-secondary)' }}>
                    {t('settings.autobackup.count')}
                </span>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setBackupCount(backupCount - 1)}
                        disabled={backupCount <= 1}
                        className="w-6 h-6 rounded flex items-center justify-center text-sm font-bold hover:opacity-80 disabled:opacity-30"
                        style={{
                            background: 'var(--app-bg)',
                            color: 'var(--text-primary)',
                            border: '1px solid var(--app-border)',
                        }}
                    >
                        −
                    </button>
                    <span className="w-6 text-center text-xs font-mono font-bold" style={{ color: 'var(--accent)' }}>
                        {backupCount}
                    </span>
                    <button
                        onClick={() => setBackupCount(backupCount + 1)}
                        disabled={backupCount >= 20}
                        className="w-6 h-6 rounded flex items-center justify-center text-sm font-bold hover:opacity-80 disabled:opacity-30"
                        style={{
                            background: 'var(--app-bg)',
                            color: 'var(--text-primary)',
                            border: '1px solid var(--app-border)',
                        }}
                    >
                        +
                    </button>
                </div>
                <button
                    onClick={loadBackups}
                    disabled={loading}
                    className="flex items-center justify-center w-6 h-6 rounded hover:opacity-80 disabled:opacity-40"
                    style={{ color: 'var(--text-secondary)' }}
                >
                    <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>

            {status === 'success' && (
                <p className="text-xs font-medium" style={{ color: 'var(--accent-green)' }}>
                    {t('settings.autobackup.success')}
                </p>
            )}
            {(status === 'error' || status === 'nodata') && (
                <p className="text-xs font-medium" style={{ color: 'var(--accent-red)' }}>
                    {status === 'nodata' ? t('settings.autobackup.noData') : t('settings.autobackup.error')}
                </p>
            )}

            {loading ? (
                <p className="text-xs text-center py-3" style={{ color: 'var(--text-secondary)' }}>
                    …
                </p>
            ) : backups.length === 0 ? (
                <p className="text-xs text-center py-3" style={{ color: 'var(--text-secondary)' }}>
                    {t('settings.autobackup.noBackup')}
                </p>
            ) : (
                <div
                    className="aura-scroll rounded-lg mt-1 overflow-y-auto"
                    style={{ border: '1px solid var(--app-border)', flex: '1 1 auto', minHeight: 260, maxHeight: 600 }}
                >
                    {backups.map((b, i) => (
                        <div
                            key={b.ts}
                            className="border-b last:border-b-0"
                            style={{ borderColor: 'var(--app-border)' }}
                        >
                            <div className="flex items-center gap-2 px-3 py-2" style={{ background: 'var(--app-bg)' }}>
                                <History size={11} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                                <div className="flex-1 min-w-0">
                                    <p
                                        className="text-xs font-medium truncate"
                                        style={{ color: 'var(--text-primary)' }}
                                    >
                                        {fmtTs(b.ts)}
                                    </p>
                                    {i === 0 && (
                                        <p className="text-[10px]" style={{ color: 'var(--accent)' }}>
                                            {t('settings.autobackup.latest')}
                                        </p>
                                    )}
                                    {(() => {
                                        const text =
                                            b.details.length > 0
                                                ? b.details.map(fmtDetail).join(', ')
                                                : b.changed
                                                      .map((k) => t(`settings.autobackup.store.${k}` as TranslationKey))
                                                      .join(', ');
                                        if (!text) return null;
                                        return (
                                            <p
                                                className="text-[10px] truncate"
                                                style={{ color: 'var(--text-secondary)' }}
                                                title={text}
                                            >
                                                {t('settings.autobackup.changed')}: {text}
                                            </p>
                                        );
                                    })()}
                                </div>
                                {confirmIdx === i ? (
                                    <div className="flex gap-1.5 shrink-0">
                                        <button
                                            onClick={() => void doRestore(i)}
                                            className="px-2 py-1 rounded text-[11px] font-medium text-white hover:opacity-80"
                                            style={{ background: 'var(--accent)' }}
                                        >
                                            {t('settings.autobackup.restoreConfirm')}
                                        </button>
                                        <button
                                            onClick={() => setConfirmIdx(null)}
                                            className="px-2 py-1 rounded text-[11px] font-medium hover:opacity-80"
                                            style={{
                                                background: 'var(--app-surface)',
                                                color: 'var(--text-secondary)',
                                                border: '1px solid var(--app-border)',
                                            }}
                                        >
                                            {t('common.cancel')}
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex gap-1.5 shrink-0">
                                        <button
                                            onClick={() => void doDownload(i)}
                                            disabled={downloadingIdx !== null || restoringIdx !== null}
                                            title={t('settings.autobackup.download')}
                                            className="w-6 h-6 rounded flex items-center justify-center hover:opacity-80 disabled:opacity-40"
                                            style={{
                                                background: 'var(--app-surface)',
                                                color: 'var(--text-secondary)',
                                                border: '1px solid var(--app-border)',
                                            }}
                                        >
                                            {downloadingIdx === i ? (
                                                <RefreshCw size={11} className="animate-spin" />
                                            ) : (
                                                <Download size={11} />
                                            )}
                                        </button>
                                        <button
                                            onClick={() => {
                                                setConfirmIdx(i);
                                                setStatus('idle');
                                            }}
                                            disabled={restoringIdx !== null}
                                            className="px-2 py-1 rounded text-[11px] font-medium hover:opacity-80 disabled:opacity-40"
                                            style={{
                                                background: 'var(--app-surface)',
                                                color: 'var(--text-secondary)',
                                                border: '1px solid var(--app-border)',
                                            }}
                                        >
                                            {restoringIdx === i
                                                ? t('settings.autobackup.restoring')
                                                : t('settings.autobackup.restore')}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </Card>
    );
}

// ── Clients card (merged: current device + all known clients) ─────────────────

interface ClientInfo {
    channelId: string;
    clientId: string;
    name: string;
    lastSeen: number;
}

function ClientsCard() {
    const t = useT();
    const { clientId: myClientId, clientName: myClientName, setClientName } = useConnectionStore();
    const [clients, setClients] = useState<ClientInfo[]>([]);
    const [loading, setLoading] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    // Scroll the expanded confirm/edit row into view: for devices near the bottom of the
    // scroll container the inline panel would otherwise open below the fold and go unnoticed.
    const expandedRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (confirmDeleteId || editingId) {
            expandedRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }, [confirmDeleteId, editingId]);

    const load = useCallback(async () => {
        // Screenshot harness: show representative devices, not the real clients.
        if (isScreenshotMode()) {
            const now = Date.now();
            setClients([
                {
                    channelId: `${NS}.clients.${myClientId}`,
                    clientId: myClientId,
                    name: 'Wohnzimmer-Tablet',
                    lastSeen: now,
                },
                {
                    channelId: `${NS}.clients.kitchen`,
                    clientId: 'kitchen',
                    name: 'K\u00fcche-Tablet',
                    lastSeen: now - 2 * 3600_000,
                },
                {
                    channelId: `${NS}.clients.office`,
                    clientId: 'office',
                    name: 'B\u00fcro-PC',
                    lastSeen: now - 26 * 3600_000,
                },
            ]);
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const result = await getObjectViewDirect('channel', `${NS}.clients.`, `${NS}.clients.\u9999`);
            // Only direct client channels: aura.0.clients.{clientId} → exactly 4 dot-segments
            const channelRows = result.rows.filter((r) => r.id.split('.').length === 4);
            const data = await Promise.all(
                channelRows.map(async (row) => {
                    const cId = row.id.split('.')[3];
                    const [nameState, lastSeenState] = await Promise.all([
                        getStateDirect(`${row.id}.info.name`),
                        getStateDirect(`${row.id}.info.lastSeen`),
                    ]);
                    return {
                        channelId: row.id,
                        clientId: cId,
                        name: nameState?.val ? String(nameState.val) : cId.slice(0, 8),
                        lastSeen: lastSeenState?.val ? Number(lastSeenState.val) : 0,
                    };
                }),
            );
            // Sort: current device first, then by lastSeen descending
            data.sort((a, b) => {
                if (a.clientId === myClientId) return -1;
                if (b.clientId === myClientId) return 1;
                return b.lastSeen - a.lastSeen;
            });
            setClients(data);
        } finally {
            setLoading(false);
        }
    }, [myClientId]);

    useEffect(() => {
        load();
    }, [load]);

    const startEdit = (c: ClientInfo) => {
        setEditingId(c.clientId);
        setEditValue(c.clientId === myClientId && myClientName ? myClientName : c.name);
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditValue('');
    };

    const saveName = (c: ClientInfo) => {
        const trimmed = editValue.trim();
        if (!trimmed) return;
        // Write directly to ioBroker DP (works for all clients, not just current device)
        setStateDirect(`${c.channelId}.info.name`, trimmed);
        // For the current device, also persist to localStorage (used as fallback)
        if (c.clientId === myClientId) setClientName(trimmed);
        // Update local list immediately
        setClients((prev) => prev.map((x) => (x.clientId === c.clientId ? { ...x, name: trimmed } : x)));
        cancelEdit();
    };

    const deleteClient = (c: ClientInfo) => {
        setConfirmDeleteId(null);
        // Relay deletion via adapter: write clientId to deleteRequest state.
        // main.js listens, calls delForeignObjectAsync recursively, then clears the state.
        setStateDirect(`${NS}.clients.deleteRequest`, c.clientId);
        setClients((prev) => prev.filter((x) => x.clientId !== c.clientId));
    };

    const fmtLastSeen = (ts: number) => {
        if (!ts) return '–';
        const diff = Date.now() - ts;
        if (diff < 60_000) return t('settings.clients.justNow');
        if (diff < 3_600_000) return t('settings.clients.minsAgo', { n: Math.floor(diff / 60_000) });
        if (diff < 86_400_000) return t('settings.clients.hoursAgo', { n: Math.floor(diff / 3_600_000) });
        return t('settings.clients.daysAgo', { n: Math.floor(diff / 86_400_000) });
    };

    const inputStyle = {
        background: 'var(--app-surface)',
        color: 'var(--text-primary)',
        border: '1px solid var(--accent)',
    };

    return (
        <Card title={t('settings.clients.title')}>
            <div className="flex items-center justify-between">
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {t('settings.clients.hint')}
                </p>
                <button
                    onClick={load}
                    disabled={loading}
                    className="flex items-center justify-center w-6 h-6 rounded hover:opacity-80 disabled:opacity-40"
                    style={{ color: 'var(--text-secondary)' }}
                >
                    <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>

            {clients.length === 0 ? (
                <p className="text-xs text-center py-3" style={{ color: 'var(--text-secondary)' }}>
                    {loading ? '…' : t('settings.clients.none')}
                </p>
            ) : (
                <div className="aura-scroll space-y-2 mt-1 overflow-y-auto flex-1" style={{ minHeight: 260 }}>
                    {clients.map((c) => {
                        const isMine = c.clientId === myClientId;
                        const isEditing = editingId === c.clientId;
                        return (
                            <div
                                key={c.clientId}
                                className="rounded-lg overflow-hidden"
                                style={{ border: `1px solid ${isMine ? 'var(--accent)' : 'var(--app-border)'}` }}
                            >
                                {/* Row */}
                                <div
                                    className="flex items-center gap-2.5 px-3 py-2.5"
                                    style={{ background: 'var(--app-bg)' }}
                                >
                                    <Tablet
                                        size={13}
                                        style={{
                                            color: isMine ? 'var(--accent)' : 'var(--text-secondary)',
                                            flexShrink: 0,
                                        }}
                                    />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5">
                                            <p
                                                className="text-sm font-medium truncate"
                                                style={{ color: 'var(--text-primary)' }}
                                            >
                                                {c.name}
                                            </p>
                                            {isMine && (
                                                <span
                                                    className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0"
                                                    style={{ background: 'var(--accent)22', color: 'var(--accent)' }}
                                                >
                                                    {t('settings.clients.thisDevice')}
                                                </span>
                                            )}
                                        </div>
                                        <p
                                            className="text-[10px] font-mono truncate"
                                            style={{ color: 'var(--text-secondary)' }}
                                        >
                                            {c.channelId}.navigate.url
                                        </p>
                                    </div>
                                    <span className="text-xs shrink-0" style={{ color: 'var(--text-secondary)' }}>
                                        {fmtLastSeen(c.lastSeen)}
                                    </span>
                                    <button
                                        onClick={() => (isEditing ? cancelEdit() : startEdit(c))}
                                        className="hover:opacity-70 shrink-0"
                                        style={{ color: isEditing ? 'var(--accent)' : 'var(--text-secondary)' }}
                                    >
                                        <Edit3 size={13} />
                                    </button>
                                    {!isMine && (
                                        <button
                                            onClick={() =>
                                                setConfirmDeleteId(confirmDeleteId === c.clientId ? null : c.clientId)
                                            }
                                            className="hover:opacity-70 shrink-0"
                                            style={{
                                                color:
                                                    confirmDeleteId === c.clientId
                                                        ? 'var(--accent-red, #ef4444)'
                                                        : 'var(--text-secondary)',
                                            }}
                                            title="Gerät löschen"
                                        >
                                            <Trash2 size={13} />
                                        </button>
                                    )}
                                </div>

                                {/* Inline edit */}
                                {isEditing && (
                                    <div
                                        ref={expandedRef}
                                        className="flex items-center gap-2 px-3 py-2.5"
                                        style={{
                                            background: 'var(--app-surface)',
                                            borderTop: '1px solid var(--app-border)',
                                        }}
                                    >
                                        <input
                                            autoFocus
                                            value={editValue}
                                            onChange={(e) => setEditValue(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') saveName(c);
                                                if (e.key === 'Escape') cancelEdit();
                                            }}
                                            placeholder={t('settings.client.namePh')}
                                            className="flex-1 text-sm rounded-lg px-3 py-1.5 focus:outline-none"
                                            style={inputStyle}
                                        />
                                        <button
                                            onClick={() => saveName(c)}
                                            disabled={!editValue.trim() || editValue.trim() === c.name}
                                            className="hover:opacity-70 disabled:opacity-30"
                                            style={{ color: 'var(--accent-green)' }}
                                        >
                                            <Check size={15} />
                                        </button>
                                        <button
                                            onClick={cancelEdit}
                                            className="hover:opacity-70"
                                            style={{ color: 'var(--text-secondary)' }}
                                        >
                                            <X size={15} />
                                        </button>
                                    </div>
                                )}

                                {/* Delete confirmation */}
                                {confirmDeleteId === c.clientId && (
                                    <div
                                        ref={expandedRef}
                                        className="flex items-center gap-2 px-3 py-2.5"
                                        style={{
                                            background: 'var(--app-surface)',
                                            borderTop: '1px solid var(--app-border)',
                                        }}
                                    >
                                        <p className="flex-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                                            Gerät «{c.name}» wirklich löschen?
                                        </p>
                                        <button
                                            onClick={() => deleteClient(c)}
                                            className="text-xs px-2.5 py-1 rounded-lg hover:opacity-80"
                                            style={{ background: 'var(--accent-red, #ef4444)', color: '#fff' }}
                                        >
                                            Löschen
                                        </button>
                                        <button
                                            onClick={() => setConfirmDeleteId(null)}
                                            className="hover:opacity-70"
                                            style={{ color: 'var(--text-secondary)' }}
                                        >
                                            <X size={14} />
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </Card>
    );
}

// ── Default Decimals ────────────────────────────────────────────────────────────

function DefaultDecimalsCard() {
    const { defaultDecimals, setDefaultDecimals } = useGlobalSettingsStore();
    return (
        <Card title="Dezimalstellen (global)">
            <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
                Standardwert für alle Widgets. Einzelne Widgets können diesen Wert überschreiben.
            </p>
            <div className="flex items-center gap-3">
                <input
                    type="number"
                    min={0}
                    max={6}
                    value={defaultDecimals}
                    onChange={(e) => setDefaultDecimals(Math.min(6, Math.max(0, Number(e.target.value))))}
                    className="w-20 rounded-lg px-3 py-2 text-sm focus:outline-none text-center"
                    style={{
                        background: 'var(--app-bg)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--app-border)',
                    }}
                />
                <div className="flex gap-1.5">
                    {[0, 1, 2, 3].map((n) => (
                        <button
                            key={n}
                            onClick={() => setDefaultDecimals(n)}
                            className="w-8 h-8 rounded-lg text-sm font-medium hover:opacity-80"
                            style={{
                                background: defaultDecimals === n ? 'var(--accent)' : 'var(--app-bg)',
                                color: defaultDecimals === n ? '#fff' : 'var(--text-secondary)',
                                border: `1px solid ${defaultDecimals === n ? 'var(--accent)' : 'var(--app-border)'}`,
                            }}
                        >
                            {n}
                        </button>
                    ))}
                </div>
            </div>
        </Card>
    );
}

// ── DP Name Filter ─────────────────────────────────────────────────────────────

function DpNameFilterCard() {
    const { dpNameSuffixes, dpNameReplaceDots, setDpNameSuffixes, setDpNameReplaceDots } = useGlobalSettingsStore();
    return (
        <Card title="DP-Namen bereinigen">
            <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
                Gilt global überall wo DP-Namen angezeigt werden.
            </p>
            <div className="space-y-3">
                <div>
                    <label className="text-xs block mb-1" style={{ color: 'var(--text-secondary)' }}>
                        Suffixe entfernen (kommagetrennt)
                    </label>
                    <input
                        value={dpNameSuffixes}
                        onChange={(e) => setDpNameSuffixes(e.target.value)}
                        placeholder=".STATE, .LEVEL, :1, :2, :3"
                        className="w-full rounded-lg px-3 py-2 text-xs font-mono focus:outline-none"
                        style={{
                            background: 'var(--app-bg)',
                            color: 'var(--text-primary)',
                            border: '1px solid var(--app-border)',
                        }}
                    />
                    <p className="text-[10px] mt-1" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
                        Wird am Ende des Namens abgeschnitten (Groß-/Kleinschreibung egal)
                    </p>
                </div>
                <ToggleRow
                    label="Punkte durch Leerzeichen ersetzen"
                    value={dpNameReplaceDots}
                    onChange={setDpNameReplaceDots}
                />
            </div>
        </Card>
    );
}

// ── Admin Base URL ─────────────────────────────────────────────────────────────

function AdminBaseUrlCard() {
    const t = useT();
    const { frontend, updateFrontend } = useConfigStore();
    return (
        <Card title={t('settings.adminBaseUrl.title')}>
            <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
                {t('settings.adminBaseUrl.description')}
            </p>
            <input
                type="text"
                value={frontend.adminBaseUrl ?? ''}
                onChange={(e) => updateFrontend({ adminBaseUrl: e.target.value })}
                placeholder={`http://${typeof window !== 'undefined' ? window.location.hostname : 'iobroker'}:8081`}
                className="w-full rounded-lg px-3 py-2 text-xs font-mono focus:outline-none"
                style={{
                    background: 'var(--app-bg)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--app-border)',
                }}
            />
            <p className="text-[10px] mt-1" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
                {t('settings.adminBaseUrl.hint')}
            </p>
        </Card>
    );
}

// ── Main ───────────────────────────────────────────────────────────────────────

export function AdminSettings() {
    const t = useT();
    const { frontend, updateFrontend } = useConfigStore();
    const { autoSave, autoSaveDelay, setAutoSave, setAutoSaveDelay } = useAdminPrefsStore();
    const [newPin, setNewPin] = useState('');
    const [confirm, setConfirm] = useState('');
    const [show, setShow] = useState(false);
    const [pinMsg, setPinMsg] = useState('');
    const [showReset, setShowReset] = useState(false);

    const handlePinChange = (e: React.FormEvent) => {
        e.preventDefault();
        if (newPin.length < 4) {
            setPinMsg(t('settings.pin.tooShort'));
            return;
        }
        if (newPin !== confirm) {
            setPinMsg(t('settings.pin.mismatch'));
            return;
        }
        setupPin(newPin);
        setPinMsg(t('settings.pin.success'));
        setNewPin('');
        setConfirm('');
        setTimeout(() => setPinMsg(''), 3000);
    };

    return (
        <div className="p-5 space-y-4">
            <div>
                <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                    {t('settings.title')}
                </h1>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                    {t('settings.subtitle')}
                </p>
            </div>

            {/* Row 0: Language + Editor side by side */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {/* Language */}
                <Card title={t('settings.language.title')}>
                    <div className="flex gap-2">
                        {(['de', 'en'] as const).map((lang) => {
                            const active = (frontend.language ?? 'de') === lang;
                            return (
                                <button
                                    key={lang}
                                    onClick={() => updateFrontend({ language: lang })}
                                    className="flex-1 py-2 rounded-xl text-sm font-medium hover:opacity-80 transition-opacity"
                                    style={{
                                        background: active ? 'var(--accent)' : 'var(--app-bg)',
                                        color: active ? '#fff' : 'var(--text-secondary)',
                                        border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                                    }}
                                >
                                    {lang === 'de'
                                        ? `🇩🇪 ${t('settings.language.de')}`
                                        : `🇬🇧 ${t('settings.language.en')}`}
                                </button>
                            );
                        })}
                    </div>
                </Card>

                {/* Editor */}
                <Card title={t('settings.editor.title')}>
                    <ToggleRow label={t('settings.editor.autoSave')} value={autoSave} onChange={setAutoSave} />
                    {autoSave && (
                        <div className="pt-1">
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                                    {t('settings.editor.delay')}
                                </p>
                                <span
                                    className="text-xs font-mono font-bold px-2 py-0.5 rounded-md"
                                    style={{
                                        background: 'var(--app-bg)',
                                        color: 'var(--accent)',
                                        border: '1px solid var(--app-border)',
                                    }}
                                >
                                    {autoSaveDelay}s
                                </span>
                            </div>
                            <div className="flex gap-1.5 flex-wrap">
                                {[10, 30, 60, 120, 300].map((s) => {
                                    const active = autoSaveDelay === s;
                                    const label = s < 60 ? `${s}s` : `${s / 60} min`;
                                    return (
                                        <button
                                            key={s}
                                            onClick={() => setAutoSaveDelay(s)}
                                            className="px-2.5 py-1 rounded-lg text-xs font-medium hover:opacity-80"
                                            style={{
                                                background: active ? 'var(--accent)' : 'var(--app-bg)',
                                                color: active ? '#fff' : 'var(--text-secondary)',
                                                border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                                            }}
                                        >
                                            {label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                    <p className="text-xs pt-1" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                        {t('settings.editor.ctrlS')}
                    </p>
                </Card>

                {/* Admin-PIN */}
                <Card title={t('settings.pin.title')}>
                    <form onSubmit={handlePinChange} className="space-y-2">
                        <div className="relative">
                            <input
                                type={show ? 'text' : 'password'}
                                value={newPin}
                                onChange={(e) => setNewPin(e.target.value)}
                                placeholder={t('settings.pin.newPin')}
                                className="w-full rounded-lg px-3 py-2 pr-9 text-sm focus:outline-none"
                                style={{
                                    background: 'var(--app-bg)',
                                    color: 'var(--text-primary)',
                                    border: '1px solid var(--app-border)',
                                }}
                            />
                            <button
                                type="button"
                                onClick={() => setShow((s) => !s)}
                                className="absolute right-3 top-1/2 -translate-y-1/2"
                                style={{ color: 'var(--text-secondary)' }}
                            >
                                {show ? <EyeOff size={13} /> : <Eye size={13} />}
                            </button>
                        </div>
                        <input
                            type={show ? 'text' : 'password'}
                            value={confirm}
                            onChange={(e) => setConfirm(e.target.value)}
                            placeholder={t('settings.pin.confirm')}
                            className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                            style={{
                                background: 'var(--app-bg)',
                                color: 'var(--text-primary)',
                                border: '1px solid var(--app-border)',
                            }}
                        />
                        {pinMsg && (
                            <p
                                className="text-xs"
                                style={{
                                    color:
                                        pinMsg.includes('erfolgreich') || pinMsg.includes('successfully')
                                            ? 'var(--accent-green)'
                                            : 'var(--accent-red)',
                                }}
                            >
                                {pinMsg}
                            </p>
                        )}
                        <button
                            type="submit"
                            className="px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-80"
                            style={{ background: 'var(--accent)' }}
                        >
                            {t('settings.pin.save')}
                        </button>
                    </form>
                </Card>

                {/* Super-Admin-Schlüssel */}
                <Card title="Super-Admin-Schlüssel">
                    <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
                        Schützt Standard-Views vor versehentlichem Löschen. Besuche{' '}
                        <code className="font-mono">/admin/popups?key=…</code> um den Modus zu aktivieren. Leer lassen =
                        deaktiviert.
                    </p>
                    <input
                        type="text"
                        value={frontend.superAdminKey}
                        onChange={(e) => updateFrontend({ superAdminKey: e.target.value })}
                        placeholder="Geheimer Schlüssel"
                        className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none font-mono"
                        style={{
                            background: 'var(--app-bg)',
                            color: 'var(--text-primary)',
                            border: '1px solid var(--app-border)',
                        }}
                    />
                </Card>
            </div>

            {/* Row 2: Admin Base URL + DP-Namen + Decimals (equal height) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <AdminBaseUrlCard />
                <DpNameFilterCard />
                <DefaultDecimalsCard />
            </div>

            {/* Row 3: Clients + Backup (both list-heavy, equal height) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ClientsCard />
                <BackupCard />
            </div>

            {/* Reset */}
            <div
                className="rounded-xl p-4"
                style={{ background: 'var(--app-surface)', border: '1px solid var(--accent-red)44' }}
            >
                <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle size={15} style={{ color: 'var(--accent-red)' }} />
                    <p className="text-sm font-semibold" style={{ color: 'var(--accent-red)' }}>
                        {t('settings.reset.title')}
                    </p>
                </div>
                <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
                    {t('settings.reset.description')}
                </p>
                {!showReset ? (
                    <button
                        onClick={() => setShowReset(true)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-80"
                        style={{
                            background: 'var(--accent-red)22',
                            color: 'var(--accent-red)',
                            border: '1px solid var(--accent-red)44',
                        }}
                    >
                        {t('settings.reset.button')}
                    </button>
                ) : (
                    <div className="flex gap-2">
                        <button
                            onClick={() => {
                                ['aura-dashboard', 'aura-theme', 'aura-config'].forEach((k) =>
                                    localStorage.removeItem(k),
                                );
                                window.location.href = '/';
                            }}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium text-white hover:opacity-80"
                            style={{ background: 'var(--accent-red)' }}
                        >
                            {t('settings.reset.confirm')}
                        </button>
                        <button
                            onClick={() => setShowReset(false)}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-80"
                            style={{
                                background: 'var(--app-bg)',
                                color: 'var(--text-secondary)',
                                border: '1px solid var(--app-border)',
                            }}
                        >
                            {t('common.cancel')}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
