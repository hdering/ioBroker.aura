import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Sun, Moon, Settings } from 'lucide-react';
import { useIoBroker, getStateDirect, setStateDirect, subscribeStateDirect, prefetchStates } from './hooks/useIoBroker';
import { useConfigSync } from './hooks/useConfigSync';
import { useConnectionStore } from './store/connectionStore';
import { useConfigStore } from './store/configStore';
import { useDashboardStore, useLayoutBySlug } from './store/dashboardStore';
import { useThemeStore } from './store/themeStore';
import { getTheme } from './themes';
import { useGroupStore } from './store/groupStore';
import { Dashboard } from './components/layout/Dashboard';
import { TabBar } from './components/layout/TabBar';
import { useIframeStore } from './store/iframeStore';
import { useEffectiveSettings, useEffectiveThemeId, useEffectiveCustomVars } from './hooks/useEffectiveSettings';
import { useT } from './i18n';
import { applyCustomFormat, fmtTime, fmtDate } from './utils/clockUtils';
import type { Tab } from './store/dashboardStore';
import type { FrontendSettings } from './store/configStore';

const IOBROKER_CONFIG_KEY = 'aura.0.config.dashboard';
const SYNC_STORE_KEYS = ['aura-dashboard', 'aura-theme', 'aura-groups', 'aura-config'] as const;

const STORE_REHYDRATORS: Record<string, () => void> = {
  'aura-dashboard': () => useDashboardStore.persist.rehydrate(),
  'aura-theme':     () => useThemeStore.persist.rehydrate(),
  'aura-groups':    () => useGroupStore.persist.rehydrate(),
  'aura-config':    () => useConfigStore.persist.rehydrate(),
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
        <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{timeStr}</span>
        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{dateStr}</span>
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
    const unsub = subscribeStateDirect(id, (state) => {
      setVal(state?.val != null ? String(state.val) : '–');
    });
    return unsub;
  }, [id]);

  if (template) {
    return (
      <span
        className="text-sm font-medium"
        style={{ color: 'var(--text-primary)' }}
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: template.replace(/\{dp\}/g, val) }}
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
    <div className="flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium"
      style={{ background: connected ? 'var(--accent-green)22' : 'var(--accent-red)22', color: connected ? 'var(--accent-green)' : 'var(--accent-red)' }}>
      <span className={`w-2 h-2 rounded-full ${connected ? 'animate-pulse' : ''}`}
        style={{ background: connected ? 'var(--accent-green)' : 'var(--accent-red)' }} />
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
  const disconnectDot  = everConnected && !connected && !showBadge;

  const visible = startupVisible || disconnectDot;
  const color   = (startupVisible && connected) ? 'var(--accent-green)' : 'var(--accent-red)';
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

