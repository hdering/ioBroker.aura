import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Sun, Moon } from 'lucide-react';
import { useIoBroker } from './hooks/useIoBroker';
import { useConfigStore } from './store/configStore';
import { useDashboardStore, useLayoutBySlug } from './store/dashboardStore';
import { useThemeStore } from './store/themeStore';
import { getTheme } from './themes';
import { useGroupStore } from './store/groupStore';
import { Dashboard } from './components/layout/Dashboard';
import { TabBar } from './components/layout/TabBar';
import type { Tab } from './store/dashboardStore';

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
  const { subscribe, setState } = useIoBroker();
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

  // Activate tab when URL slug changes
  useEffect(() => {
    if (!tabSlug || !tabs.length) return;
    const tab = tabs.find((t) => (t.slug ?? t.id) === tabSlug);
    if (tab && tab.id !== activeTabId) setActiveTabId(tab.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabSlug, layout?.id]);

  // Subscribe to ioBroker navigate datapoint
  useEffect(() => {
    return subscribe('aura.0.navigate.url', (state) => {
      const val = String(state.val ?? '').trim();
      if (!val) return;

      if (val.startsWith('http://') || val.startsWith('https://') || val.startsWith('//')) {
        window.location.href = val;
      } else {
        const tab = tabs.find((t) => (t.slug ?? t.id) === val);
        if (tab) setActiveTabId(tab.id);
      }

      setState('aura.0.navigate.url', '');
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscribe, setState, layout?.id]);

  const layoutUrlBase = layoutSlug ? `/view/${layoutSlug}` : '';

  return (
    <div data-aura-app="frontend" className="h-full flex flex-col" style={{ background: 'var(--app-bg)', color: 'var(--text-primary)' }}>
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
