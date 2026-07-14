import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { resolveHtmlAssets } from './utils/assetUrl';
import { useParams, useNavigate } from 'react-router-dom';
import { Sun, Moon, Settings } from 'lucide-react';
import {
    useIoBroker,
    setStateDirect,
    getStateDirect,
    subscribeStateDirect,
    subscribeDpValue,
    prefetchStates,
    setOptimisticEcho,
    getObjectViewDirect,
    setBackendTimingSink,
} from './hooks/useIoBroker';
import { useCustomJs } from './hooks/useCustomJs';
import { useCustomCss } from './hooks/useCustomCss';
import { useConfigSync } from './hooks/useConfigSync';
import { useActiveSelectionSync } from './hooks/useActiveSelectionSync';
import { useVersionGuard } from './hooks/useVersionGuard';
import { useConnectionStore } from './store/connectionStore';
import { useGlobalSettingsStore } from './store/globalSettingsStore';
import { useConfigStore } from './store/configStore';
import { useDashboardStore, resolveView, resolveTabBarSettings } from './store/dashboardStore';
import { useNavigationStore } from './store/navigationStore';
import { useThemeStore } from './store/themeStore';
import { getTheme } from './themes';
import { useGroupStore } from './store/groupStore';
import { loadConfigFromIoBroker, applyRaw } from './utils/configLoader';
import { Dashboard } from './components/layout/Dashboard';
import { FocusedWidgetContext } from './contexts/FocusedWidgetContext';
import { TabBar } from './components/layout/TabBar';
import { LayoutDrawer } from './components/layout/LayoutDrawer';
import { useIframeStore } from './store/iframeStore';
import { useEffectiveThemeId, useEffectiveCustomVars, useEffectiveSettings } from './hooks/useEffectiveSettings';
import { useT } from './i18n';
import { applyCustomFormat, fmtTime, fmtDate } from './utils/clockUtils';
import type { Tab } from './store/dashboardStore';
import type { FrontendSettings } from './store/configStore';

import { discardPending } from './store/persistManager';
import { markGroupDefsHydrated } from './store/groupDefsStore';
import { usePopupConfigStore } from './store/popupConfigStore';
import { NS } from './utils/namespace';
import { baseDpId } from './utils/dpRef';
import { initPerfMetrics, setPerfTracking, reportBackendPing } from './utils/perfMetrics';
import { setBreakdownTracking, recordBackendCall } from './utils/perfBreakdown';

// Module-level cache of the active themeMode.frontend DP override. Lets the
// DP listener win over delayed config rehydrations and the followBrowser
// effect, which would otherwise overwrite the DP-driven setTheme call.
const themeModeOverride: { value: 'dark' | 'light' | null } = { value: null };

const STORE_REHYDRATORS: Record<string, () => void> = {
    'aura-dashboard': () => useDashboardStore.persist.rehydrate(),
    'aura-theme': () => useThemeStore.persist.rehydrate(),
    'aura-groups': () => useGroupStore.persist.rehydrate(),
    'aura-config': () => useConfigStore.persist.rehydrate(),
    'aura-group-defs': () => {
        const v = localStorage.getItem('aura-group-defs');
        if (v) applyRaw('aura-group-defs', v);
    },
    'aura-popup-config': () => usePopupConfigStore.persist.rehydrate(),
};

// ── HeaderClock ────────────────────────────────────────────────────────────

function HeaderClock({ f }: { f: FrontendSettings }) {
    const t = useT();
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(id);
    }, []);

    if (f.headerClockCustomFormat) {
        return (
            <span className="text-sm font-medium tabular-nums" style={{ color: 'var(--text-primary)' }}>
                {applyCustomFormat(now, f.headerClockCustomFormat, t)}
            </span>
        );
    }

    const timeStr = fmtTime(now, f.headerClockShowSeconds);
    const dateStr = fmtDate(now, f.headerClockDateLength, t);

    if (f.headerClockDisplay === 'datetime') {
        return (
            <div className="flex flex-col items-end leading-tight">
                <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>
                    {timeStr}
                </span>
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {dateStr}
                </span>
            </div>
        );
    }

    const text = f.headerClockDisplay === 'date' ? dateStr : timeStr;
    return (
        <span className="text-sm font-medium tabular-nums" style={{ color: 'var(--text-primary)' }}>
            {text}
        </span>
    );
}

// ── HeaderDatapoint ────────────────────────────────────────────────────────

function HeaderDatapoint({ id, template }: { id: string; template?: string }) {
    const [val, setVal] = useState<string>('…');
    useEffect(() => {
        if (!id) return;
        const unsub = subscribeDpValue(id, (value) => {
            setVal(value != null ? String(value) : '–');
        });
        return unsub;
    }, [id]);

    if (template) {
        return (
            <span
                className="text-sm font-medium"
                style={{ color: 'var(--text-primary)' }}
                dangerouslySetInnerHTML={{ __html: resolveHtmlAssets(template.replace(/\{dp\}/g, val)) }}
            />
        );
    }

    return (
        <span className="text-sm font-medium tabular-nums" style={{ color: 'var(--text-primary)' }}>
            {val}
        </span>
    );
}

// ── ConnectionBadge ────────────────────────────────────────────────────────

function ConnectionBadge() {
    const { connected } = useIoBroker();
    return (
        <div
            className="flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium"
            style={{
                background: connected ? 'var(--accent-green)22' : 'var(--accent-red)22',
                color: connected ? 'var(--accent-green)' : 'var(--accent-red)',
            }}
        >
            <span
                className={`w-2 h-2 rounded-full ${connected ? 'animate-pulse' : ''}`}
                style={{ background: connected ? 'var(--accent-green)' : 'var(--accent-red)' }}
            />
            {connected ? 'Verbunden' : 'Getrennt'}
        </div>
    );
}

