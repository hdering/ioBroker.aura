import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { useT } from '../../../../i18n';
import { ToggleRow } from '../shared/SettingControls';
import { ResetDefaultsButton } from '../shared/ResetDefaultsButton';
import { useLayoutSetting } from '../shared/useLayoutSetting';
import { useDashboardStore, type LayoutSettings } from '../../../../store/dashboardStore';
import { useConfigStore } from '../../../../store/configStore';
import { usePopupConfigStore } from '../../../../store/popupConfigStore';
import { useGroupDefsStore } from '../../../../store/groupDefsStore';
import { collectLayoutIconIds } from '../../../../utils/iconInventory';
import { preloadIconIds, type PreloadResult } from '../../../../utils/iconPreload';

const ICON_KEYS: (keyof LayoutSettings)[] = ['iconsOffline'];

/** Ids per status request — well under Node's 16 kB header cap. */
const STATUS_CHUNK = 100;
/** How many missing ids the list shows before it folds. */
const SHOW_MISSING = 40;

interface CacheStatus {
    cached: string[];
    missing: string[];
}

/** Ask the adapter which of the ids it holds on disk — never triggers a fetch. */
async function fetchCacheStatus(ids: readonly string[]): Promise<CacheStatus> {
    const out: CacheStatus = { cached: [], missing: [] };
    for (let i = 0; i < ids.length; i += STATUS_CHUNK) {
        const chunk = ids.slice(i, i + STATUS_CHUNK);
        const res = await fetch(`/icons/status?icons=${encodeURIComponent(chunk.join(','))}`, {
            cache: 'no-store',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as Partial<CacheStatus>;
        out.cached.push(...(body.cached ?? []));
        out.missing.push(...(body.missing ?? []));
    }
    return out;
}

// Icons for devices without internet (#290). Scope-aware: global or per layout
// (contextId = null | layout id). Below the switch the inventory of the scope is
// checked against the adapter's cache, so an installation can see — and fill —
// what its offline devices will get.
export function IconsSection({ contextId }: { contextId: string | null }) {
    const t = useT();
    const { eff, set, resetKeys, isDirty, level, layoutId } = useLayoutSetting(contextId);
    const [enabled] = eff('iconsOffline');

    const layouts = useDashboardStore((s) => s.layouts);
    const tabBar = useConfigStore((s) => s.frontend.tabBar);
    const layoutDrawerItems = useConfigStore((s) => s.frontend.layoutDrawerItems);
    const headerItems = useConfigStore((s) => s.frontend.headerItems);
    const popupViews = usePopupConfigStore((s) => s.views);
    const groupDefs = useGroupDefsStore((s) => s.defs);

    // Layout scope → that layout; global → the union over every layout.
    const ids = useMemo(() => {
        const scoped = layoutId ? layouts.filter((l) => l.id === layoutId) : layouts;
        const all = new Set<string>();
        for (const layout of scoped) {
            for (const id of collectLayoutIconIds({
                layout,
                frontend: { tabBar, layoutDrawerItems, headerItems },
                popupViews,
                groupDefs,
            })) {
                all.add(id);
            }
        }
        return [...all].sort();
    }, [layouts, layoutId, tabBar, layoutDrawerItems, headerItems, popupViews, groupDefs]);

    const [status, setStatus] = useState<CacheStatus | null | 'error'>(null);
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<PreloadResult | null>(null);
    const [showAllMissing, setShowAllMissing] = useState(false);

    const refresh = useCallback(async () => {
        if (!ids.length) {
            setStatus({ cached: [], missing: [] });
            return;
        }
        try {
            setStatus(await fetchCacheStatus(ids));
        } catch {
            setStatus('error');
        }
    }, [ids]);

    useEffect(() => {
        setResult(null);
        void refresh();
    }, [refresh]);

    const preload = async () => {
        setBusy(true);
        try {
            setResult(await preloadIconIds(ids));
        } finally {
            await refresh();
            setBusy(false);
        }
    };

    const missing = status && status !== 'error' ? status.missing : [];
    const shownMissing = showAllMissing ? missing : missing.slice(0, SHOW_MISSING);

    return (
        <div
            className="rounded-xl p-6 space-y-3"
            style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
        >
            <div className="flex items-center justify-between gap-2">
                <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {t('layouts.subtab.icons')}
                </h2>
                <ResetDefaultsButton
                    onReset={() => resetKeys(ICON_KEYS)}
                    disabled={!isDirty(ICON_KEYS)}
                    scoped={level !== 'global'}
                />
            </div>
            <p className="text-xs -mt-1" style={{ color: 'var(--text-secondary)' }}>
                {t('design.icons.hint')}
            </p>

            <ToggleRow
                label={t('settings.frontend.iconsOffline')}
                hint={t('settings.frontend.iconsOfflineHint')}
                value={enabled ?? false}
                onChange={(v) => set('iconsOffline', v)}
            />

            {/* ── Inventory vs. adapter cache ─────────────────────────────── */}
            <div
                className="rounded-lg p-3 space-y-2"
                style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}
                data-testid="icons-inventory"
            >
                <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {t('design.icons.inventoryTitle')}
                    </p>
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            onClick={() => void refresh()}
                            disabled={busy}
                            title={t('design.icons.refresh')}
                            className="p-1.5 rounded-lg hover:opacity-80 disabled:opacity-40"
                            style={{ color: 'var(--text-secondary)' }}
                        >
                            <RefreshCw size={13} />
                        </button>
                        <button
                            type="button"
                            onClick={() => void preload()}
                            disabled={busy || !ids.length}
                            data-testid="icons-preload"
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-80 disabled:opacity-40"
                            style={{
                                background: 'color-mix(in srgb, var(--accent) 15%, transparent)',
                                color: 'var(--accent)',
                                border: '1px solid var(--accent)',
                            }}
                        >
                            <Download size={13} />
                            {busy ? t('design.icons.preloading') : t('design.icons.preload')}
                        </button>
                    </div>
                </div>

                {!ids.length ? (
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {t('design.icons.none')}
                    </p>
                ) : (
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }} data-testid="icons-summary">
                        {layoutId ? t('design.icons.inventoryLayout') : t('design.icons.inventoryAll')}:{' '}
                        <b>{ids.length}</b>
                        {status === 'error' && <> · {t('design.icons.unreachable')}</>}
                        {status && status !== 'error' && (
                            <>
                                {' · '}
                                <b>{status.cached.length}</b> {t('design.icons.cached')}
                                {' · '}
                                <b style={{ color: status.missing.length ? 'var(--warning, #e0a800)' : undefined }}>
                                    {status.missing.length}
                                </b>{' '}
                                {t('design.icons.missing')}
                            </>
                        )}
                    </p>
                )}

                {result && (
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }} data-testid="icons-result">
                        <b>{result.loaded.length}</b> {t('design.icons.resultLoaded')}
                        {' · '}
                        <b>{result.missing.length}</b> {t('design.icons.resultMissing')}
                        {result.pending.length > 0 && (
                            <>
                                {' · '}
                                <b>{result.pending.length}</b> {t('design.icons.resultPending')}
                            </>
                        )}
                    </p>
                )}

                {missing.length > 0 && (
                    <div className="space-y-1.5">
                        <p className="text-[10px]" style={{ color: 'var(--text-secondary)', opacity: 0.8 }}>
                            {t('design.icons.missingHint')}
                        </p>
                        <div className="flex flex-wrap gap-1" data-testid="icons-missing">
                            {shownMissing.map((id) => (
                                <span
                                    key={id}
                                    className="px-1.5 py-0.5 rounded text-[10px] font-mono"
                                    style={{
                                        background: 'color-mix(in srgb, var(--warning, #e0a800) 15%, transparent)',
                                        color: 'var(--text-primary)',
                                    }}
                                >
                                    {id}
                                </span>
                            ))}
                            {missing.length > SHOW_MISSING && !showAllMissing && (
                                <button
                                    type="button"
                                    onClick={() => setShowAllMissing(true)}
                                    className="px-1.5 py-0.5 rounded text-[10px] hover:opacity-80"
                                    style={{ color: 'var(--accent)' }}
                                >
                                    +{missing.length - SHOW_MISSING}
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
