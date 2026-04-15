import { useThemeStore } from '../../store/themeStore';
import { useConfigStore } from '../../store/configStore';
import { THEMES, getTheme, type ThemeVars } from '../../themes';
import { useT } from '../../i18n';

function SpacingSlider({ label, value, min, max, step, unit = 'px', onChange, presets }: {
  label: string; value: number; min: number; max: number; step: number;
  unit?: string; onChange: (v: number) => void;
  presets: { label: string; value: number }[];
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{label}</p>
        <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md"
          style={{ background: 'var(--app-bg)', color: 'var(--accent)', border: '1px solid var(--app-border)' }}>
          {value}{unit}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--accent)] mb-2" />
      <div className="flex gap-1.5 flex-wrap">
        {presets.map((p) => {
          const active = value === p.value;
          return (
            <button key={p.value} onClick={() => onChange(p.value)}
              className="px-2.5 py-1 rounded-lg text-xs font-medium hover:opacity-80"
              style={{ background: active ? 'var(--accent)' : 'var(--app-bg)', color: active ? '#fff' : 'var(--text-secondary)', border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}` }}>
              {p.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const FONT_SCALE_PRESETS = [
  { label: 'XS', value: 0.8  },
  { label: 'S',  value: 0.9  },
  { label: 'M',  value: 1.0  },
  { label: 'L',  value: 1.15 },
  { label: 'XL', value: 1.3  },
  { label: 'XXL',value: 1.5  },
];

const VAR_GROUPS: { labelKey: string; keys: (keyof ThemeVars)[] }[] = [
  { labelKey: 'theme.vars.app',    keys: ['--app-bg', '--app-surface', '--app-border'] },
  { labelKey: 'theme.vars.widget', keys: ['--widget-bg', '--widget-border', '--widget-border-width', '--widget-radius', '--widget-shadow'] },
  { labelKey: 'theme.vars.text',   keys: ['--text-primary', '--text-secondary'] },
  { labelKey: 'theme.vars.colors', keys: ['--accent', '--accent-green', '--accent-yellow', '--accent-red'] },
];

const VAR_LABEL_KEYS: Partial<Record<keyof ThemeVars, string>> = {
  '--app-bg': 'theme.vars.bg', '--app-surface': 'theme.vars.surface', '--app-border': 'theme.vars.border',
  '--widget-bg': 'theme.vars.bg', '--widget-border': 'theme.vars.border', '--widget-border-width': 'theme.vars.borderWidth',
  '--widget-radius': 'theme.vars.radius', '--widget-shadow': 'theme.vars.shadow',
  '--text-primary': 'theme.vars.primary', '--text-secondary': 'theme.vars.secondary',
  '--accent': 'theme.vars.accent', '--accent-green': 'theme.vars.green', '--accent-yellow': 'theme.vars.yellow', '--accent-red': 'theme.vars.red',
};

function isColor(v: string) { return v.startsWith('#') || v.startsWith('rgb') || v.startsWith('hsl'); }

export function AdminTheme() {
  const t = useT();
  const { themeId, customVars, setTheme, setCustomVar, resetCustom } = useThemeStore();
  const { frontend, updateFrontend } = useConfigStore();
  const activeTheme = getTheme(themeId);
  const fontScale = frontend.fontScale ?? 1;

  const FONT_LEVELS = [
    { labelKey: 'theme.typography.value',      cls: 'text-3xl', rem: 1.875 },
    { labelKey: 'theme.typography.heading',     cls: 'text-xl',  rem: 1.25  },
    { labelKey: 'theme.typography.subheading',  cls: 'text-lg',  rem: 1.125 },
    { labelKey: 'theme.typography.body',        cls: 'text-sm',  rem: 0.875 },
    { labelKey: 'theme.typography.small',       cls: 'text-xs',  rem: 0.75  },
  ] as const;

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{t('theme.title')}</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{t('theme.subtitle')}</p>
      </div>

      {/* Preset-Auswahl */}
      <div className="rounded-xl p-6" style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}>
        <h2 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>{t('theme.preset.title')}</h2>
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
                {themeId === theme.id && <p className="text-xs mt-0.5" style={{ color: theme.vars['--accent'] }}>{t('theme.preset.active')}</p>}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* CSS-Variablen anpassen */}
      <div className="rounded-xl p-6" style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{t('theme.vars.title')}</h2>
          <button
            onClick={resetCustom}
            disabled={Object.keys(customVars).length === 0}
            className="text-xs px-3 py-1.5 rounded-lg hover:opacity-80 disabled:opacity-30 disabled:cursor-not-allowed"
            style={{ background: 'var(--app-bg)', color: 'var(--accent-red)', border: '1px solid var(--app-border)' }}
          >
            {t('theme.vars.resetAll')}
          </button>
        </div>
        <div className="space-y-6">
          {VAR_GROUPS.map(({ labelKey, keys }) => (
            <div key={labelKey}>
              <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--text-secondary)' }}>{t(labelKey as never)}</p>
              <div className="space-y-3">
                {keys.map((key) => {
                  const base = activeTheme.vars[key];
                  const custom = customVars[key];
                  const current = custom ?? base;
                  const varLabelKey = VAR_LABEL_KEYS[key];
                  return (
                    <div key={key} className="flex items-center gap-3">
                      <label className="text-xs w-32 shrink-0" style={{ color: 'var(--text-secondary)' }}>
                        {varLabelKey ? t(varLabelKey as never) : key}
                      </label>
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
          <h2 className="font-semibold text-lg" style={{ color: 'var(--text-primary)' }}>{t('theme.typography.title')}</h2>
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
            {t('theme.typography.subtitle')}
          </p>
        </div>

        {/* Scale slider */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t('theme.typography.fontSize')}</p>
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
            {t('theme.typography.reference', { percent: String(Math.round(fontScale * 100)) })}
          </p>
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--app-border)' }}>
            {FONT_LEVELS.map(({ labelKey, cls, rem }, i) => {
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
                    {t(labelKey as never)}
                  </span>
                  <span className="w-28 shrink-0 text-xs font-mono" style={{ color: 'var(--accent)' }}>
                    {remScaled}rem · {px}px
                  </span>
                  <span style={{ fontSize: `${rem * fontScale}rem`, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                    {t('theme.typography.example')}
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
            {t('theme.typography.reset')}
          </button>
        )}
      </div>

      {/* Layout & Abstände */}
      <div className="rounded-xl p-6 space-y-5" style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}>
        <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{t('theme.layout.title')}</h2>
        <SpacingSlider
          label={t('theme.layout.gap')}
          value={frontend.gridGap ?? 10}
          min={0} max={40} step={2} unit=" px"
          onChange={(v) => updateFrontend({ gridGap: v })}
          presets={[{ label: '0', value: 0 }, { label: '4', value: 4 }, { label: '8', value: 8 }, { label: '10', value: 10 }, { label: '16', value: 16 }, { label: '24', value: 24 }]}
        />
        <SpacingSlider
          label={t('theme.layout.padding')}
          value={frontend.widgetPadding ?? 16}
          min={0} max={40} step={2} unit=" px"
          onChange={(v) => updateFrontend({ widgetPadding: v })}
          presets={[{ label: '0', value: 0 }, { label: '8', value: 8 }, { label: '12', value: 12 }, { label: '16', value: 16 }, { label: '24', value: 24 }]}
        />
      </div>

      {/* Custom CSS */}
      <div className="rounded-xl p-6" style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}>
        <h2 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>{t('theme.css.title')}</h2>
        <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
          {t('theme.css.subtitle')}
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
          {frontend.customCSS.trim()
            ? t('theme.css.lines', { count: String(frontend.customCSS.split('\n').length) })
            : t('theme.css.empty')}
        </p>
      </div>
    </div>
  );
}
