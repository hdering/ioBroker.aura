import { useState, useEffect, useRef } from 'react';
import { useConfigSync } from '../../hooks/useConfigSync';
import { version as appVersion } from '../../../package.json';
import { PortalTargetContext } from '../../contexts/PortalTargetContext';
import { Navigate, Outlet, NavLink } from 'react-router-dom';
import { LayoutDashboard, Palette, Settings, LogOut, PenSquare, Save, Undo2, Layers, Layers2, Sun, Moon, ExternalLink, Menu, X } from 'lucide-react';
import { useAuthStore, logout } from '../../store/authStore';
import { useThemeStore } from '../../store/themeStore';
import { getTheme, ADMIN_DARK_THEME } from '../../themes';
import { isDirty, saveAll, revertAll, subscribeDirty, saveToIoBroker, configureBackup } from '../../store/persistManager';
import { useDashboardStore } from '../../store/dashboardStore';
import { useGroupStore } from '../../store/groupStore';
import { useConfigStore } from '../../store/configStore';
import { loadConfigFromIoBroker, applyRaw } from '../../utils/configLoader';
import { useAdminPrefsStore } from '../../store/adminPrefsStore';
import { useIoBroker } from '../../hooks/useIoBroker';
import { useT } from '../../i18n';

function useSaveState() {
  const [dirty, setDirty] = useState(isDirty);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => subscribeDirty(() => setDirty(isDirty())), []);

  const save = () => {
    setSaveError(null);
    try {
      saveAll();
      saveToIoBroker();
    } catch {
      setSaveError('Speichern fehlgeschlagen: localStorage-Speicher voll');
    }
  };

  const revert = () => {
    setSaveError(null);
    revertAll([
      () => useDashboardStore.persist.rehydrate(),
      () => useThemeStore.persist.rehydrate(),
      () => useGroupStore.persist.rehydrate(),
      () => useConfigStore.persist.rehydrate(),
      () => { const v = localStorage.getItem('aura-group-defs'); if (v) applyRaw('aura-group-defs', v); },
    ]);
  };

  return { dirty, save, revert, saveError };
}

function useFrontendUrl(): string {
  return useDashboardStore((s) => {
    const layout = s.layouts.find((l) => l.id === s.activeLayoutId) ?? s.layouts[0];
    const isFirst = s.layouts[0]?.id === layout.id;
    const activeTab = layout.tabs.find((t) => t.id === layout.activeTabId) ?? layout.tabs[0];
    const tabSlug = activeTab?.slug ?? activeTab?.id ?? '';
    if (isFirst) {
      return tabSlug && layout.tabs.length > 1 ? `#/tab/${tabSlug}` : '#/';
    }
    return tabSlug && layout.tabs.length > 1
      ? `#/view/${layout.slug}/tab/${tabSlug}`
      : `#/view/${layout.slug}`;
  });
}

