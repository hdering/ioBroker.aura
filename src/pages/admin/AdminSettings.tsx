import { useState } from 'react';
import { useAuthStore, setupPin } from '../../store/authStore';
import { useDashboardStore } from '../../store/dashboardStore';
import { useConnectionStore } from '../../store/connectionStore';
import { reconnectSocket } from '../../hooks/useIoBroker';
import { Eye, EyeOff, AlertTriangle, Lock, Unlock, RefreshCw } from 'lucide-react';

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function ExpertSettings() {
  const { pinHash } = useAuthStore();
  const { ioBrokerUrl, setIoBrokerUrl } = useConnectionStore();
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [urlInput, setUrlInput] = useState(ioBrokerUrl);
  const [saved, setSaved] = useState(false);

  const unlock = async (e: React.FormEvent) => {
    e.preventDefault();
    const hash = await sha256(pin);
    if (hash === pinHash) {
      setUnlocked(true);
      setPinError('');
      setPin('');
    } else {
      setPinError('Falscher PIN');
    }
  };

  const saveUrl = async () => {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    setIoBrokerUrl(trimmed);
    await reconnectSocket(trimmed);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="rounded-xl p-6 space-y-4"
      style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}>
      <div className="flex items-center gap-3">
        {unlocked ? <Unlock size={17} style={{ color: 'var(--accent-yellow)' }} /> : <Lock size={17} style={{ color: 'var(--text-secondary)' }} />}
        <div>
          <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Experten-Einstellungen</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            {unlocked ? 'Entsperrt – Änderungen wirken sofort' : 'Zugang mit Admin-PIN'}
          </p>
        </div>
      </div>

      {!unlocked ? (
        <form onSubmit={unlock} className="flex gap-2 max-w-sm">
          <input
            type="password"
            value={pin}
            onChange={(e) => { setPin(e.target.value); setPinError(''); }}
            placeholder="Admin-PIN eingeben"
            className="flex-1 rounded-xl px-3 py-2 text-sm focus:outline-none"
            style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: `1px solid ${pinError ? 'var(--accent-red)' : 'var(--app-border)'}` }}
          />
          <button type="submit"
            className="px-4 py-2 rounded-xl text-sm font-medium text-white hover:opacity-80"
            style={{ background: 'var(--accent)' }}>
            Entsperren
          </button>
          {pinError && <p className="text-xs self-center" style={{ color: 'var(--accent-red)' }}>{pinError}</p>}
        </form>
      ) : (
        <div className="space-y-4">
          {/* ioBroker URL */}
          <div>
            <label className="text-sm font-medium block mb-1.5" style={{ color: 'var(--text-primary)' }}>
              ioBroker Web-Adapter URL
            </label>
            <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
              Adresse des ioBroker-Servers inkl. Port (z.&nbsp;B. <code className="px-1 rounded" style={{ background: 'var(--app-bg)' }}>http://192.168.1.10:8082</code>)
            </p>
            <div className="flex gap-2 max-w-md">
              <input
                type="text"
                value={urlInput}
                onChange={(e) => { setUrlInput(e.target.value); setSaved(false); }}
                className="flex-1 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none"
                style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}
              />
              <button
                onClick={saveUrl}
                disabled={urlInput.trim() === ioBrokerUrl && !saved}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium text-white hover:opacity-80 disabled:opacity-40"
                style={{ background: saved ? 'var(--accent-green)' : 'var(--accent)' }}>
                <RefreshCw size={13} />
                {saved ? 'Verbunden' : 'Verbinden'}
              </button>
            </div>
          </div>

          <button onClick={() => setUnlocked(false)}
            className="text-xs hover:opacity-70"
            style={{ color: 'var(--text-secondary)' }}>
            Sperren
          </button>
        </div>
      )}
    </div>
  );
}

