import { useEffect, useRef } from 'react';
import { useIoBroker } from './hooks/useIoBroker';
import { useConfigStore } from './store/configStore';
import { useDashboardStore } from './store/dashboardStore';
import { useThemeStore } from './store/themeStore';
import { useGroupStore } from './store/groupStore';
import { Dashboard } from './components/layout/Dashboard';
import { TabBar } from './components/layout/TabBar';

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
  const { frontend } = useConfigStore();
  const styleRef = useRef<HTMLStyleElement | null>(null);

  // Sync changes saved from the admin (other tab) via localStorage storage events
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key && STORE_REHYDRATORS[e.key]) {
        STORE_REHYDRATORS[e.key]();
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  useEffect(() => {
    if (!styleRef.current) {
      styleRef.current = document.createElement('style');
      styleRef.current.id = 'aura-custom-css';
      document.head.appendChild(styleRef.current);
    }
    styleRef.current.textContent = frontend.customCSS;
  }, [frontend.customCSS]);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--app-bg)', color: 'var(--text-primary)' }}>
      {frontend.showHeader && (
        <header className="flex items-center justify-between px-4 sm:px-6 py-4 shrink-0"
          style={{ background: 'var(--app-surface)', borderBottom: '1px solid var(--app-border)' }}>
          <h1 className="text-xl font-bold tracking-tight">{frontend.headerTitle || 'Aura'}</h1>
          {frontend.showConnectionBadge && <ConnectionBadge />}
        </header>
      )}
      <TabBar readonly />
      <Dashboard readonly />
    </div>
  );
}
