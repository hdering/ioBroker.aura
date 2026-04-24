import { useState, useEffect, useRef } from 'react';
import { useConfigSync } from '../../hooks/useConfigSync';
import { version as appVersion } from '../../../package.json';
import { PortalTargetContext } from '../../contexts/PortalTargetContext';
import { Navigate, Outlet, NavLink } from 'react-router-dom';
import { LayoutDashboard, Palette, Settings, LogOut, PenSquare, Save, Undo2, Layers, Layers2, Sun, Moon, ExternalLink } from 'lucide-react';
import { useAuthStore, logout } from '../../store/authStore';
import { useThemeStore } from '../../store/themeStore';
import { getTheme, ADMIN_DARK_THEME } from '../../themes';
import { isDirty, saveAll, revertAll, subscribeDirty, saveToIoBroker, configureBackup } from '../../store/persistManager';
import { useDashboardStore, useActiveLayout } from '../../store/dashboardStore';
import { useGroupStore } from '../../store/groupStore';
import { useConfigStore } from '../../store/configStore';
import { useGroupDefsStore } from '../../store/groupDefsStore';
import { useGlobalSettingsStore } from '../../store/globalSettingsStore';
import { useAdminPrefsStore } from '../../store/adminPrefsStore';
import { useIoBroker, getStateDirect } from '../../hooks/useIoBroker';
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
      () => useGroupDefsStore.persist.rehydrate(),
    ]);
  };

  return { dirty, save, revert, saveError };
}

function useFrontendUrl(): string {
  const activeLayout = useActiveLayout();
  const { layouts } = useDashboardStore();
  const isFirst = layouts[0]?.id === activeLayout.id;
  const activeTab = activeLayout.tabs.find((t) => t.id === activeLayout.activeTabId) ?? activeLayout.tabs[0];
  const tabSlug = activeTab?.slug ?? activeTab?.id ?? '';

  if (isFirst) {
    return tabSlug && activeLayout.tabs.length > 1 ? `#/tab/${tabSlug}` : '#/';
  }
  return tabSlug && activeLayout.tabs.length > 1
    ? `#/view/${activeLayout.slug}/tab/${tabSlug}`
    : `#/view/${activeLayout.slug}`;
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
  const ADMIN_SYNC_KEYS = ['aura-dashboard', 'aura-theme', 'aura-groups', 'aura-config', 'aura-global-settings', 'aura-group-defs'] as const;
  const autoSyncedRef = useRef(false);
  const adminConfigLoadedRef = useRef(false);
  useEffect(() => {
    if (!connected || autoSyncedRef.current) return;
    autoSyncedRef.current = true;
    void getStateDirect('aura.0.config.dashboard').then((state) => {
      adminConfigLoadedRef.current = true;
      const remoteRaw = state?.val ? String(state.val) : '';

      let remotePayload: Record<string, unknown> = {};
      let remoteHasData = false;
      try {
        remotePayload = JSON.parse(remoteRaw) as Record<string, unknown>;
        remoteHasData = Object.values(remotePayload).some(
          v => v && typeof v === 'string' && v !== '{}' && v.length > 10,
        );
      } catch { /* ignore */ }

      const localHasData = ADMIN_SYNC_KEYS.some((key) => {
        const raw = localStorage.getItem(key);
        return raw !== null && raw.length > 10;
      });

      if (remoteHasData && !localHasData) {
        // Case 1: fresh browser / cleared cache – apply remote config immediately
        let changed = false;
        ADMIN_SYNC_KEYS.forEach((key) => {
          const val = remotePayload[key];
          if (!val) return;
          const str = typeof val === 'string' ? val : JSON.stringify(val);
          if (str.length > 2 && str !== localStorage.getItem(key)) {
            localStorage.setItem(key, str);
            changed = true;
          }
        });
        if (changed) {
          useDashboardStore.persist.rehydrate();
          useThemeStore.persist.rehydrate();
          useGroupStore.persist.rehydrate();
          useConfigStore.persist.rehydrate();
          useGroupDefsStore.persist.rehydrate();
          useGlobalSettingsStore.persist.rehydrate();
        }
      } else if (!remoteHasData && localHasData) {
        // Case 2: ioBroker is empty – push local config to ioBroker
        saveToIoBroker();
      }
      // Case 3: both have data or both empty – useConfigSync handles ongoing sync
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
        if (isDirty()) { saveAll(); saveToIoBroker(); }
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
      <aside className="aura-scroll w-56 shrink-0 flex flex-col h-screen sticky top-0 overflow-y-auto" style={{ background: 'var(--app-surface)', borderRight: '1px solid var(--app-border)' }}>
        <div className="px-5 py-5 border-b shrink-0 flex items-center justify-between" style={{ borderColor: 'var(--app-border)' }}>
          <div title="Adaptive Unified Room Automation">
            <p className="text-xs font-semibold uppercase tracking-widest mb-0.5" style={{ color: 'var(--text-secondary)' }}>Aura</p>
            <p className="font-bold text-lg leading-none" style={{ color: 'var(--text-primary)' }}>Admin</p>
            <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>v{appVersion}</p>
          </div>
          <button
            onClick={() => setAdminTheme(adminTheme.dark ? 'light' : 'dark')}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:opacity-80 transition-opacity"
            style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
            title={adminTheme.dark ? t('admin.nav.lightMode') : t('admin.nav.darkMode')}
          >
            {adminTheme.dark ? <Sun size={15} /> : <Moon size={15} />}
          </button>
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
          className="shrink-0 flex items-center justify-end gap-2 px-4 py-2 transition-all"
          style={{
            background: dirty ? 'var(--accent)11' : 'var(--app-surface)',
            borderBottom: `1px solid ${dirty ? 'var(--accent)44' : 'var(--app-border)'}`,
            minHeight: '44px',
          }}
        >
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
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t('admin.save.saved')}</span>
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
