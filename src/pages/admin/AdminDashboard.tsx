import { useDashboardStore } from '../../store/dashboardStore';
import { useConfigStore } from '../../store/configStore';
import { useIoBroker } from '../../hooks/useIoBroker';
import { Layers, Wifi, WifiOff, Layout, Hash } from 'lucide-react';

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: React.ElementType; color: string }) {
  return (
    <div className="rounded-xl p-5" style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{label}</span>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: color + '22' }}>
          <Icon size={16} style={{ color }} />
        </div>
      </div>
      <p className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>{value}</p>
    </div>
  );
}

export function AdminDashboard() {
  const { tabs } = useDashboardStore();
  const { frontend, updateFrontend } = useConfigStore();
  const { connected } = useIoBroker();

  const totalWidgets = tabs.reduce((sum, t) => sum + t.widgets.length, 0);

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Übersicht</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Admin-Bereich – Konfiguration und Überwachung</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Tabs" value={tabs.length} icon={Layers} color="var(--accent)" />
        <StatCard label="Widgets gesamt" value={totalWidgets} icon={Layout} color="var(--accent-green)" />
        <StatCard label="ioBroker" value={connected ? 'Verbunden' : 'Getrennt'} icon={connected ? Wifi : WifiOff} color={connected ? 'var(--accent-green)' : 'var(--accent-red)'} />
        <StatCard label="Gruppen" value={tabs.reduce((s, t) => s + t.widgets.filter(w => w.type === 'list').length, 0)} icon={Hash} color="var(--accent-yellow)" />
      </div>

      {/* Frontend-Einstellungen */}
      <div className="rounded-xl p-6 space-y-5" style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}>
        <h2 className="font-semibold text-lg" style={{ color: 'var(--text-primary)' }}>Frontend-Vorgaben</h2>

        <div className="space-y-4">
          {/* Header an/aus */}
          <div className="flex items-center justify-between py-3 border-b" style={{ borderColor: 'var(--app-border)' }}>
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Header anzeigen</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>Titelleiste im Frontend ein- oder ausblenden</p>
            </div>
            <button
              onClick={() => updateFrontend({ showHeader: !frontend.showHeader })}
              className="relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none shrink-0"
              style={{ background: frontend.showHeader ? 'var(--accent-green)' : 'var(--app-border)' }}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${frontend.showHeader ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>

          {/* Nur sichtbar wenn Header aktiv */}
          {frontend.showHeader && (
            <>
              <div>
                <label className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Dashboard-Titel</label>
                <input
                  value={frontend.headerTitle}
                  onChange={(e) => updateFrontend({ headerTitle: e.target.value })}
                  className="mt-2 w-full rounded-xl px-4 py-2.5 text-sm focus:outline-none"
                  style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}
                />
              </div>

              <div className="flex items-center justify-between py-3 border-b" style={{ borderColor: 'var(--app-border)' }}>
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Verbindungsstatus anzeigen</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>ioBroker-Verbindungsanzeige im Header</p>
                </div>
                <button
                  onClick={() => updateFrontend({ showConnectionBadge: !frontend.showConnectionBadge })}
                  className="relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none shrink-0"
                  style={{ background: frontend.showConnectionBadge ? 'var(--accent-green)' : 'var(--app-border)' }}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${frontend.showConnectionBadge ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Tab-Übersicht */}
      <div className="rounded-xl p-6" style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}>
        <h2 className="font-semibold text-lg mb-4" style={{ color: 'var(--text-primary)' }}>Tabs & Widgets</h2>
        <div className="space-y-2">
          {tabs.map((tab) => (
            <div key={tab.id} className="flex items-center justify-between px-4 py-3 rounded-lg" style={{ background: 'var(--app-bg)' }}>
              <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{tab.name}</span>
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--accent)22', color: 'var(--accent)' }}>
                {tab.widgets.length} Widgets
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
