import { useDashboardStore } from '../../store/dashboardStore';
import { useIoBroker } from '../../hooks/useIoBroker';
import { Layers, Wifi, WifiOff, Layout, Hash, Copy, Check, AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useT } from '../../i18n';
import { copyToClipboard } from '../../utils/clipboard';
import { useTimerOrphans } from '../../hooks/useTimerOrphans';

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

function CopyButton({ text }: { text: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const copy = () => {
    copyToClipboard(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button onClick={copy} className="hover:opacity-70 shrink-0" title={t('dashboard.nav.copy')}>
      {copied ? <Check size={12} style={{ color: 'var(--accent-green)' }} /> : <Copy size={12} style={{ color: 'var(--text-secondary)' }} />}
    </button>
  );
}

function TimerOrphansSection() {
  const t = useT();
  const { orphans, loading, refresh, cleanup } = useTimerOrphans();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  if (orphans.length === 0 && !loading) return null;

  const handleCleanup = async () => {
    setBusy(true);
    try { await cleanup(); setConfirm(false); }
    finally { setBusy(false); }
  };

  return (
    <div
      className="rounded-xl p-5 space-y-3"
      style={{ background: 'var(--app-surface)', border: '1px solid var(--accent-yellow)' }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <AlertTriangle size={16} style={{ color: 'var(--accent-yellow)' }} />
          <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
            {t('dashboard.orphans.title', { count: orphans.length })}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void refresh()}
            disabled={loading || busy}
            className="flex items-center gap-1.5 px-2.5 h-7 text-xs rounded-lg hover:opacity-80 disabled:opacity-50"
            style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
            title={t('dashboard.orphans.refresh')}
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            {t('dashboard.orphans.refresh')}
          </button>
          {confirm ? (
            <>
              <button
                onClick={handleCleanup}
                disabled={busy}
                className="flex items-center gap-1.5 px-2.5 h-7 text-xs rounded-lg text-white hover:opacity-80 disabled:opacity-50"
                style={{ background: 'var(--accent-red)' }}
              >
                <Trash2 size={12} />
                {t('common.confirm')}
              </button>
              <button
                onClick={() => setConfirm(false)}
                disabled={busy}
                className="px-2.5 h-7 text-xs rounded-lg hover:opacity-80 disabled:opacity-50"
                style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
              >
                {t('common.cancel')}
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirm(true)}
              disabled={orphans.length === 0}
              className="flex items-center gap-1.5 px-2.5 h-7 text-xs rounded-lg text-white hover:opacity-80 disabled:opacity-50"
              style={{ background: 'var(--accent-red)' }}
            >
              <Trash2 size={12} />
              {t('dashboard.orphans.cleanup')}
            </button>
          )}
        </div>
      </div>
      {orphans.length > 0 && (
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          {t('dashboard.orphans.hint')}
        </p>
      )}
      {orphans.length > 0 && (
        <ul className="aura-scroll text-xs font-mono max-h-32 overflow-y-auto space-y-0.5 px-3 py-2 rounded-lg"
            style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)' }}>
          {orphans.map((id) => <li key={id}>aura.0.timers.{id}</li>)}
        </ul>
      )}
    </div>
  );
}

export function AdminDashboard() {
  const t = useT();
  const { layouts } = useDashboardStore();
  const totalTabsAll = layouts.reduce((acc, l) => acc + l.tabs.length, 0);
  const totalWidgetsAll = layouts.reduce((acc, l) => acc + l.tabs.reduce((a, tab) => a + tab.widgets.length, 0), 0);
  const { connected } = useIoBroker();

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{t('dashboard.title')}</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{t('dashboard.subtitle')}</p>
      </div>

      <TimerOrphansSection />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label={t('dashboard.stats.layouts')} value={layouts.length} icon={Layers} color="var(--accent)" />
        <StatCard label={t('dashboard.stats.tabs')} value={totalTabsAll} icon={Layout} color="var(--accent-green)" />
        <StatCard label={t('dashboard.stats.widgets')} value={totalWidgetsAll} icon={Hash} color="var(--accent-yellow)" />
        <StatCard label="ioBroker" value={connected ? t('dashboard.stats.connected') : t('dashboard.stats.disconnected')} icon={connected ? Wifi : WifiOff} color={connected ? 'var(--accent-green)' : 'var(--accent-red)'} />
      </div>

      {/* Navigation via ioBroker */}
      <div className="rounded-xl p-5 space-y-3" style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}>
        <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{t('dashboard.nav.title')}</h2>

        <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}>
          <code className="text-sm font-mono flex-1" style={{ color: 'var(--accent)' }}>aura.0.clients.{'<clientId>'}.navigate.url</code>
          <CopyButton text="aura.0.clients.<clientId>.navigate.url" />
        </div>

        <pre className="aura-scroll text-xs font-mono overflow-x-auto px-3 py-2 rounded-lg" style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)' }}>{`setState('aura.0.clients.<clientId>.navigate.url', 'tab-slug');`}</pre>
      </div>

      {/* AURA acronym — small footer */}
      <div className="flex flex-wrap gap-x-6 gap-y-1 px-1">
        {([
          ['A', 'daptive', t('dashboard.aura.adaptive')],
          ['U', 'nified',  t('dashboard.aura.unified')],
          ['R', 'oom',     t('dashboard.aura.room')],
          ['A', 'utomation', t('dashboard.aura.automation')],
        ] as [string, string, string][]).map(([letter, rest, desc]) => (
          <div key={letter + rest} className="flex items-baseline gap-1">
            <span className="text-xs font-bold" style={{ color: 'var(--accent)' }}>{letter}</span>
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{rest}</span>
            <span className="text-xs" style={{ color: 'var(--text-secondary)', opacity: 0.5 }}>· {desc}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
