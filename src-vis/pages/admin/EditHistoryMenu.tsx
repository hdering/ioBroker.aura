/**
 * The history menu in the admin save bar: this session's undo/redo steps as a
 * timeline (click = jump there) and, below it, the saved states from the
 * auto-backup ring (click = restore — undoable, and preceded by a safety
 * snapshot). Portaled into the admin's portal target so it keeps the admin theme.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { History, Undo2, Redo2, RotateCcw, Check, X } from 'lucide-react';
import { useT, type TranslationKey } from '../../i18n';
import { usePortalTarget } from '../../contexts/PortalTargetContext';
import { historyEntries, undo, redo, useEditHistoryStore, type HistoryEntry } from '../../store/editHistory';
import { describeEntry } from '../../store/editHistorySetup';
import { listBackupFiles, loadBackupPayload, isScreenshotMode, type BackupFileEntry } from '../../store/persistManager';
import { restoreBackupPayload } from '../../utils/backupRestore';
import { formatChangeDetails, formatTimestamp } from '../../utils/changeLabels';

const chromeBtn: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-secondary)',
    border: '1px solid var(--app-border)',
};

function SectionTitle({ children }: { children: React.ReactNode }) {
    return (
        <div
            className="px-3 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wide"
            style={{ color: 'var(--text-secondary)' }}
        >
            {children}
        </div>
    );
}

function Empty({ children }: { children: React.ReactNode }) {
    return (
        <p className="px-3 py-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
            {children}
        </p>
    );
}

function StepRow({
    entry,
    label,
    muted,
    title,
    onClick,
}: {
    entry: HistoryEntry;
    label: string;
    muted?: boolean;
    title: string;
    onClick: () => void;
}) {
    const Icon = muted ? Redo2 : Undo2;
    return (
        <button
            type="button"
            onClick={onClick}
            title={title}
            data-history-step={muted ? 'redo' : 'undo'}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:opacity-80 transition-opacity"
            style={{ color: 'var(--text-primary)', opacity: muted ? 0.5 : 1 }}
        >
            <Icon size={11} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
            <span className="shrink-0 tabular-nums text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                {formatTimestamp(entry.ts, 'time')}
            </span>
            <span className="flex-1 min-w-0 truncate text-xs" title={label}>
                {label}
            </span>
        </button>
    );
}

export function EditHistoryMenu() {
    const t = useT();
    const portalTarget = usePortalTarget();
    // Subscribed for re-rendering: every push, merge, undo and redo bumps `version`.
    useEditHistoryStore();
    const [open, setOpen] = useState(false);
    const anchorRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

    const [backups, setBackups] = useState<BackupFileEntry[] | null>(null);
    const [confirmFile, setConfirmFile] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState<'idle' | 'success' | 'error' | 'nodata'>('idle');

    const loadBackups = useCallback(async () => {
        // The harness never talks to the real instance's files.
        if (isScreenshotMode()) {
            setBackups([]);
            return;
        }
        try {
            setBackups(await listBackupFiles());
        } catch {
            setBackups([]);
        }
    }, []);

    useEffect(() => {
        if (!open) return;
        setStatus('idle');
        setConfirmFile(null);
        setBackups(null);
        void loadBackups();
    }, [open, loadBackups]);

    // Below the button, right edges aligned.
    useLayoutEffect(() => {
        if (!open || !anchorRef.current) return;
        const r = anchorRef.current.getBoundingClientRect();
        setPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            const target = e.target as Node;
            if (panelRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
            setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        window.addEventListener('mousedown', onDown);
        window.addEventListener('keydown', onKey);
        return () => {
            window.removeEventListener('mousedown', onDown);
            window.removeEventListener('keydown', onKey);
        };
    }, [open]);

    // Timeline top → bottom: farthest redo … next redo, current, newest undo … oldest.
    const { undo: past, redo: future } = historyEntries();
    const futureRows = [...future].reverse();
    const jumpBack = (times: number) => {
        for (let i = 0; i < times; i++) if (!undo()) break;
    };
    const jumpForward = (times: number) => {
        for (let i = 0; i < times; i++) if (!redo()) break;
    };
    const stepLabel = (e: HistoryEntry) => formatChangeDetails(t, describeEntry(e));

    const backupLabel = (b: BackupFileEntry) =>
        b.details.length > 0
            ? formatChangeDetails(t, b.details)
            : b.changed.map((k) => t(`settings.autobackup.store.${k}` as TranslationKey)).join(', ');

    const doRestore = async (filename: string) => {
        setBusy(true);
        setConfirmFile(null);
        setStatus('idle');
        try {
            const payload = await loadBackupPayload(filename);
            if (!payload) {
                setStatus('nodata');
                return;
            }
            const ok = await restoreBackupPayload(payload);
            setStatus(ok ? 'success' : 'nodata');
            // The safety snapshot and the restore's own backup are new entries.
            if (ok) void loadBackups();
        } catch {
            setStatus('error');
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            <button
                ref={anchorRef}
                type="button"
                onClick={() => setOpen((o) => !o)}
                title={t('admin.history.title')}
                aria-label={t('admin.history.title')}
                aria-expanded={open}
                data-history-menu
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:opacity-80 transition-opacity"
                style={chromeBtn}
            >
                <History size={13} />
            </button>
            {open &&
                pos &&
                createPortal(
                    <div
                        ref={panelRef}
                        data-history-panel
                        className="aura-scroll fixed z-[1000] rounded-xl shadow-2xl overflow-y-auto"
                        style={{
                            top: pos.top,
                            right: pos.right,
                            width: 'min(380px, calc(100vw - 16px))',
                            maxHeight: '70vh',
                            background: 'var(--app-surface)',
                            color: 'var(--text-primary)',
                            border: '1px solid var(--app-border)',
                        }}
                    >
                        <SectionTitle>{t('admin.history.steps')}</SectionTitle>
                        {futureRows.length === 0 && past.length === 0 ? (
                            <Empty>{t('admin.history.empty')}</Empty>
                        ) : (
                            <div className="pb-1">
                                {futureRows.map((e, j) => (
                                    <StepRow
                                        key={e.id}
                                        entry={e}
                                        muted
                                        label={stepLabel(e)}
                                        title={t('admin.history.redoTo')}
                                        onClick={() => jumpForward(futureRows.length - j)}
                                    />
                                ))}
                                <div
                                    className="mx-3 my-1 px-2 py-0.5 rounded text-[10px] font-semibold"
                                    style={{ color: 'var(--accent)', background: 'var(--accent)22' }}
                                >
                                    {t('admin.history.current')}
                                </div>
                                {past.map((e, i) => (
                                    <StepRow
                                        key={e.id}
                                        entry={e}
                                        label={stepLabel(e)}
                                        title={t('admin.history.undoTo')}
                                        onClick={() => jumpBack(i + 1)}
                                    />
                                ))}
                            </div>
                        )}

                        <div className="border-t" style={{ borderColor: 'var(--app-border)' }}>
                            <SectionTitle>{t('admin.history.saved')}</SectionTitle>
                            {backups === null ? (
                                <Empty>{t('admin.history.loading')}</Empty>
                            ) : backups.length === 0 ? (
                                <Empty>{t('settings.autobackup.noBackup')}</Empty>
                            ) : (
                                <div className="pb-1">
                                    {backups.map((b) => {
                                        const text = backupLabel(b);
                                        return (
                                            <div
                                                key={b.filename}
                                                data-history-backup
                                                className="flex items-center gap-2 px-3 py-1.5"
                                            >
                                                <History
                                                    size={11}
                                                    style={{ color: 'var(--text-secondary)', flexShrink: 0 }}
                                                />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-medium truncate">
                                                        {formatTimestamp(b.ts)}
                                                    </p>
                                                    {text && (
                                                        <p
                                                            className="text-[10px] truncate"
                                                            style={{ color: 'var(--text-secondary)' }}
                                                            title={text}
                                                        >
                                                            {text}
                                                        </p>
                                                    )}
                                                </div>
                                                {confirmFile === b.filename ? (
                                                    <div className="flex gap-1 shrink-0">
                                                        <button
                                                            type="button"
                                                            onClick={() => void doRestore(b.filename)}
                                                            className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-white hover:opacity-80"
                                                            style={{ background: 'var(--accent)' }}
                                                        >
                                                            <Check size={11} />{' '}
                                                            {t('settings.autobackup.restoreConfirm')}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setConfirmFile(null)}
                                                            aria-label={t('common.cancel')}
                                                            className="w-6 h-6 flex items-center justify-center rounded hover:opacity-80"
                                                            style={chromeBtn}
                                                        >
                                                            <X size={11} />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        disabled={busy}
                                                        onClick={() => setConfirmFile(b.filename)}
                                                        title={t('settings.autobackup.restore')}
                                                        aria-label={t('settings.autobackup.restore')}
                                                        className="w-6 h-6 flex items-center justify-center rounded hover:opacity-80 disabled:opacity-40 shrink-0"
                                                        style={chromeBtn}
                                                    >
                                                        <RotateCcw size={11} />
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                            {status !== 'idle' && (
                                <p
                                    className="px-3 pb-2 text-[11px] font-medium"
                                    style={{
                                        color: status === 'success' ? 'var(--accent)' : 'var(--accent-red)',
                                    }}
                                >
                                    {status === 'success'
                                        ? t('settings.autobackup.success')
                                        : status === 'error'
                                          ? t('settings.autobackup.error')
                                          : t('settings.autobackup.noData')}
                                </p>
                            )}
                        </div>
                    </div>,
                    portalTarget,
                )}
        </>
    );
}