export function AdminLayout() {
  const t = useT();
  const { sessionActive } = useAuthStore();
  const { dirty, save, revert, saveError } = useSaveState();
  const { adminThemeId, setAdminTheme } = useThemeStore();
  const frontendUrl = useFrontendUrl();
  const { connected } = useIoBroker();
  const { autoSave, autoSaveDelay, backupCount } = useAdminPrefsStore();

  useEffect(() => { configureBackup({ maxBackups: backupCount }); }, [backupCount]);

  // Auto-sync on first connect: three cases
  //   1. Remote has data, local is empty  → apply remote immediately (avoids 10 s poll wait)
  //   2. Remote is empty, local has data  → push local to ioBroker (initial setup / recovery)
  //   3. Both have data or both empty     → nothing to do here; useConfigSync handles ongoing sync
  //
  // NOTE: isDirty() must NOT be used here. When localStorage is empty, Zustand
  // persist writes the default initial state via managedStorage.setItem(), which
  // spuriously sets isDirty()=true. Using it would cause saveToIoBroker() to run
  // with an empty localStorage and overwrite ioBroker with null values.
  const autoSyncedRef = useRef(false);
  const adminConfigLoadedRef = useRef(false);
  useEffect(() => {
    if (!connected || autoSyncedRef.current) return;
    autoSyncedRef.current = true;
    loadConfigFromIoBroker(true).then((remoteHasData) => {
      adminConfigLoadedRef.current = true;
      const localHasData = ['aura-dashboard', 'aura-theme', 'aura-groups', 'aura-config', 'aura-global-settings'].some(
        (key) => { const v = localStorage.getItem(key); return v !== null && v.length > 10; },
      );
      if (!remoteHasData && localHasData) {
        // ioBroker is empty – push local config to ioBroker
        saveToIoBroker();
      } else if (remoteHasData && localHasData) {
        // Both have data – push local to ioBroker to ensure it's current
        saveToIoBroker({ backup: false });
      }
    });
  }, [connected]); // eslint-disable-line react-hooks/exhaustive-deps

  // React to external changes on aura.0.config.dashboard (subscription + polling)
  useConfigSync(connected, adminConfigLoadedRef);

  // ── Ctrl+S / Cmd+S keyboard shortcut ──────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (isDirty()) { saveAll(); saveToIoBroker(); }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ── Auto-save countdown ────────────────────────────────────────────────
  const [countdown, setCountdown] = useState<number | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoSaveDeadlineRef = useRef<number | null>(null);

  useEffect(() => {
    // Clear any running timer
    if (autoSaveTimerRef.current) { clearInterval(autoSaveTimerRef.current); autoSaveTimerRef.current = null; }
    setCountdown(null);
    autoSaveDeadlineRef.current = null;

    if (!autoSave || !dirty) return;

    const deadline = Date.now() + autoSaveDelay * 1000;
    autoSaveDeadlineRef.current = deadline;
    setCountdown(autoSaveDelay);

    autoSaveTimerRef.current = setInterval(() => {
      const remaining = Math.ceil((autoSaveDeadlineRef.current! - Date.now()) / 1000);
      if (remaining <= 0) {
        clearInterval(autoSaveTimerRef.current!);
        autoSaveTimerRef.current = null;
        setCountdown(null);
        if (isDirty()) { saveAll(); saveToIoBroker({ backup: false }); }
      } else {
        setCountdown(remaining);
      }
    }, 500);

    return () => { if (autoSaveTimerRef.current) clearInterval(autoSaveTimerRef.current); };
  }, [autoSave, autoSaveDelay, dirty]);

  const adminTheme = adminThemeId === 'dark' ? ADMIN_DARK_THEME : getTheme(adminThemeId);
  const adminVars = Object.fromEntries(
    Object.entries(adminTheme.vars).map(([k, v]) => [k, v])
  ) as React.CSSProperties;

  const [portalTarget, setPortalTarget] = useState<HTMLDivElement | null>(null);

  // ── Collapsible sidebar for narrow windows ─────────────────────────────
  const SIDEBAR_BP = 768;
  const [isNarrow, setIsNarrow] = useState(() => window.innerWidth < SIDEBAR_BP);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= SIDEBAR_BP);
  useEffect(() => {
    const handler = () => {
      const narrow = window.innerWidth < SIDEBAR_BP;
      setIsNarrow(narrow);
      if (!narrow) setSidebarOpen(true);
    };
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const NAV = [
    { to: '/admin', label: t('admin.nav.overview'), icon: LayoutDashboard, end: true },
    { to: '/admin/editor', label: t('admin.nav.editor'), icon: PenSquare },
    { to: '/admin/layouts', label: t('admin.nav.layouts'), icon: Layers2 },
    { to: '/admin/widgets', label: t('admin.nav.widgets'), icon: Layers },
    { to: '/admin/theme', label: t('admin.nav.theme'), icon: Palette },
    { to: '/admin/settings', label: t('admin.nav.settings'), icon: Settings },
  ];

  if (!sessionActive) return <Navigate to="/admin/login" replace />;

  return (
    <PortalTargetContext.Provider value={portalTarget}>
    <div className="min-h-screen flex" style={{
      ...adminVars,
      colorScheme: adminTheme.dark ? 'dark' : 'light',
      background: adminTheme.vars['--app-bg'],
      color: adminTheme.vars['--text-primary'],
    }}>
      {/* Backdrop for overlay sidebar on narrow screens */}
      {isNarrow && sidebarOpen && (
        <div
          className="fixed inset-0 z-40"
          style={{ background: 'rgba(0,0,0,0.45)' }}
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        className={`aura-scroll flex flex-col h-screen overflow-y-auto transition-transform duration-200 ${
          isNarrow
            ? `fixed top-0 left-0 z-50 w-56 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`
            : 'w-56 shrink-0 sticky top-0'
        }`}
        style={{ background: 'var(--app-surface)', borderRight: '1px solid var(--app-border)' }}
      >
        <div className="px-5 py-5 border-b shrink-0 flex items-center justify-between" style={{ borderColor: 'var(--app-border)' }}>
          <div title="Adaptive Unified Room Automation">
            <p className="text-xs font-semibold uppercase tracking-widest mb-0.5" style={{ color: 'var(--text-secondary)' }}>Aura</p>
            <p className="font-bold text-lg leading-none" style={{ color: 'var(--text-primary)' }}>Admin</p>
            <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>v{appVersion}</p>
          </div>
          <div className="flex items-center gap-1">
            {isNarrow && (
              <button
                onClick={() => setSidebarOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:opacity-80 transition-opacity"
                style={{ color: 'var(--text-secondary)' }}
              >
                <X size={15} />
              </button>
            )}
            <button
              onClick={() => setAdminTheme(adminTheme.dark ? 'light' : 'dark')}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:opacity-80 transition-opacity"
              style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
              title={adminTheme.dark ? t('admin.nav.lightMode') : t('admin.nav.darkMode')}
            >
              {adminTheme.dark ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-opacity hover:opacity-80 ${isActive ? 'opacity-100' : 'opacity-60'}`
              }
              style={({ isActive }) => ({
                background: isActive ? 'var(--accent)22' : 'transparent',
                color: isActive ? 'var(--accent)' : 'var(--text-primary)',
              })}
            >
              <Icon size={17} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 space-y-1 border-t" style={{ borderColor: 'var(--app-border)' }}>
          <a href={frontendUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium opacity-60 hover:opacity-100 transition-opacity"
            style={{ color: 'var(--text-primary)' }}>
            <ExternalLink size={17} /> {t('admin.nav.openFrontend')}
          </a>
          <button onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium opacity-60 hover:opacity-100 transition-opacity"
            style={{ color: 'var(--accent-red)' }}>
            <LogOut size={17} /> {t('admin.nav.logout')}
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden" style={{ background: 'var(--app-bg)' }}>
        {/* Save bar */}
        <div
          className="shrink-0 flex items-center gap-2 px-4 py-2 transition-all"
          style={{
            background: dirty ? 'var(--accent)11' : 'var(--app-surface)',
            borderBottom: `1px solid ${dirty ? 'var(--accent)44' : 'var(--app-border)'}`,
            minHeight: '44px',
          }}
        >
          {isNarrow && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="flex items-center justify-center w-8 h-8 rounded-lg hover:opacity-80 transition-opacity shrink-0"
              style={{ color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
            >
              <Menu size={16} />
            </button>
          )}
          {saveError && !dirty && (
            <span className="text-xs mr-auto" style={{ color: 'var(--accent-red)' }}>
              {saveError}
            </span>
          )}
          {dirty ? (
            <>
              <span className="text-xs mr-auto" style={{ color: 'var(--accent)' }}>
                {countdown !== null
                  ? t('admin.save.autoIn', { s: String(countdown) })
                  : t('admin.save.unsaved')}
              </span>
              <button
                onClick={revert}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-80 transition-opacity"
                style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
              >
                <Undo2 size={13} /> {t('admin.save.undo')}
              </button>
              <button
                onClick={save}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white hover:opacity-80 transition-opacity"
                style={{ background: 'var(--accent)' }}
              >
                <Save size={13} /> {t('admin.save.save')}
              </button>
            </>
          ) : (
            <span className="text-xs ml-auto" style={{ color: 'var(--text-secondary)' }}>{t('admin.save.saved')}</span>
          )}
        </div>

        <main className="aura-scroll flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
      {/* Portal target: inside admin container so portals inherit admin theme CSS vars */}
      <div ref={setPortalTarget} />
    </div>
    </PortalTargetContext.Provider>
  );
}