export function AdminSettings() {
  const { } = useAuthStore();
  const { tabs } = useDashboardStore();
  const [newPin, setNewPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [pinMsg, setPinMsg] = useState('');
  const [showReset, setShowReset] = useState(false);

  const handlePinChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPin.length < 4) { setPinMsg('Mindestens 4 Zeichen'); return; }
    if (newPin !== confirm) { setPinMsg('PINs stimmen nicht überein'); return; }
    await setupPin(newPin);
    setPinMsg('PIN erfolgreich geändert');
    setNewPin(''); setConfirm('');
    setTimeout(() => setPinMsg(''), 3000);
  };

  const exportConfig = () => {
    const data = {
      dashboard: JSON.parse(localStorage.getItem('aura-dashboard') ?? '{}'),
      theme: JSON.parse(localStorage.getItem('aura-theme') ?? '{}'),
      config: JSON.parse(localStorage.getItem('aura-config') ?? '{}'),
      exported: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `aura-backup-${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const importConfig = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (data.dashboard) localStorage.setItem('aura-dashboard', JSON.stringify(data.dashboard));
        if (data.theme) localStorage.setItem('aura-theme', JSON.stringify(data.theme));
        if (data.config) localStorage.setItem('aura-config', JSON.stringify(data.config));
        window.location.reload();
      } catch { alert('Ungültige Backup-Datei'); }
    };
    reader.readAsText(file);
  };

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Einstellungen</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Sicherheit, Backup und Verwaltung</p>
      </div>

      {/* PIN ändern */}
      <div className="rounded-xl p-6" style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}>
        <h2 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Admin-PIN ändern</h2>
        <form onSubmit={handlePinChange} className="space-y-3 max-w-sm">
          <div className="relative">
            <input type={show ? 'text' : 'password'} value={newPin} onChange={(e) => setNewPin(e.target.value)}
              placeholder="Neuer PIN (min. 4 Zeichen)"
              className="w-full rounded-xl px-4 py-2.5 pr-10 text-sm focus:outline-none"
              style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }} />
            <button type="button" onClick={() => setShow((s) => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)' }}>
              {show ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          <input type={show ? 'text' : 'password'} value={confirm} onChange={(e) => setConfirm(e.target.value)}
            placeholder="PIN bestätigen"
            className="w-full rounded-xl px-4 py-2.5 text-sm focus:outline-none"
            style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }} />
          {pinMsg && <p className="text-sm" style={{ color: pinMsg.includes('erfolgreich') ? 'var(--accent-green)' : 'var(--accent-red)' }}>{pinMsg}</p>}
          <button type="submit" className="px-5 py-2.5 rounded-xl text-sm font-medium text-white hover:opacity-80"
            style={{ background: 'var(--accent)' }}>PIN speichern</button>
        </form>
      </div>

      {/* Backup */}
      <div className="rounded-xl p-6" style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}>
        <h2 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Backup & Restore</h2>
        <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
          Exportiert alle Dashboards ({tabs.length} Tabs), Theme- und Konfigurationseinstellungen als JSON.
        </p>
        <div className="flex gap-3">
          <button onClick={exportConfig} className="px-4 py-2.5 rounded-xl text-sm font-medium text-white hover:opacity-80"
            style={{ background: 'var(--accent)' }}>Download Backup</button>
          <label className="px-4 py-2.5 rounded-xl text-sm font-medium cursor-pointer hover:opacity-80"
            style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}>
            Backup importieren
            <input type="file" accept=".json" onChange={importConfig} className="hidden" />
          </label>
        </div>
      </div>

      {/* Experten-Einstellungen */}
      <ExpertSettings />

      {/* Reset */}
      <div className="rounded-xl p-6" style={{ background: 'var(--app-surface)', border: `1px solid var(--accent-red)44` }}>
        <div className="flex items-center gap-3 mb-3">
          <AlertTriangle size={18} style={{ color: 'var(--accent-red)' }} />
          <h2 className="font-semibold" style={{ color: 'var(--accent-red)' }}>Alles zurücksetzen</h2>
        </div>
        <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
          Löscht alle Dashboards, Widgets, Themes und Einstellungen. Nicht rückgängig zu machen.
        </p>
        {!showReset ? (
          <button onClick={() => setShowReset(true)} className="px-4 py-2.5 rounded-xl text-sm font-medium hover:opacity-80"
            style={{ background: 'var(--accent-red)22', color: 'var(--accent-red)', border: '1px solid var(--accent-red)44' }}>
            Zurücksetzen…
          </button>
        ) : (
          <div className="flex gap-3">
            <button onClick={() => {
              ['aura-dashboard', 'aura-theme', 'aura-config'].forEach((k) => localStorage.removeItem(k));
              window.location.href = '/';
            }} className="px-4 py-2.5 rounded-xl text-sm font-medium text-white hover:opacity-80"
              style={{ background: 'var(--accent-red)' }}>Ja, alles löschen</button>
            <button onClick={() => setShowReset(false)} className="px-4 py-2.5 rounded-xl text-sm font-medium hover:opacity-80"
              style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>Abbruch</button>
          </div>
        )}
      </div>
    </div>
  );
}
