import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Sun, Moon } from 'lucide-react';
import { useIoBroker, getStateDirect, setStateDirect, setObjectDirect } from './hooks/useIoBroker';
import { useConnectionStore } from './store/connectionStore';
import { useConfigStore } from './store/configStore';
import { useDashboardStore, useLayoutBySlug } from './store/dashboardStore';
import { useThemeStore } from './store/themeStore';
import { getTheme } from './themes';
import { useGroupStore } from './store/groupStore';
import { Dashboard } from './components/layout/Dashboard';
import { TabBar } from './components/layout/TabBar';
import type { Tab } from './store/dashboardStore';

const IOBROKER_CONFIG_KEY = 'aura.0.config.dashboard';
const SYNC_STORE_KEYS = ['aura-dashboard', 'aura-theme', 'aura-groups', 'aura-config'] as const;

const STORE_REHYDRATORS: Record<string, () => void> = {
  'aura-dashboard': () => useDashboardStore.persist.rehydrate(),
  'aura-theme':     () => useThemeStore.persist.rehydrate(),
  'aura-groups':    () => useGroupStore.persist.rehydrate(),
  'aura-config':    () => useConfigStore.persist.rehydrate(),
};

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

export default function App() {
  const { tabSlug, layoutSlug } = useParams<{ tabSlug?: string; layoutSlug?: string }>();
  const navigate = useNavigate();
  const { frontend } = useConfigStore();
  const { themeId, setTheme } = useThemeStore();
  const currentTheme = getTheme(themeId);
  const { connected, subscribe } = useIoBroker();
  const { clientId, clientName } = useConnectionStore();
  const styleRef = useRef<HTMLStyleElement | null>(null);

  // Determine which layout to display based on URL slug
  const layout = useLayoutBySlug(layoutSlug);
  const tabs: Tab[] = layout?.tabs ?? [];

  // Local active tab state (frontend only — doesn't affect admin editor)
  const [activeTabId, setActiveTabId] = useState<string>(() => layout?.activeTabId ?? tabs[0]?.id ?? '');

  // Reset active tab when layout changes (different URL)
  useEffect(() => {
    setActiveTabId(layout?.activeTabId ?? layout?.tabs[0]?.id ?? '');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout?.id]);

  // Sync cross-tab localStorage changes (admin panel → frontend)
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key && STORE_REHYDRATORS[e.key]) STORE_REHYDRATORS[e.key]();
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  // Apply custom CSS
  useEffect(() => {
    if (!styleRef.current) {
      styleRef.current = document.createElement('style');
      styleRef.current.id = 'aura-custom-css';
      document.head.appendChild(styleRef.current);
    }
    styleRef.current.textContent = frontend.customCSS;
  }, [frontend.customCSS]);

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
        const remote = JSON.parse(raw) as Record<string, string | null>;
        let changed = false;
        SYNC_STORE_KEYS.forEach((key) => {
          const remoteVal = remote[key];
          if (remoteVal && remoteVal !== localStorage.getItem(key)) {
            localStorage.setItem(key, remoteVal);
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
    const prefix = `aura.0.clients.${clientId}`;
    const displayName = clientName || navigator.userAgent.match(/\(([^)]+)\)/)?.[1] || 'Aura Client';

    // Ensure objects exist (idempotent)
    setObjectDirect(prefix, {
      type: 'channel',
      common: { name: displayName },
      native: {},
    });
    setObjectDirect(`${prefix}.navigate.url`, {
      type: 'state',
      common: { name: 'Navigate', type: 'string', role: 'url', read: true, write: true, def: '' },
      native: {},
    });
    setObjectDirect(`${prefix}.info.name`, {
      type: 'state',
      common: { name: 'Client Name', type: 'string', role: 'text', read: true, write: true, def: displayName },
      native: {},
    });
    setObjectDirect(`${prefix}.info.lastSeen`, {
      type: 'state',
      common: { name: 'Last Seen', type: 'number', role: 'date', read: true, write: false, def: 0 },
      native: {},
    });

    // Update live info
    setStateDirect(`${prefix}.info.name`, displayName);
    setStateDirect(`${prefix}.info.lastSeen`, Date.now());
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

  return (
    <div data-aura-app="frontend" className="h-full flex flex-col overflow-hidden" style={{ background: 'var(--app-bg)', color: 'var(--text-primary)' }}>
      {frontend.showHeader && (
        <header className="flex items-center justify-between px-4 sm:px-6 py-4 shrink-0"
          style={{ background: 'var(--app-surface)', borderBottom: '1px solid var(--app-border)' }}>
          <h1 className="text-xl font-bold tracking-tight">{frontend.headerTitle || 'Aura'}</h1>
          <div className="flex items-center gap-3">
            {frontend.showConnectionBadge && <ConnectionBadge />}
            <button
              onClick={() => setTheme(currentTheme.dark ? 'light' : 'dark')}
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
      <Dashboard
        readonly
        viewTabs={tabs}
        viewActiveTabId={activeTabId}
      />
    </div>
  );
}
