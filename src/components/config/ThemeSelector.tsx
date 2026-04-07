import { useState } from 'react';
import { useThemeStore } from '../../store/themeStore';
import { THEMES, getTheme, type ThemeVars } from '../../themes';

const VAR_LABELS: Partial<Record<keyof ThemeVars, string>> = {
  '--app-bg': 'App Hintergrund',
  '--app-surface': 'Oberfläche',
  '--app-border': 'Rahmen',
  '--widget-bg': 'Widget Hintergrund',
  '--widget-border': 'Widget Rahmen',
  '--widget-radius': 'Eckenradius',
  '--widget-shadow': 'Schatten',
  '--text-primary': 'Text Primär',
  '--text-secondary': 'Text Sekundär',
  '--accent': 'Akzentfarbe',
  '--accent-green': 'Grün',
  '--accent-yellow': 'Gelb',
  '--accent-red': 'Rot',
};

// Prüft ob ein String eine CSS-Farbe ist (für den Colorpicker)
function isColor(v: string) {
  return v.startsWith('#') || v.startsWith('rgb') || v.startsWith('hsl');
}

export function ThemeSelector() {
  const { themeId, customVars, setTheme, setCustomVar, resetCustom } = useThemeStore();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'presets' | 'custom'>('presets');

  const activeTheme = getTheme(themeId);
  const effectiveVars = { ...activeTheme.vars, ...customVars };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-8 h-8 flex items-center justify-center rounded-full hover:opacity-80 transition-opacity text-sm"
        style={{ background: 'var(--app-surface)', color: 'var(--text-secondary)' }}
        title="Theme wählen"
      >
        🎨
      </button>

      {open && (
        <div
          className="absolute right-0 top-10 w-80 rounded-xl shadow-2xl z-50 border overflow-hidden"
          style={{ background: 'var(--app-surface)', borderColor: 'var(--app-border)' }}
        >
          {/* Tabs */}
          <div className="flex border-b" style={{ borderColor: 'var(--app-border)' }}>
            {(['presets', 'custom'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="flex-1 py-2.5 text-sm font-medium transition-colors"
                style={{
                  color: tab === t ? 'var(--accent)' : 'var(--text-secondary)',
                  borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
                }}
              >
                {t === 'presets' ? 'Presets' : 'Anpassen'}
              </button>
            ))}
          </div>

          {tab === 'presets' && (
            <div className="p-3 space-y-2 max-h-80 overflow-y-auto">
              {THEMES.map((theme) => (
                <button
                  key={theme.id}
                  onClick={() => { setTheme(theme.id); resetCustom(); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-opacity hover:opacity-80"
                  style={{
                    background: themeId === theme.id ? 'var(--accent)' + '22' : 'var(--app-bg)',
                    border: `1px solid ${themeId === theme.id ? 'var(--accent)' : 'var(--app-border)'}`,
                  }}
                >
                  {/* Mini-Vorschau */}
                  <div className="flex gap-1 shrink-0">
                    {['--widget-bg', '--accent', '--accent-green'].map((v) => (
                      <div
                        key={v}
                        className="w-4 h-4 rounded-full border"
                        style={{ background: theme.vars[v as keyof ThemeVars], borderColor: theme.vars['--app-border'] }}
                      />
                    ))}
                  </div>
                  <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    {theme.name}
                  </span>
                  {themeId === theme.id && (
                    <span className="ml-auto text-xs" style={{ color: 'var(--accent)' }}>✓</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {tab === 'custom' && (
            <div className="p-3 space-y-2 max-h-80 overflow-y-auto">
              <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
                Basierend auf: <strong style={{ color: 'var(--text-primary)' }}>{activeTheme.name}</strong>
              </p>
              {(Object.keys(VAR_LABELS) as (keyof ThemeVars)[]).map((key) => {
                const label = VAR_LABELS[key]!;
                const currentVal = effectiveVars[key] ?? '';
                const isColorVal = isColor(currentVal);
                return (
                  <div key={key} className="flex items-center gap-2">
                    <label className="text-xs w-32 shrink-0" style={{ color: 'var(--text-secondary)' }}>{label}</label>
                    <div className="flex-1 flex gap-1">
                      {isColorVal && (
                        <input
                          type="color"
                          value={currentVal.startsWith('#') ? currentVal : '#3b82f6'}
                          onChange={(e) => setCustomVar(key, e.target.value)}
                          className="w-7 h-7 rounded cursor-pointer border-0 p-0"
                          style={{ background: 'none' }}
                        />
                      )}
                      <input
                        type="text"
                        value={customVars[key] ?? ''}
                        placeholder={activeTheme.vars[key]}
                        onChange={(e) => setCustomVar(key, e.target.value || activeTheme.vars[key])}
                        className="flex-1 text-xs rounded px-2 py-1 border focus:outline-none"
                        style={{
                          background: 'var(--app-bg)',
                          color: 'var(--text-primary)',
                          borderColor: 'var(--app-border)',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
              <button
                onClick={resetCustom}
                className="w-full mt-2 py-1.5 text-xs rounded"
                style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
              >
                Anpassungen zurücksetzen
              </button>
            </div>
          )}
        </div>
      )}

      {open && <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />}
    </div>
  );
}
