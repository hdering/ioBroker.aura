import { useThemeStore } from '../../store/themeStore';
import { useConfigStore } from '../../store/configStore';
import { THEMES, getTheme, type ThemeVars } from '../../themes';

const VAR_GROUPS: { label: string; keys: (keyof ThemeVars)[] }[] = [
  { label: 'App', keys: ['--app-bg', '--app-surface', '--app-border'] },
  { label: 'Widget-Karte', keys: ['--widget-bg', '--widget-border', '--widget-border-width', '--widget-radius', '--widget-shadow'] },
  { label: 'Text', keys: ['--text-primary', '--text-secondary'] },
  { label: 'Farben', keys: ['--accent', '--accent-green', '--accent-yellow', '--accent-red'] },
];

const VAR_LABELS: Partial<Record<keyof ThemeVars, string>> = {
  '--app-bg': 'Hintergrund', '--app-surface': 'Oberfläche', '--app-border': 'Rahmen',
  '--widget-bg': 'Hintergrund', '--widget-border': 'Rahmen', '--widget-border-width': 'Rahmenbreite',
  '--widget-radius': 'Eckenradius', '--widget-shadow': 'Schatten',
  '--text-primary': 'Primär', '--text-secondary': 'Sekundär',
  '--accent': 'Akzent', '--accent-green': 'Grün', '--accent-yellow': 'Gelb', '--accent-red': 'Rot',
};

function isColor(v: string) { return v.startsWith('#') || v.startsWith('rgb') || v.startsWith('hsl'); }

export function AdminTheme() {
  const { themeId, customVars, setTheme, setCustomVar, resetCustom } = useThemeStore();
  const { frontend, updateFrontend } = useConfigStore();
  const activeTheme = getTheme(themeId);

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Theme & CSS</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Globales Design für Frontend und Admin</p>
      </div>

      {/* Preset-Auswahl */}
      <div className="rounded-xl p-6" style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}>
        <h2 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Theme-Preset</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {THEMES.map((theme) => (
            <button
              key={theme.id}
              onClick={() => { setTheme(theme.id); resetCustom(); }}
              className="rounded-xl p-4 text-left transition-opacity hover:opacity-80 space-y-3"
              style={{
                background: theme.vars['--app-surface'],
                border: `2px solid ${themeId === theme.id ? 'var(--accent)' : theme.vars['--app-border']}`,
              }}
            >
              <div className="flex gap-1.5">
                {(['--widget-bg', '--accent', '--accent-green', '--accent-yellow'] as const).map((k) => (
                  <div key={k} className="w-4 h-4 rounded-full" style={{ background: theme.vars[k], border: `1px solid ${theme.vars['--app-border']}` }} />
                ))}
              </div>
              <div>
                <p className="text-sm font-semibold" style={{ color: theme.vars['--text-primary'] }}>{theme.name}</p>
                {themeId === theme.id && <p className="text-xs mt-0.5" style={{ color: theme.vars['--accent'] }}>Aktiv ✓</p>}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* CSS-Variablen anpassen */}
      <div className="rounded-xl p-6" style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>CSS-Variablen anpassen</h2>
          {Object.keys(customVars).length > 0 && (
            <button onClick={resetCustom} className="text-xs px-3 py-1.5 rounded-lg hover:opacity-80"
              style={{ background: 'var(--app-bg)', color: 'var(--accent-red)', border: '1px solid var(--app-border)' }}>
              Alle zurücksetzen
            </button>
          )}
        </div>
        <div className="space-y-6">
          {VAR_GROUPS.map(({ label, keys }) => (
            <div key={label}>
              <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--text-secondary)' }}>{label}</p>
              <div className="space-y-3">
                {keys.map((key) => {
                  const base = activeTheme.vars[key];
                  const custom = customVars[key];
                  const current = custom ?? base;
                  return (
                    <div key={key} className="flex items-center gap-3">
                      <label className="text-xs w-32 shrink-0" style={{ color: 'var(--text-secondary)' }}>{VAR_LABELS[key] ?? key}</label>
                      <div className="flex items-center gap-2 flex-1">
                        {isColor(current) && (
                          <input type="color" value={current.startsWith('#') ? current : '#000000'}
                            onChange={(e) => setCustomVar(key, e.target.value)}
                            className="w-8 h-8 rounded-lg cursor-pointer border-0 p-0.5 shrink-0"
                            style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }} />
                        )}
                        <input type="text" value={custom ?? ''}
                          placeholder={base}
                          onChange={(e) => { if (e.target.value) setCustomVar(key, e.target.value); else resetCustom(); }}
                          className="flex-1 text-xs rounded-lg px-3 py-2 focus:outline-none font-mono"
                          style={{ background: 'var(--app-bg)', color: custom ? 'var(--text-primary)' : 'var(--text-secondary)', border: `1px solid ${custom ? 'var(--accent)' : 'var(--app-border)'}` }} />
                        {custom && (
                          <button onClick={() => { const next = { ...customVars }; delete next[key]; resetCustom(); Object.entries(next).forEach(([k, v]) => setCustomVar(k as keyof ThemeVars, v!)); }}
                            className="text-xs hover:opacity-70 shrink-0" style={{ color: 'var(--text-secondary)' }}>✕</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Custom CSS */}
      <div className="rounded-xl p-6" style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}>
        <h2 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Globales CSS</h2>
        <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
          Wird direkt auf das Frontend angewendet. CSS-Variablen, Animationen, Font-Overrides etc.
        </p>
        <textarea
          value={frontend.customCSS}
          onChange={(e) => updateFrontend({ customCSS: e.target.value })}
          rows={12}
          spellCheck={false}
          placeholder={`/* Beispiele */\n:root { --widget-radius: 0.5rem; }\n.widget-card { transition: transform 0.2s; }\n.widget-card:hover { transform: scale(1.02); }\n@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap');\nbody { font-family: 'Inter', sans-serif; }`}
          className="w-full rounded-xl px-4 py-3 text-xs font-mono focus:outline-none resize-none"
          style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)', lineHeight: 1.7 }}
        />
        <p className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>
          {frontend.customCSS.trim() ? `${frontend.customCSS.split('\n').length} Zeilen` : 'Kein Custom CSS'}
        </p>
      </div>
    </div>
  );
}
