import { useState, useEffect } from 'react';
import { Navigate, Outlet, NavLink } from 'react-router-dom';
import { LayoutDashboard, Palette, Settings, LogOut, Home, PenSquare, Network, Save, Undo2 } from 'lucide-react';
import { useAuthStore, logout } from '../../store/authStore';
import { ThemeSelector } from '../../components/config/ThemeSelector';
import { isDirty, saveAll, revertAll, subscribeDirty } from '../../store/persistManager';
import { useDashboardStore } from '../../store/dashboardStore';
import { useThemeStore } from '../../store/themeStore';
import { useGroupStore } from '../../store/groupStore';
import { useConfigStore } from '../../store/configStore';

function useSaveState() {
  const [dirty, setDirty] = useState(isDirty);

  useEffect(() => subscribeDirty(() => setDirty(isDirty())), []);

  const save = () => saveAll();
  const revert = () =>
    revertAll([
      () => useDashboardStore.persist.rehydrate(),
      () => useThemeStore.persist.rehydrate(),
      () => useGroupStore.persist.rehydrate(),
      () => useConfigStore.persist.rehydrate(),
    ]);

  return { dirty, save, revert };
}

const NAV = [
  { to: '/admin', label: 'Übersicht', icon: LayoutDashboard, end: true },
  { to: '/admin/editor', label: 'Dashboard-Editor', icon: PenSquare },
  { to: '/admin/endpoints', label: 'Endpunkte', icon: Network },
  { to: '/admin/theme', label: 'Theme & CSS', icon: Palette },
  { to: '/admin/settings', label: 'Einstellungen', icon: Settings },
];

export function AdminLayout() {
  const { sessionActive } = useAuthStore();
  const { dirty, save, revert } = useSaveState();
  if (!sessionActive) return <Navigate to="/admin/login" replace />;

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--app-bg)', color: 'var(--text-primary)' }}>
      <aside className="w-56 shrink-0 flex flex-col" style={{ background: 'var(--app-surface)', borderRight: '1px solid var(--app-border)' }}>
        <div className="px-5 py-5 border-b flex items-center justify-between" style={{ borderColor: 'var(--app-border)' }}>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest mb-0.5" style={{ color: 'var(--text-secondary)' }}>Aura</p>
            <p className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>Admin</p>
          </div>
          <ThemeSelector />
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
          <a href="/" target="_blank"
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium opacity-60 hover:opacity-100 transition-opacity"
            style={{ color: 'var(--text-primary)' }}>
            <Home size={17} /> Frontend öffnen
          </a>
          <button onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium opacity-60 hover:opacity-100 transition-opacity"
            style={{ color: 'var(--accent-red)' }}>
            <LogOut size={17} /> Abmelden
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
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
                Ungespeicherte Änderungen
              </span>
              <button
                onClick={revert}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-80 transition-opacity"
                style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
              >
                <Undo2 size={13} /> Rückgängig
              </button>
              <button
                onClick={save}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white hover:opacity-80 transition-opacity"
                style={{ background: 'var(--accent)' }}
              >
                <Save size={13} /> Speichern
              </button>
            </>
          ) : (
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Alle Änderungen gespeichert</span>
          )}
        </div>

        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