export default function App() {
  const { tabSlug, layoutSlug } = useParams<{ tabSlug?: string; layoutSlug?: string }>();
  const navigate = useNavigate();
  const { frontend } = useConfigStore();
  const { setTheme } = useThemeStore();
  const clearLayoutSettings = useDashboardStore((s) => s.clearLayoutSettings);
  const { connected, subscribe } = useIoBroker();
  const { clientId, clientName } = useConnectionStore();

  const styleRef = useRef<HTMLStyleElement | null>(null);

  // Determine which layout to display based on URL slug
  const layout = useLayoutBySlug(layoutSlug);
  const tabs = useMemo<Tab[]>(() => layout?.tabs ?? [], [layout?.tabs]);

  // Effective settings for the active layout (per-layout overrides + global fallback)
  const effectiveSettings = useEffectiveSettings(layout?.id);
  const effectiveThemeId = useEffectiveThemeId(layout?.id);
  const effectiveCustomVars = useEffectiveCustomVars(layout?.id);
  const currentTheme = getTheme(effectiveThemeId);

  // ── Prefetch + fade-in ────────────────────────────────────────────────────
  // Collect all main datapoints from all tabs, fetch them in one parallel burst
  // before widgets mount, so useDatapoint can read from cache synchronously.
  const [dashboardVisible, setDashboardVisible] = useState(false);
  const [loadTotal, setLoadTotal] = useState(0);
  const prefetchDone = useRef(false);
  // Direct DOM refs so progress updates bypass React batching and render immediately.
  const loadBarRef   = useRef<HTMLDivElement>(null);
  const loadCountRef = useRef<HTMLSpanElement>(null);

  const allDatapoints = useMemo(() => {
    const ids = new Set<string>();
    tabs.forEach((tab) => {
      (tab.widgets ?? []).forEach((w) => {
        if (w.datapoint) ids.add(w.datapoint);
      });
    });
    return [...ids];
  }, [tabs]);

  useEffect(() => {
    if (!connected || prefetchDone.current) return;
    prefetchDone.current = true;
    const total = allDatapoints.length;
    if (total === 0) { setDashboardVisible(true); return; }
    setLoadTotal(total);
    prefetchStates(allDatapoints, (loaded, t) => {
      // Update DOM directly to avoid React batching collapsing all updates into one.
      if (loadBarRef.current)
        loadBarRef.current.style.width = `${Math.round((loaded / t) * 100)}%`;
      if (loadCountRef.current)
        loadCountRef.current.textContent = `${loaded} / ${t} Datenpunkte`;
    }).then(() => setDashboardVisible(true));
  }, [connected, allDatapoints]);

  // ── Local active tab state (frontend only — doesn't affect admin editor)
  // URL slug takes priority; fall back to defaultTabId or first tab
  const [activeTabId, setActiveTabId] = useState<string>(() => {
    if (tabSlug && layout?.tabs) {
      const tab = layout.tabs.find((t) => (t.slug ?? t.id) === tabSlug);
      if (tab) return tab.id;
    }
    return layout?.defaultTabId ?? layout?.activeTabId ?? tabs[0]?.id ?? '';
  });

  // Reset active tab when layout changes (e.g. after ioBroker config rehydration)
  // Always respect URL slug first so F5 stays on the correct tab
  useEffect(() => {
    if (tabSlug) {
      const tab = (layout?.tabs ?? []).find((t) => (t.slug ?? t.id) === tabSlug);
      if (tab) { setActiveTabId(tab.id); return; }
    }
    setActiveTabId(layout?.defaultTabId ?? layout?.tabs?.[0]?.id ?? '');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout?.id]);

  // Clear iFrame fullscreen overlay whenever the active tab changes.
  // The overlay (position: fixed) covers the full viewport; tab switches must always reset it.
  const setIframeFullscreen = useIframeStore((s) => s.setFullscreen);
  useEffect(() => {
    setIframeFullscreen(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId]);

  // Sync cross-tab localStorage changes (admin panel → frontend)
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key && STORE_REHYDRATORS[e.key]) STORE_REHYDRATORS[e.key]();
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  // Apply effective custom CSS (per-layout overrides global when set)
  useEffect(() => {
    if (!styleRef.current) {
      styleRef.current = document.createElement('style');
      styleRef.current.id = 'aura-custom-css';
      document.head.appendChild(styleRef.current);
    }
    const css = effectiveSettings.customCSS ?? frontend.customCSS;
    const enabled = effectiveSettings.customCSSEnabled ?? true;
    styleRef.current.textContent = enabled ? css : '';
  }, [effectiveSettings.customCSS, effectiveSettings.customCSSEnabled, frontend.customCSS, frontend.customCSSEnabled]);

  // Apply per-layout theme overrides on top of global ThemeProvider vars.
  // Written as a scoped <style> rule ([data-aura-app="frontend"] { ... }) so that
  // CSS custom-property inheritance overrides :root values without conflicting with
  // ThemeProvider's effect on document.documentElement (parent effects run after child effects).
  const layoutThemeRef = useRef<HTMLStyleElement | null>(null);
  useEffect(() => {
    const ls = layout?.settings;
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
  }, [layout?.id, layout?.settings, currentTheme, effectiveCustomVars]);

  // ── Load config from ioBroker on first connect ─────────────────────────────
  // localStorage is browser-local; ioBroker holds the authoritative config so
  // any browser (Firefox, Edge, mobile) gets the same dashboard as Chrome.
  const ioBrokerConfigLoaded = useRef(false);
  useEffect(() => {
    if (!connected || ioBrokerConfigLoaded.current) return;
    ioBrokerConfigLoaded.current = true;

    getStateDirect(IOBROKER_CONFIG_KEY).then((state) => {
      if (!state?.val) return;
      const raw = String(state.val);
      if (raw === '{"widgets":[]}' || raw === '{}') return; // factory default – nothing to load
      try {
        const remote = JSON.parse(raw) as Record<string, unknown>;
        let changed = false;
        SYNC_STORE_KEYS.forEach((key) => {
          const remoteVal = remote[key];
          if (!remoteVal) return;
          // Support both old format (pre-serialized string) and new format (parsed object)
          const remoteStr = typeof remoteVal === 'string' ? remoteVal : JSON.stringify(remoteVal);
          if (remoteStr && remoteStr !== localStorage.getItem(key)) {
            localStorage.setItem(key, remoteStr);
            changed = true;
          }
        });
        if (changed) {
          useDashboardStore.persist.rehydrate();
          useThemeStore.persist.rehydrate();
          useGroupStore.persist.rehydrate();
          useConfigStore.persist.rehydrate();
        }
      } catch { /* ignore malformed JSON */ }
    });
  }, [connected]);

  // React to external changes on aura.0.config.dashboard (subscription + polling)
  useConfigSync(connected, ioBrokerConfigLoaded);

  // Activate tab when URL slug changes
  useEffect(() => {
    if (!tabSlug || !tabs.length) return;
    const tab = tabs.find((t) => (t.slug ?? t.id) === tabSlug);
    if (tab && tab.id !== activeTabId) setActiveTabId(tab.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabSlug, layout?.id]);

  // Shared navigate handler used by both global and per-client subscriptions
  const handleNavigate = useCallback((val: string, clearId: string) => {
    if (!val) return;
    if (val.startsWith('http://') || val.startsWith('https://') || val.startsWith('//')) {
      window.location.href = val;
    } else {
      const tab = tabs.find((t) => (t.slug ?? t.id) === val);
      if (tab) setActiveTabId(tab.id);
    }
    setStateDirect(clearId, '');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs]);

  // Subscribe to global navigate datapoint (affects all clients)
  useEffect(() => {
    return subscribe('aura.0.navigate.url', (state) => {
      handleNavigate(String(state.val ?? '').trim(), 'aura.0.navigate.url');
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscribe, layout?.id, handleNavigate]);

  // Register this client in ioBroker on connect and subscribe to per-client navigate
  useEffect(() => {
    if (!connected) return;
    const displayName = clientName || navigator.userAgent.match(/\(([^)]+)\)/)?.[1] || 'Aura Client';

    // Register via relay state: adapter creates the full object tree and writes initial states.
    // Direct setObject calls are blocked by the web adapter socket (admin-only).
    setStateDirect('aura.0.clients.register', JSON.stringify({ clientId, name: displayName }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, clientId, clientName]);

  // Subscribe to per-client navigate datapoint
  useEffect(() => {
    const dpId = `aura.0.clients.${clientId}.navigate.url`;
    return subscribe(dpId, (state) => {
      handleNavigate(String(state.val ?? '').trim(), dpId);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscribe, clientId, layout?.id, handleNavigate]);

  const layoutUrlBase = layoutSlug ? `/view/${layoutSlug}` : '';

  const showBadge = frontend.showHeader && frontend.showConnectionBadge;

  const activeTabSlug = useMemo(() => {
    const t = tabs.find((t) => t.id === activeTabId);
    return t?.slug ?? null;
  }, [tabs, activeTabId]);

  return (
    <div data-aura-app="frontend" className={`aura-page${layout?.slug ? ` aura-page-${layout.slug}` : ''}${activeTabSlug ? ` aura-${activeTabSlug}` : ''} h-full flex flex-col overflow-hidden`} style={{ background: 'var(--app-bg)', color: 'var(--text-primary)' }}>
      <ConnectionIndicator showBadge={showBadge} />
      {frontend.showHeader && (
        <header className="aura-header flex items-center justify-between px-4 sm:px-6 py-4 shrink-0"
          style={{ background: 'var(--app-surface)', borderBottom: '1px solid var(--app-border)' }}>
          <h1 className="aura-titel text-xl font-bold tracking-tight">{frontend.headerTitle || 'Aura'}</h1>
          <div className="flex items-center gap-3">
            {frontend.headerDatapoint && <HeaderDatapoint id={frontend.headerDatapoint} template={frontend.headerDatapointTemplate || undefined} />}
            {frontend.headerClockEnabled && <HeaderClock f={frontend} />}
            {showBadge && <ConnectionBadge />}
            {frontend.showAdminLink && (
              <a
                href="#/admin"
                className="w-8 h-8 flex items-center justify-center rounded-full hover:opacity-80 transition-opacity"
                style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
                title="Admin"
              >
                <Settings size={15} />
              </a>
            )}
            <button
              onClick={() => {
                const nextId = currentTheme.dark ? 'light' : 'dark';
                setTheme(nextId);
                if (layout?.settings?.themeId) clearLayoutSettings(layout.id, 'themeId');
              }}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:opacity-80 transition-opacity"
              style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
              title={currentTheme.dark ? 'Hell-Modus' : 'Dunkel-Modus'}
            >
              {currentTheme.dark ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </div>
        </header>
      )}
      <TabBar
        readonly
        layoutId={layout?.id}
        viewTabs={tabs}
        viewActiveTabId={activeTabId}
        onViewTabClick={(tab) => {
          const slug = tab.slug ?? tab.id;
          if (layoutSlug) {
            navigate(`/view/${layoutSlug}/tab/${slug}`);
          } else {
            navigate(`/tab/${slug}`);
          }
        }}
        layoutUrlBase={layoutUrlBase}
      />
      {!dashboardVisible && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none" style={{ zIndex: 50 }}>
          {/* Progress bar — width updated directly via ref */}
          <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: 'var(--app-border)' }}>
            {loadTotal > 0 ? (
              <div ref={loadBarRef} className="h-full" style={{ background: 'var(--accent)', width: '0%' }} />
            ) : (
              <div className="h-full" style={{ background: 'var(--accent)', animation: 'aura-loadbar 1.4s ease-in-out infinite' }} />
            )}
          </div>
          {/* Spinner */}
          <div
            className="w-7 h-7 rounded-full border-2 animate-spin"
            style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
          />
          {/* Counter — textContent updated directly via ref */}
          <span ref={loadCountRef} className="text-xs tabular-nums" style={{ color: 'var(--text-secondary)' }}>
            {loadTotal > 0 ? `0 / ${loadTotal} Datenpunkte` : 'Verbinden…'}
          </span>
        </div>
      )}
      <div
        className="flex-1 min-h-0 flex flex-col"
        style={{
          opacity: dashboardVisible ? 1 : 0,
          transition: dashboardVisible ? 'opacity 0.25s ease-in' : undefined,
        }}
      >
        <Dashboard
          readonly
          viewTabs={tabs}
          viewActiveTabId={activeTabId}
          layoutId={layout?.id}
        />
      </div>
    </div>
  );
}
