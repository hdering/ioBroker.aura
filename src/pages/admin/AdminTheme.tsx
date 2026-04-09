import { useThemeStore } from '../../store/themeStore';
import { useConfigStore } from '../../store/configStore';
import { THEMES, getTheme, type ThemeVars } from '../../themes';

// Tailwind text-* defaults (rem) used for preview labels
const FONT_LEVELS = [
  { label: 'Wert / Uhr',    cls: 'text-3xl', rem: 1.875 },
  { label: 'Überschrift',   cls: 'text-xl',  rem: 1.25  },
  { label: 'Subheading',    cls: 'text-lg',  rem: 1.125 },
  { label: 'Fließtext',     cls: 'text-sm',  rem: 0.875 },
  { label: 'Klein / Label', cls: 'text-xs',  rem: 0.75  },
] as const;

const FONT_SCALE_PRESETS = [
  { label: 'XS', value: 0.8  },
  { label: 'S',  value: 0.9  },
  { label: 'M',  value: 1.0  },
  { label: 'L',  value: 1.15 },
  { label: 'XL', value: 1.3  },
  { label: 'XXL',value: 1.5  },
];

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
  const fontScale = frontend.fontScale ?? 1;

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

      {/* Typografie */}
      <div className="rounded-xl p-6 space-y-5" style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}>
        <div>
          <h2 className="font-semibold text-lg" style={{ color: 'var(--text-primary)' }}>Typografie</h2>
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
            Skaliert alle Textgrößen im Frontend proportional. Die Admin-Oberfläche bleibt unverändert.
          </p>
        </div>

        {/* Scale slider */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Schriftgröße</p>
            <span className="text-sm font-mono font-bold px-2.5 py-1 rounded-lg"
              style={{ background: 'var(--app-bg)', color: 'var(--accent)', border: '1px solid var(--app-border)' }}>
              {Math.round(fontScale * 100)} %
            </span>
          </div>
          <input
            type="range" min={0.7} max={1.6} step={0.05}
            value={fontScale}
            onChange={(e) => updateFrontend({ fontScale: Number(e.target.value) })}
            className="w-full accent-[var(--accent)] mb-3"
          />
          <div className="flex gap-2 flex-wrap">
            {FONT_SCALE_PRESETS.map(({ label, value }) => {
              const active = Math.abs(fontScale - value) < 0.01;
              return (
                <button key={value} onClick={() => updateFrontend({ fontScale: value })}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-80"
                  style={{ background: active ? 'var(--accent)' : 'var(--app-bg)', color: active ? '#fff' : 'var(--text-secondary)', border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}` }}>
                  {label} · {Math.round(value * 100)}%
                </button>
              );
            })}
          </div>
        </div>

        {/* Size reference table */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--text-secondary)' }}>
            Größen-Referenz bei {Math.round(fontScale * 100)} %
          </p>
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--app-border)' }}>
            {FONT_LEVELS.map(({ label, cls, rem }, i) => {
              const px = Math.round(rem * fontScale * 16);
              const remScaled = (rem * fontScale).toFixed(3).replace(/\.?0+$/, '');
              return (
                <div key={cls}
                  className="flex items-center gap-4 px-4 py-2.5"
                  style={{ background: i % 2 === 0 ? 'var(--app-bg)' : 'var(--app-surface)', borderBottom: i < FONT_LEVELS.length - 1 ? '1px solid var(--app-border)' : undefined }}>
                  <span className="w-32 shrink-0 text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
                    {cls}
                  </span>
                  <span className="w-28 shrink-0 text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {label}
                  </span>
                  <span className="w-28 shrink-0 text-xs font-mono" style={{ color: 'var(--accent)' }}>
                    {remScaled}rem · {px}px
                  </span>
                  <span style={{ fontSize: `${rem * fontScale}rem`, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                    Beispiel
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {fontScale !== 1 && (
          <button onClick={() => updateFrontend({ fontScale: 1 })}
            className="text-xs hover:opacity-70"
            style={{ color: 'var(--text-secondary)' }}>
            Zurücksetzen (100 %)
          </button>
        )}
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