// ── ConnectionIndicator ────────────────────────────────────────────────────
// Fixed-overlay dot: green for 2 s on startup, red while disconnected.
// Always rendered; visible/hidden via opacity so it never shifts layout.
// When the full badge is active it already shows "Getrennt" – the dot is
// then suppressed for disconnects to avoid duplication.

function ConnectionIndicator({ showBadge }: { showBadge: boolean }) {
    const { connected } = useIoBroker();
    const [startupVisible, setStartupVisible] = useState(true);
    const wasConnectedRef = useRef(false);
    const [everConnected, setEverConnected] = useState(false);

    // On first connect: mark, then hide green dot after 2 s
    useEffect(() => {
        if (!connected) return;
        if (!wasConnectedRef.current) {
            wasConnectedRef.current = true;
            setEverConnected(true);
            const t = setTimeout(() => setStartupVisible(false), 2000);
            return () => clearTimeout(t);
        }
    }, [connected]);

    // Disconnect dot: red, only relevant once we were connected before
    const disconnectDot = everConnected && !connected && !showBadge;

    const visible = startupVisible || disconnectDot;
    const color = startupVisible && connected ? 'var(--accent-green)' : 'var(--accent-red)';
    // Suppress startup dot if badge covers it and we're connected (badge shows "Verbunden")
    const suppressed = startupVisible && connected && showBadge;

    if (!visible || suppressed) return null;

    return (
        <div className="fixed top-3 right-3 z-50 pointer-events-none">
            <span
                className={`block w-3 h-3 rounded-full ${connected ? 'animate-pulse' : ''}`}
                style={{ background: color, boxShadow: `0 0 6px ${color}` }}
            />
        </div>
    );
}

// ── ClientIdBadge ───────────────────────────────────────────────────────────
// Opt-in overlay (global setting, toggled in Settings → Connected Devices) that
// shows THIS device its own client ID, so it can be identified without opening
// the backend. Tap to copy. Fixed bottom-left so it clears the connection dot.

function ClientIdBadge() {
    const { clientId, clientName } = useConnectionStore();
    const [copied, setCopied] = useState(false);

    const copy = () => {
        void navigator.clipboard?.writeText(clientId).then(
            () => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
            },
            () => {},
        );
    };

    return (
        <button
            onClick={copy}
            className="fixed bottom-3 left-3 z-50 flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-mono shadow-lg hover:opacity-90"
            style={{
                background: 'var(--app-surface)',
                color: 'var(--text-primary)',
                border: '1px solid var(--app-border)',
            }}
            title="Client-ID kopieren"
        >
            {clientName && (
                <span className="font-sans font-medium" style={{ color: 'var(--text-secondary)' }}>
                    {clientName}
                </span>
            )}
            <span>
                {copied ? '✓ ' : ''}ID: {clientId}
            </span>
        </button>
    );
}

// Scan widget options for ioBroker DP IDs to warm the prefetch cache.
// Recognizes values in keys whose name ends with "Dp", "Datapoint", or equals "datapoint"/"dpId".
function collectOptionDps(obj: unknown, ids: Set<string>): void {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) {
        obj.forEach((item) => collectOptionDps(item, ids));
        return;
    }
    for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
        const k = key.toLowerCase();
        if (
            typeof val === 'string' &&
            val &&
            (k === 'datapoint' || k === 'dpid' || k.endsWith('dp') || k.endsWith('datapoint'))
        ) {
            // Strip any JSON-path suffix — the cache is warmed per bare state ID.
            ids.add(baseDpId(val));
        } else if (val && typeof val === 'object') {
            collectOptionDps(val, ids);
        }
    }
}

