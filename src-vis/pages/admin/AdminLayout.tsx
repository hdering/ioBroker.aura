import { useState, useEffect, useRef } from 'react';
import { useConfigSync } from '../../hooks/useConfigSync';
import { version as appVersion } from '../../../package.json';
import { PortalTargetContext } from '../../contexts/PortalTargetContext';
import { Navigate, Outlet, NavLink } from 'react-router-dom';
import { LayoutDashboard, Palette, Settings, LogOut, PenSquare, Save, Undo2, Layers, Layers2, Sun, Moon, ExternalLink } from 'lucide-react';
import { useAuthStore, logout } from '../../store/authStore';
import { useThemeStore } from '../../store/themeStore';
import { getTheme, ADMIN_DARK_THEME } from '../../themes';
import { isDirty, saveAll, revertAll, subscribeDirty, saveToIoBroker } from '../../store/persistManager';
import { useDashboardStore, useActiveLayout } from '../../store/dashboardStore';
import { useGroupStore } from '../../store/groupStore';
import { useConfigStore } from '../../store/configStore';
import { useAdminPrefsStore } from '../../store/adminPrefsStore';
import { useIoBroker, getStateDirect } from '../../hooks/useIoBroker';
import { useT } from '../../i18n';

function useSaveState() {
  const [dirty, setDirty] = useState(isDirty);

  useEffect(() => subscribeDirty(() => setDirty(isDirty())), []);

  const save = () => { saveAll(); saveToIoBroker(); };
  const revert = () =>
    revertAll([
      () => useDashboardStore.persist.rehydrate(),
      () => useThemeStore.persist.rehydrate(),
      () => useGroupStore.persist.rehydrate(),
      () => useConfigStore.persist.rehydrate(),
    ]);

  return { dirty, save, revert };
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
  const { dirty, save, revert } = useSaveState();
  const { adminThemeId, setAdminTheme } = useThemeStore();
  const frontendUrl = useFrontendUrl();
  const { connected } = useIoBroker();
  const { autoSave, autoSaveDelay } = useAdminPrefsStore();

  // Auto-push localStorage config to ioBroker on first connect.
  // Loads ioBroker first – only pushes localStorage if ioBroker is empty
  // or if there are unsaved local changes, preventing a stale/empty
  // localStorage from overwriting a valid remote config.
  const autoSyncedRef = useRef(false);
  const adminConfigLoadedRef = useRef(false);
  useEffect(() => {
    if (!connected || autoSyncedRef.current) return;
    autoSyncedRef.current = true;
    void getStateDirect('aura.0.config.dashboard').then((state) => {
      adminConfigLoadedRef.current = true;
      const remoteRaw = state?.val ? String(state.val) : '';
      let remoteHasData = false;
      try {
        const parsed = JSON.parse(remoteRaw) as Record<string, unknown>;
        remoteHasData = Object.values(parsed).some(
          v => v && typeof v === 'string' && v !== '{}' && v.length > 10,
        );
      } catch { /* ignore */ }
      // Push localStorage → ioBroker only when ioBroker is empty or local
      // edits are pending; otherwise let useConfigSync pull the remote config.
      if (!remoteHasData || isDirty()) saveToIoBroker();
    });
  }, [connected]);

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