export default function App() {
    const { tabSlug, layoutSlug, sectionSlug } = useParams<{
        tabSlug?: string;
        layoutSlug?: string;
        sectionSlug?: string;
    }>();
    const navigate = useNavigate();
    const { frontend } = useConfigStore();
    const { setTheme } = useThemeStore();
    const clearSectionSettings = useDashboardStore((s) => s.clearSectionSettings);
    const { connected, subscribe } = useIoBroker();
    const { clientId, clientName } = useConnectionStore();

    // Wire up passive frontend load-time metrics (initial load, FCP, long tasks).
    useEffect(() => {
        initPerfMetrics();
        // Read the adapter's performance-tracking switches from its native config
        // and gate recording accordingly. perfTracking (page metrics + backend
        // round-trip timing) defaults on; perfWidgetTracking (the costly per-widget
        // instrumentation) defaults off — both overridable in the adapter settings.
        void (async () => {
            try {
                const res = await getObjectViewDirect('instance', 'system.adapter.aura.', 'system.adapter.aura.香');
                const native = (res.rows?.[0]?.value as unknown as { native?: Record<string, unknown> })?.native ?? {};
                const perfTracking = native.perfTracking !== false;
                const perfWidgetTracking = native.perfWidgetTracking === true;
                setPerfTracking(perfTracking);
                setBreakdownTracking({ backend: perfTracking, widget: perfWidgetTracking });
                setBackendTimingSink(perfTracking ? recordBackendCall : null);
            } catch {
                /* config unreadable — keep defaults (page metrics on, per-widget off) */
                setBreakdownTracking({ backend: true, widget: false });
                setBackendTimingSink(recordBackendCall);
            }
        })();
    }, []);

    // Measure a backend round-trip (RTT) once the socket is connected — a clean
    // network-latency signal (spikes over VPN) independent of device/render cost.
    const pingedRef = useRef(false);
    useEffect(() => {
        if (connected && !pingedRef.current) {
            pingedRef.current = true;
            void reportBackendPing();
        }
    }, [connected]);

    // Determine which layout + section to display based on the URL slugs.
    // resolveView also handles legacy `/view/<oldLayoutSlug>` links (old layouts
    // are now sections of the migrated default layout).
    const allLayouts = useDashboardStore((s) => s.layouts);
    const view = useMemo(() => resolveView(allLayouts, layoutSlug, sectionSlug), [allLayouts, layoutSlug, sectionSlug]);
    const layout = view?.layout;
    const section = view?.section;
    const tabs = useMemo<Tab[]>(() => section?.tabs ?? [], [section?.tabs]);

    // Effective settings cascade: global → layout → section (per-section overrides).
    const effectiveThemeId = useEffectiveThemeId(layout?.id, section?.id);
    const effectiveCustomVars = useEffectiveCustomVars(layout?.id, section?.id);
    const effectiveSettings = useEffectiveSettings(layout?.id, section?.id);
    const currentTheme = getTheme(effectiveThemeId);

    // URL base for the current layout+section context. The section segment is only
    // added when the layout has more than one section (single-section layouts keep
    // the shorter `/view/<layout>` form).
    const viewBase = useMemo(() => {
        if (!layout) return '';
        const parts = [`/view/${layout.slug}`];
        if (section && layout.sections.length > 1) parts.push(`s/${section.slug}`);
        return parts.join('/');
    }, [layout, section]);

    // Track viewport width so a docked sidebar layout menu can collapse into an
    // overlay hamburger on mobile — matching the same breakpoint the Dashboard
    // uses to switch to its single-column stack. When the viewport grows back
    // past the breakpoint the sidebar re-docks automatically.
    const [viewportWidth, setViewportWidth] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 0));
    useEffect(() => {
        const onResize = () => setViewportWidth(window.innerWidth);
        window.addEventListener('resize', onResize);
        window.addEventListener('orientationchange', onResize);
        return () => {
            window.removeEventListener('resize', onResize);
            window.removeEventListener('orientationchange', onResize);
        };
    }, []);
    const mobileBreakpoint = effectiveSettings.mobileBreakpoint ?? 600;
    const isMobileViewport = viewportWidth > 0 && viewportWidth < mobileBreakpoint;

    // ── Prefetch (silent, background) ────────────────────────────────────────
    // Warm the state cache for the active tab before widgets mount so they render
    // with real values immediately. Other tabs are prefetched silently in the
    // background after the active tab is ready — no loading screen, no blocking.
    const prefetchDoneRef = useRef(false);

    const datapointsForTab = useCallback(
        (tabId: string): string[] => {
            const tab = tabs.find((t) => t.id === tabId);
            if (!tab) return [];
            const ids = new Set<string>();
            (tab.widgets ?? []).forEach((w) => {
                if (w.datapoint) ids.add(baseDpId(w.datapoint));
                if (w.options) collectOptionDps(w.options, ids);
            });
            return [...ids];
        },
        [tabs],
    );

    // ── Local active tab state (frontend only — doesn't affect admin editor)
    // URL slug takes priority; fall back to defaultTabId or first tab
    const [activeTabId, setActiveTabId] = useState<string>(() => {
        if (tabSlug && section?.tabs) {
            const tab = section.tabs.find((t) => (t.slug ?? t.id) === tabSlug);
            if (tab) return tab.id;
        }
        return section?.defaultTabId ?? section?.activeTabId ?? tabs[0]?.id ?? '';
    });

    // Mirror the currently displayed layout / section / tab into read-only DPs
    // (aura.<n>.info.active{Layout,Section,Tab}) so scripts can react to it.
    const activeTab = useMemo(() => tabs.find((t) => t.id === activeTabId), [tabs, activeTabId]);
    useActiveSelectionSync(connected, layout, section, activeTab);

    // Prefetch active tab on connect, then background-prefetch remaining tabs.
    // Dashboard is always visible immediately — no blocking on prefetch completion.
    useEffect(() => {
        if (!connected || prefetchDoneRef.current || !activeTabId) return;
        prefetchDoneRef.current = true;
        const activeIds = datapointsForTab(activeTabId);
        prefetchStates(activeIds).then(() => {
            // After active tab is warm, silently prefetch remaining tabs
            const otherIds = tabs.filter((t) => t.id !== activeTabId).flatMap((t) => datapointsForTab(t.id));
            if (otherIds.length > 0) void prefetchStates(otherIds);
        });
    }, [connected, activeTabId, datapointsForTab, tabs]);

    // Reset active tab when the layout's tabs change (e.g. after ioBroker config
    // rehydration). Depend on layout.tabs (not just layout.id) because the loaded
    // layout often keeps the same id as the default (layout-default) while its
    // tabs change completely — without re-validating, activeTabId stays on the
    // stale "default" tab and Dashboard renders nothing in a fresh session.
    // Always respect URL slug first so F5 stays on the correct tab.
    useEffect(() => {
        if (!section?.tabs?.length) return;
        if (tabSlug) {
            const tab = section.tabs.find((t) => (t.slug ?? t.id) === tabSlug);
            if (tab) {
                if (tab.id !== activeTabId) setActiveTabId(tab.id);
                return;
            }
        }
        if (section.tabs.some((t) => t.id === activeTabId)) return;
        setActiveTabId(section.defaultTabId ?? section.tabs[0].id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [layout?.id, section?.id, section?.tabs, tabSlug]);

    // If active tab is disabled, jump to the first visible (non-disabled, non-hidden) tab.
    // Hidden tabs are intentionally not bounced: they stay reachable via their direct slug URL.
    useEffect(() => {
        const active = tabs.find((t) => t.id === activeTabId);
        if (!active || !active.disabled) return;
        const next = tabs.find((t) => !t.disabled && !t.hidden) ?? tabs.find((t) => !t.disabled);
        if (next) setActiveTabId(next.id);
    }, [tabs, activeTabId]);

    // Clear iFrame fullscreen overlay whenever the active tab changes.
    const setIframeFullscreen = useIframeStore((s) => s.setFullscreen);
    useEffect(() => {
        setIframeFullscreen(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTabId]);

    // Silently warm cache for newly-visited tabs (background, non-blocking)
    useEffect(() => {
        if (!connected || !activeTabId) return;
        const ids = datapointsForTab(activeTabId);
        if (ids.length > 0) void prefetchStates(ids);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTabId, connected]);

    // Keep the module-level optimistic-write flag in sync with the setting.
    useEffect(() => {
        setOptimisticEcho(frontend.optimisticUpdates !== false);
    }, [frontend.optimisticUpdates]);

    // Idle-return: switch to the layout default after configured inactivity period
    const idleReturnEnabled = effectiveSettings.idleReturnEnabled;
    const idleReturnDelay = effectiveSettings.idleReturnDelay ?? 30;
    // Jump back to the layout default via the URL (not setActiveTabId directly).
    // The default is layout-scoped: the layout's default section and, within it,
    // that section's default tab — regardless of which section/tab the viewer
    // drifted onto (a kiosk left on a secondary section must still come home).
    // Driving the route slug keeps it in sync with activeTabId exactly like a
    // manual tab click does. Setting activeTabId alone left the slug pointing at
    // the previously-viewed tab, so re-clicking that tab was a no-op navigation
    // (slug unchanged → sync effect never fired) and the tab bar felt dead until
    // the user clicked a different tab first. Kept in a ref so the timer always
    // sees the latest layout/route without re-subscribing the listeners.
    const idleReturnNavRef = useRef<() => void>(() => {});
    idleReturnNavRef.current = () => {
        if (!layout) return;
        const targetSection = layout.sections.find((sec) => sec.id === layout.defaultSectionId) ?? layout.sections[0];
        if (!targetSection) return;
        const defaultTabId = targetSection.defaultTabId ?? targetSection.tabs[0]?.id ?? '';
        if (!defaultTabId) return;
        // Already exactly on the default section + default tab → nothing to do.
        if (targetSection.id === section?.id && defaultTabId === activeTabId) return;
        const defaultTab = targetSection.tabs.find((t) => t.id === defaultTabId);
        const tabSlugPart = defaultTab?.slug ?? defaultTabId;
        const base =
            layout.sections.length > 1 ? `/view/${layout.slug}/s/${targetSection.slug}` : `/view/${layout.slug}`;
        navigate(`${base}/tab/${tabSlugPart}`);
    };
    useEffect(() => {
        if (!idleReturnEnabled) return;
        let timer: ReturnType<typeof setTimeout>;
        const reset = () => {
            clearTimeout(timer);
            timer = setTimeout(() => idleReturnNavRef.current(), idleReturnDelay * 1000);
        };
        const events = ['pointermove', 'keydown', 'touchstart', 'click'] as const;
        events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
        reset();
        return () => {
            clearTimeout(timer);
            events.forEach((e) => window.removeEventListener(e, reset));
        };
    }, [idleReturnEnabled, idleReturnDelay]);

    // Handle widget click-action tab/layout navigation
    const consumeNav = useNavigationStore((s) => s.consume);
    const pendingNav = useNavigationStore((s) => s.pending);
    const focusWidgetId = useNavigationStore((s) => s.focusWidgetId);
    const setFocusWidget = useNavigationStore((s) => s.setFocusWidget);
    useEffect(() => {
        if (!pendingNav) return;
        const nav = consumeNav();
        if (!nav) return;
        // A navigation intent may reference the layout directly, or (legacy click
        // actions / migrated links) reference what is now a section by its old
        // layoutId. Resolve the target layout + section + tab across the tree.
        const allL = useDashboardStore.getState().layouts;
        let targetLayout = allL.find((l) => l.id === nav.layoutId);
        let targetSection = targetLayout?.sections.find((sec) => sec.id === nav.sectionId);
        // Find the section (and its layout) that actually holds the target tab.
        if (!targetSection) {
            for (const l of allL) {
                const sec = l.sections.find((s) => s.tabs.some((t) => t.id === nav.tabId));
                if (sec) {
                    targetLayout = l;
                    targetSection = sec;
                    break;
                }
            }
        }
        if (!targetLayout || !targetSection) return;
        const targetTab = targetSection.tabs.find((t) => t.id === nav.tabId);
        if (!targetTab) return;
        const tabSl = targetTab.slug ?? targetTab.id;
        const base =
            targetLayout.sections.length > 1
                ? `/view/${targetLayout.slug}/s/${targetSection.slug}`
                : `/view/${targetLayout.slug}`;
        navigate(`${base}/tab/${tabSl}`);
        // Sprung: Widget — pulse-highlight the target widget once the tab is shown.
        // WidgetFrame reads FocusedWidgetContext and applies the highlight while it
        // matches its config.id; setting it after the route switch also scrolls it
        // into view on the freshly mounted tab.
        if (nav.widgetId) setFocusWidget(nav.widgetId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pendingNav]);

    // Clear the widget highlight after the pulse animation has had time to play.
    useEffect(() => {
        if (!focusWidgetId) return;
        const tid = setTimeout(() => setFocusWidget(null), 3500);
        return () => clearTimeout(tid);
    }, [focusWidgetId, setFocusWidget]);

    // Sync cross-tab localStorage changes (admin panel → frontend)
    useEffect(() => {
        const handler = (e: StorageEvent) => {
            if (e.key && STORE_REHYDRATORS[e.key]) STORE_REHYDRATORS[e.key]();
        };
        window.addEventListener('storage', handler);
        return () => window.removeEventListener('storage', handler);
    }, []);

    // Apply effective custom CSS (per-section/layout overrides global when set)
    useCustomCss(layout?.id, section?.id, false);

    // Custom JS — runs always in frontend; installs window.aura helper API.
    useCustomJs(layout?.id, section?.id, false);

    // Apply per-layout theme overrides on top of global ThemeProvider vars.
    // Written as a scoped <style> rule ([data-aura-app="frontend"] { ... }) so that
    // CSS custom-property inheritance overrides :root values without conflicting with
    // ThemeProvider's effect on document.documentElement (parent effects run after child effects).
    const layoutThemeRef = useRef<HTMLStyleElement | null>(null);
    useEffect(() => {
        const ls = section?.settings;
        if (!ls?.themeId && !ls?.customVars && !ls?.fontScale) {
            if (layoutThemeRef.current) layoutThemeRef.current.textContent = '';
            return;
        }
        if (!layoutThemeRef.current) {
            layoutThemeRef.current = document.createElement('style');
            layoutThemeRef.current.id = 'aura-layout-theme';
            document.head.appendChild(layoutThemeRef.current);
        }
        const vars = { ...currentTheme.vars, ...effectiveCustomVars };
        const declarations = Object.entries(vars)
            .filter(([, v]) => v)
            .map(([k, v]) => `  ${k}: ${v};`)
            .join('\n');
        const fontScaleDecl = ls?.fontScale !== undefined ? `\n  --font-scale: ${ls.fontScale};` : '';
        layoutThemeRef.current.textContent = `[data-aura-app="frontend"] {\n${declarations}${fontScaleDecl}\n}`;
    }, [layout?.id, section?.id, section?.settings, currentTheme, effectiveCustomVars]);

    // ── Load config from ioBroker on first connect ────────────────────────────
    // Frontend is read-only — clear the pending Map after loading remote config.
    // On first store mount in a fresh session (incognito, new device) Zustand
    // persist writes its default state via managedStorage.setItem, which
    // populates `pending` and makes isDirty() return true forever. That would
    // make useConfigSync skip every incoming stateChange (admin layout edits
    // would never propagate without F5).
    const ioBrokerConfigLoaded = useRef(false);
    useEffect(() => {
        if (!connected || ioBrokerConfigLoaded.current) return;
        ioBrokerConfigLoaded.current = true;
        // Frontend is read-only: ignore _dirty flags (any "dirty" here is just
        // navigation state — remote always wins). includeGlobalSettings=true so
        // defaultDecimals (and other global settings) come from ioBroker rather
        // than each browser's stale localStorage — otherwise a browser that never
        // had the setting written locally renders with the store default (e.g.
        // 2 decimals) while another shows the configured 0.
        void loadConfigFromIoBroker(true, { ignoreDirty: true }).finally(() => {
            markGroupDefsHydrated(); // unblock group-defs saves even if remote was empty
            discardPending();
        });
    }, [connected]);

    // React to external changes on aura.0.config.dashboard (subscription + polling)
    useConfigSync(connected, ioBrokerConfigLoaded, { ignoreDirty: true });

    // Detect adapter upgrades: if the live adapter version diverges from the
    // bundled one (e.g. after a npm install of a new aura release), reload.
    useVersionGuard();

    // ── Browser-theme sync ────────────────────────────────────────────────────
    // Subscribes to the theme store so it re-applies the correct theme whenever
    // a config sync rehydrates the store and overwrites themeId.
    useEffect(() => {
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        const applyIfFollowing = () => {
            if (themeModeOverride.value) return; // explicit DP override beats browser
            const {
                followBrowser: fb,
                browserDarkThemeId: dark,
                browserLightThemeId: light,
                themeId,
            } = useThemeStore.getState();
            if (!fb) return;
            const desired = mq.matches ? dark : light;
            if (themeId !== desired) setTheme(desired);
        };
        applyIfFollowing();
        mq.addEventListener('change', applyIfFollowing);
        const unsub = useThemeStore.subscribe(applyIfFollowing);
        return () => {
            mq.removeEventListener('change', applyIfFollowing);
            unsub();
        };
    }, [setTheme]);

    // ── Datapoint-driven dark/light mode ──────────────────────────────────────
    // Subscribes to aura.0.config.themeMode.frontend ('dark'|'light'|''). Mirrors
    // the Sun/Moon button: switches global theme and clears the active layout's
    // themeId override (otherwise the per-layout scoped CSS would mask the
    // global change).
    //
    // Stickiness: also subscribes to the theme store. When loadConfigFromIoBroker
    // (or any other source) rehydrates themeId to a different value while a DP
    // override is active, we snap back so the DP truly wins. Without this guard
    // the frontend briefly flashes to the DP value, then reverts to the saved
    // theme once the config arrives.
    useEffect(() => {
        const applyOverride = () => {
            const v = themeModeOverride.value;
            if (!v) return;
            if (useThemeStore.getState().themeId !== v) setTheme(v);
            if (layout && section?.settings?.themeId) clearSectionSettings(layout.id, section.id, 'themeId');
        };
        const unsubDP = subscribeStateDirect(`${NS}.config.themeMode.frontend`, (state) => {
            if (state?.val == null) return;
            const raw = state.val;
            if (raw === '') {
                themeModeOverride.value = null;
                return;
            }
            if (raw === 'dark' || raw === 'light') themeModeOverride.value = raw;
            else if (raw === true || raw === 1)
                themeModeOverride.value = 'dark'; // legacy boolean
            else if (raw === false || raw === 0)
                themeModeOverride.value = 'light'; // legacy boolean
            else return;
            applyOverride();
        });
        const unsubStore = useThemeStore.subscribe(applyOverride);
        return () => {
            unsubDP();
            unsubStore();
        };
    }, [setTheme, layout?.id, section?.id, section?.settings?.themeId, clearSectionSettings]);

    // Activate tab when URL slug changes
    useEffect(() => {
        if (!tabSlug || !tabs.length) return;
        const tab = tabs.find((t) => (t.slug ?? t.id) === tabSlug);
        if (tab && tab.id !== activeTabId) setActiveTabId(tab.id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tabSlug, layout?.id]);

    // Shared navigate handler used by both global and per-client subscriptions
    const handleNavigate = useCallback(
        (val: string, clearId: string) => {
            if (!val) return;
            if (val.startsWith('http://') || val.startsWith('https://') || val.startsWith('//')) {
                window.location.href = val;
            } else if (val.startsWith('/')) {
                // Absolute in-app route, e.g. "/view/haus/tab/buero" or "/tab/buero"
                navigate(val);
            } else if (val.includes('/')) {
                // navigate.target selector value. New form: "<layout>/<section>/<tab>";
                // legacy form: "<layout>/<tab>" (still supported — resolveView treats a
                // non-matching first segment as a section of the default layout).
                const parts = val.split('/').filter(Boolean);
                if (parts.length >= 3) {
                    navigate(`/view/${parts[0]}/s/${parts[1]}/tab/${parts[2]}`);
                } else if (parts.length === 2) {
                    navigate(`/view/${parts[0]}/tab/${parts[1]}`);
                } else {
                    navigate(`/view/${parts[0]}`);
                }
            } else {
                const tab = tabs.find((t) => (t.slug ?? t.id) === val);
                if (tab) setActiveTabId(tab.id);
            }
            setStateDirect(clearId, '');
        },
        [tabs, navigate],
    );

    // Subscribe to global navigate datapoint (affects all clients)
    useEffect(() => {
        const dp = `${NS}.navigate.url`;
        return subscribe(dp, (state) => {
            handleNavigate(String(state.val ?? '').trim(), dp);
        });
    }, [subscribe, layout?.id, handleNavigate]);

    // Register this client in ioBroker on connect and subscribe to per-client navigate.
    // The server-side name (clients.<id>.info.name) is authoritative: once the client
    // exists we NEVER overwrite it from here. Renames always write that DP directly
    // (see ClientsCard.saveName), so re-pushing the local/UA name on reconnect would only
    // ever clobber a name set from another device (where this device's localStorage
    // clientName is empty and the UA fallback "Linux; Android 10; K" would win).
    // We therefore only register — with the local name or the UA fallback — on FIRST
    // contact, when no server name exists yet.
    // `connected` toggles on every websocket reconnect (~10 min); the ref guards against
    // re-running the check on every reconnect within a session.
    const registeredRef = useRef(false);
    useEffect(() => {
        if (!connected || registeredRef.current) return;

        let cancelled = false;
        void (async () => {
            const existing = await getStateDirect(`${NS}.clients.${clientId}.info.name`);
            if (cancelled) return;
            registeredRef.current = true;
            // Already registered → server name wins; leave it untouched. The userAgent /
            // resolution are still refreshed via the resolution relay on every connect.
            if (existing && String(existing.val ?? '').length > 0) return;

            // First registration: seed the name from this device's stored name, else the
            // UA fallback. Register via relay state (direct setObject is admin-only).
            const initialName = clientName || navigator.userAgent.match(/\(([^)]+)\)/)?.[1] || 'Aura Client';
            setStateDirect(
                `${NS}.clients.register`,
                JSON.stringify({ clientId, name: initialName, userAgent: navigator.userAgent }),
            );
        })();
        return () => {
            cancelled = true;
        };
    }, [connected, clientId, clientName]);

    // Report this client's viewport resolution: once on connect and (debounced)
    // whenever the window is resized or the device rotates. The adapter stores it
    // in clients.<id>.info.resolutionWidth / .resolutionHeight.
    useEffect(() => {
        if (!connected) return;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const report = () =>
            setStateDirect(
                `${NS}.clients.resolution`,
                JSON.stringify({
                    clientId,
                    width: window.innerWidth,
                    height: window.innerHeight,
                    userAgent: navigator.userAgent,
                }),
            );
        report();
        const onResize = () => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(report, 500);
        };
        window.addEventListener('resize', onResize);
        window.addEventListener('orientationchange', onResize);
        return () => {
            if (timer) clearTimeout(timer);
            window.removeEventListener('resize', onResize);
            window.removeEventListener('orientationchange', onResize);
        };
    }, [connected, clientId]);

    // Subscribe to per-client navigate datapoint
    useEffect(() => {
        const dpId = `${NS}.clients.${clientId}.navigate.url`;
        return subscribe(dpId, (state) => {
            handleNavigate(String(state.val ?? '').trim(), dpId);
        });
    }, [subscribe, clientId, layout?.id, handleNavigate]);

    const layoutUrlBase = viewBase;

    const showBadge = effectiveSettings.showHeader && effectiveSettings.showConnectionBadge;
    const showClientIdBadge = useGlobalSettingsStore((s) => s.showClientIdBadge);

    const activeTabSlug = useMemo(() => {
        const t = tabs.find((t) => t.id === activeTabId);
        return t?.slug ?? null;
    }, [tabs, activeTabId]);

    // The section menu (formerly the layout drawer) lists the sections of the
    // active layout and only appears when that layout has more than one visible
    // section — mirroring the old "menu shows only with >1 entry" behaviour.
    const visibleSectionCount = (layout?.sections ?? []).filter((sec) => !sec.hidden).length;
    const drawerEnabled =
        (effectiveSettings.layoutDrawerEnabled ?? false) &&
        (visibleSectionCount > 1 || (effectiveSettings.layoutDrawerShowSingle ?? false));
    const drawerSize = effectiveSettings.layoutDrawerSize ?? 'md';
    const drawerAutoHide = effectiveSettings.layoutDrawerAutoHide ?? false;
    const drawerPlacement = effectiveSettings.layoutDrawerPlacement ?? 'floating';
    // Docked sidebar: always-visible left menu, works with or without header — overrides overlay placements.
    // On mobile it would eat too much horizontal space, so it collapses into the tab bar as an
    // overlay hamburger and re-docks on wider viewports.
    const drawerSidebar = drawerEnabled && drawerPlacement === 'sidebar' && !isMobileViewport;
    const drawerSidebarCollapsed = drawerEnabled && drawerPlacement === 'sidebar' && isMobileViewport;
    const drawerWidth = effectiveSettings.layoutDrawerWidth ?? 240;
    // Docked horizontal section bar (like the tab bar), above or below the dashboard.
    // Works with or without the header — the bar is self-contained (no hamburger).
    const drawerBarTop = drawerEnabled && drawerPlacement === 'top';
    const drawerBarBottom = drawerEnabled && drawerPlacement === 'bottom';
    const drawerBar = drawerBarTop || drawerBarBottom;
    // Tab-bar hamburger: either the explicit tabbar placement, or a docked sidebar that
    // collapsed on mobile — the collapsed sidebar always lands here, even with a header shown.
    const drawerInTabBar =
        (drawerEnabled &&
            !drawerSidebar &&
            !effectiveSettings.showHeader &&
            drawerPlacement === 'tabbar' &&
            !drawerAutoHide) ||
        drawerSidebarCollapsed;
    const drawerFloating =
        drawerEnabled && !drawerSidebar && !drawerBar && !effectiveSettings.showHeader && !drawerInTabBar;
    const drawerShowTitle = effectiveSettings.layoutDrawerShowTitle ?? true;
    const drawerTitle = effectiveSettings.layoutDrawerTitle ?? '';
    const drawerTitleMarginTop = effectiveSettings.layoutDrawerTitleMarginTop ?? 0;
    const drawerTitleMarginBottom = effectiveSettings.layoutDrawerTitleMarginBottom ?? 0;
    const drawerEntryStyle = effectiveSettings.layoutDrawerEntryStyle ?? 'iconAndName';
    const drawerEntryHeight = effectiveSettings.layoutDrawerEntryHeight ?? 48;
    const drawerIndicatorStyle = effectiveSettings.layoutDrawerIndicatorStyle ?? 'filled';
    const drawerFontSize = effectiveSettings.layoutDrawerFontSize ?? 14;
    const drawerIconSize = effectiveSettings.layoutDrawerIconSize ?? 16;
    const drawerItems = effectiveSettings.layoutDrawerItems ?? [];

    // Tab bar can be placed above the dashboard (default) or as a footer below it.
    // Resolve the same global → layout → section cascade the bar itself uses.
    const tabBarAtBottom =
        resolveTabBarSettings(
            resolveTabBarSettings(frontend.tabBar, layout?.settings?.tabBar),
            section?.settings?.tabBar,
        ).position === 'bottom';

    const tabBarNode = (
        <TabBar
            readonly
            layoutId={layout?.id}
            sectionId={section?.id}
            viewTabs={tabs}
            viewActiveTabId={activeTabId}
            onViewTabClick={(tab) => {
                const slug = tab.slug ?? tab.id;
                navigate(viewBase ? `${viewBase}/tab/${slug}` : `/tab/${slug}`);
            }}
            layoutUrlBase={layoutUrlBase}
            headerSlot={
                drawerInTabBar ? (
                    <LayoutDrawer
                        activeLayoutId={layout?.id}
                        activeSectionId={section?.id}
                        size={drawerSize}
                        iconOnly
                        showTitle={drawerShowTitle}
                        drawerTitle={drawerTitle}
                        titleMarginTop={drawerTitleMarginTop}
                        titleMarginBottom={drawerTitleMarginBottom}
                        entryStyle={drawerEntryStyle}
                        entryHeight={drawerEntryHeight}
                        indicatorStyle={drawerIndicatorStyle}
                        fontSize={drawerFontSize}
                        iconSize={drawerIconSize}
                        items={drawerItems}
                    />
                ) : undefined
            }
        />
    );

    // Docked horizontal section bar — rendered above the tab bar (placement 'top')
    // or below it (placement 'bottom'), so the section menu is the outermost strip.
    const sectionMenuBar = drawerBar ? (
        <LayoutDrawer
            activeLayoutId={layout?.id}
            activeSectionId={section?.id}
            variant="bar"
            barPosition={drawerBarBottom ? 'bottom' : 'top'}
            barAlignment={effectiveSettings.layoutDrawerBarAlignment ?? 'left'}
            hideMobileScrollbar={effectiveSettings.layoutDrawerHideMobileScrollbar ?? false}
            drawerTitle={drawerTitle}
            entryStyle={drawerEntryStyle}
            entryHeight={drawerEntryHeight}
            indicatorStyle={drawerIndicatorStyle}
            fontSize={drawerFontSize}
            iconSize={drawerIconSize}
            items={drawerItems}
        />
    ) : null;

    return (
        <div
            data-aura-app="frontend"
            className={`aura-page${layout?.slug ? ` aura-page-${layout.slug}` : ''}${activeTabSlug ? ` aura-${activeTabSlug}` : ''} h-full flex flex-col overflow-hidden`}
            style={{ background: 'var(--app-bg)', color: 'var(--text-primary)' }}
        >
            <ConnectionIndicator showBadge={showBadge} />
            {showClientIdBadge && <ClientIdBadge />}
            {drawerFloating && (
                <LayoutDrawer
                    activeLayoutId={layout?.id}
                    activeSectionId={section?.id}
                    floating
                    size={drawerSize}
                    autoHide={drawerAutoHide}
                    showTitle={drawerShowTitle}
                    drawerTitle={drawerTitle}
                    titleMarginTop={drawerTitleMarginTop}
                    titleMarginBottom={drawerTitleMarginBottom}
                    entryStyle={drawerEntryStyle}
                    entryHeight={drawerEntryHeight}
                    indicatorStyle={drawerIndicatorStyle}
                    fontSize={drawerFontSize}
                    iconSize={drawerIconSize}
                    items={drawerItems}
                />
            )}
            <div className={drawerSidebar ? 'flex-1 min-h-0 flex' : 'contents'}>
                {drawerSidebar && (
                    <LayoutDrawer
                        activeLayoutId={layout?.id}
                        activeSectionId={section?.id}
                        variant="sidebar"
                        width={drawerWidth}
                        topOffset={effectiveSettings.layoutDrawerTopOffset ?? 0}
                        bottomOffset={effectiveSettings.layoutDrawerBottomOffset ?? 0}
                        showTitle={drawerShowTitle}
                        drawerTitle={drawerTitle}
                        titleMarginTop={drawerTitleMarginTop}
                        titleMarginBottom={drawerTitleMarginBottom}
                        entryStyle={drawerEntryStyle}
                        entryHeight={drawerEntryHeight}
                        indicatorStyle={drawerIndicatorStyle}
                        fontSize={drawerFontSize}
                        iconSize={drawerIconSize}
                        items={drawerItems}
                    />
                )}
                <div className={drawerSidebar ? 'flex-1 min-w-0 flex flex-col' : 'contents'}>
                    {effectiveSettings.showHeader && (
                        <header
                            className="aura-header flex items-center justify-between px-4 sm:px-6 py-4 shrink-0"
                            style={{ background: 'var(--app-surface)', borderBottom: '1px solid var(--app-border)' }}
                        >
                            <div className="flex items-center gap-3 min-w-0">
                                {drawerEnabled && !drawerSidebar && !drawerSidebarCollapsed && !drawerBar && (
                                    <LayoutDrawer
                                        activeLayoutId={layout?.id}
                                        activeSectionId={section?.id}
                                        size={drawerSize}
                                        showTitle={drawerShowTitle}
                                        drawerTitle={drawerTitle}
                                        titleMarginTop={drawerTitleMarginTop}
                                        titleMarginBottom={drawerTitleMarginBottom}
                                        entryStyle={drawerEntryStyle}
                                        entryHeight={drawerEntryHeight}
                                        indicatorStyle={drawerIndicatorStyle}
                                        fontSize={drawerFontSize}
                                        iconSize={drawerIconSize}
                                        items={drawerItems}
                                    />
                                )}
                                <h1 className="aura-titel text-xl font-bold tracking-tight truncate">
                                    {effectiveSettings.headerTitle || 'Aura'}
                                </h1>
                            </div>
                            <div className="flex items-center gap-3">
                                {effectiveSettings.headerDatapoint && (
                                    <HeaderDatapoint
                                        id={effectiveSettings.headerDatapoint}
                                        template={effectiveSettings.headerDatapointTemplate || undefined}
                                    />
                                )}
                                {effectiveSettings.headerClockEnabled && <HeaderClock f={effectiveSettings} />}
                                {showBadge && <ConnectionBadge />}
                                {effectiveSettings.showAdminLink && (
                                    <a
                                        href="#/admin"
                                        className="w-8 h-8 flex items-center justify-center rounded-full hover:opacity-80 transition-opacity"
                                        style={{
                                            background: 'var(--app-bg)',
                                            color: 'var(--text-secondary)',
                                            border: '1px solid var(--app-border)',
                                        }}
                                        title="Admin"
                                    >
                                        <Settings size={15} />
                                    </a>
                                )}
                                <button
                                    onClick={() => {
                                        const nextId = currentTheme.dark ? 'light' : 'dark';
                                        themeModeOverride.value = nextId; // seed before setTheme so snap-back doesn't revert
                                        setTheme(nextId);
                                        if (layout && section?.settings?.themeId)
                                            clearSectionSettings(layout.id, section.id, 'themeId');
                                        setStateDirect(`${NS}.config.themeMode.frontend`, nextId);
                                    }}
                                    className="w-8 h-8 flex items-center justify-center rounded-full hover:opacity-80 transition-opacity"
                                    style={{
                                        background: 'var(--app-bg)',
                                        color: 'var(--text-secondary)',
                                        border: '1px solid var(--app-border)',
                                    }}
                                    title={currentTheme.dark ? 'Hell-Modus' : 'Dunkel-Modus'}
                                >
                                    {currentTheme.dark ? <Sun size={15} /> : <Moon size={15} />}
                                </button>
                            </div>
                        </header>
                    )}
                    {drawerBarTop && sectionMenuBar}
                    {!tabBarAtBottom && tabBarNode}
                    <div className="flex-1 min-h-0 flex flex-col">
                        <FocusedWidgetContext.Provider value={focusWidgetId}>
                            <Dashboard
                                readonly
                                viewTabs={tabs}
                                viewActiveTabId={activeTabId}
                                layoutId={layout?.id}
                                sectionId={section?.id}
                            />
                        </FocusedWidgetContext.Provider>
                    </div>
                    {tabBarAtBottom && tabBarNode}
                    {drawerBarBottom && sectionMenuBar}
                </div>
            </div>
        </div>
    );
}
