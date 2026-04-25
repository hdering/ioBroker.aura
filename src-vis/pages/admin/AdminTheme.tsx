import { useState } from 'react';
import { useThemeStore } from '../../store/themeStore';
import { useConfigStore } from '../../store/configStore';
import { useDashboardStore } from '../../store/dashboardStore';
import { THEMES, getTheme, type ThemeVars } from '../../themes';
import { useT } from '../../i18n';
import type { LayoutSettings } from '../../store/dashboardStore';

function SpacingSlider({ label, value, min, max, step, unit = 'px', onChange, presets, isOverridden, onClearOverride }: {
  label: string; value: number; min: number; max: number; step: number;
  unit?: string; onChange: (v: number) => void;
  presets: { label: string; value: number }[];
  isOverridden?: boolean;
  onClearOverride?: () => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{label}</p>
          {isOverridden && (
            <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: 'color-mix(in srgb, var(--accent) 15%, transparent)', color: 'var(--accent)' }}>
              Layout
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {isOverridden && onClearOverride && (
            <button onClick={onClearOverride} className="text-[10px] px-1.5 py-0.5 rounded hover:opacity-70" style={{ color: 'var(--text-secondary)' }}>
              ↩ Global
            </button>
          )}
          <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md"
            style={{ background: 'var(--app-bg)', color: 'var(--accent)', border: '1px solid var(--app-border)' }}>
            {value}{unit}
          </span>
        </div>
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

// ── Layout context switcher (inline) ──────────────────────────────────────────
function LayoutContextSwitcher({
  selectedId,
  onChange,
}: {
  selectedId: string | null;
  onChange: (id: string | null) => void;
}) {
  const layouts = useDashboardStore((s) => s.layouts);
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[11px] shrink-0" style={{ color: 'var(--text-secondary)' }}>Kontext:</span>
      <div className="flex gap-1 flex-wrap">
        <button
          onClick={() => onChange(null)}
          className="px-2.5 py-1 rounded-lg text-xs font-medium hover:opacity-80"
          style={{
            background: selectedId === null ? 'var(--accent)' : 'var(--app-bg)',
            color: selectedId === null ? '#fff' : 'var(--text-secondary)',
            border: `1px solid ${selectedId === null ? 'var(--accent)' : 'var(--app-border)'}`,
          }}
        >
          Global
        </button>
        {layouts.map((l) => (
          <button
            key={l.id}
            onClick={() => onChange(l.id)}
            className="px-2.5 py-1 rounded-lg text-xs font-medium hover:opacity-80"
            style={{
              background: selectedId === l.id ? 'var(--accent)' : 'var(--app-bg)',
              color: selectedId === l.id ? '#fff' : 'var(--text-secondary)',
              border: `1px solid ${selectedId === l.id ? 'var(--accent)' : 'var(--app-border)'}`,
            }}
          >
            {l.name}
          </button>
        ))}
      </div>
    </div>
  );
}

export function AdminTheme() {
  const t = useT();
  const { themeId, customVars, setTheme, setCustomVar, resetCustom,
          followBrowser, browserDarkThemeId, browserLightThemeId,
          setFollowBrowser, setBrowserDarkThemeId, setBrowserLightThemeId } = useThemeStore();
  const { frontend, updateFrontend } = useConfigStore();
  const layouts = useDashboardStore((s) => s.layouts);
  const updateLayoutSettings = useDashboardStore((s) => s.updateLayoutSettings);
  const clearLayoutSettings  = useDashboardStore((s) => s.clearLayoutSettings);

  // Layout context for Theme, Typografie+Spacing, and CSS sections
  const [themeContextId,  setThemeContextId]  = useState<string | null>(null);
  const [spacingContextId, setSpacingContextId] = useState<string | null>(null);
  const [cssContextId,    setCssContextId]    = useState<string | null>(null);

  // Effective values for each context
  const themeLs    = themeContextId  ? layouts.find((l) => l.id === themeContextId)?.settings  : undefined;
  const spacingLs  = spacingContextId ? layouts.find((l) => l.id === spacingContextId)?.settings : undefined;
  const cssLs      = cssContextId    ? layouts.find((l) => l.id === cssContextId)?.settings    : undefined;

  const effectiveThemeId  = themeLs?.themeId ?? themeId;
  const effectiveVars     = themeLs?.customVars ?? customVars;
  const activeTheme = getTheme(effectiveThemeId);

  const fontScale  = (spacingLs?.fontScale  ?? frontend.fontScale)  ?? 1;
  const gridGap    = (spacingLs?.gridGap    ?? frontend.gridGap)    ?? 10;
  const widgetPad  = (spacingLs?.widgetPadding ?? frontend.widgetPadding) ?? 16;

  const cssEnabled = (cssLs?.customCSSEnabled ?? frontend.customCSSEnabled) ?? true;
  const cssValue   = cssLs?.customCSS ?? frontend.customCSS ?? '';

  // Helper to set a spacing value in the active context
  function setSpacing<K extends keyof LayoutSettings & keyof typeof frontend>(key: K, v: number) {
    if (!spacingContextId) updateFrontend({ [key]: v } as never);
    else updateLayoutSettings(spacingContextId, { [key]: v } as Partial<LayoutSettings>);
  }

  function clearSpacing(key: keyof LayoutSettings) {
    if (spacingContextId) clearLayoutSettings(spacingContextId, key);
  }

  function setCss(patch: Partial<Pick<LayoutSettings, 'customCSS' | 'customCSSEnabled'>>) {
    if (!cssContextId) updateFrontend(patch as never);
    else updateLayoutSettings(cssContextId, patch);
  }

  const isThemeOv = (key: keyof typeof customVars) =>
    themeContextId !== null && themeLs?.customVars?.[key] !== undefined;

  function setThemeVar(key: keyof ThemeVars, value: string) {
    if (!themeContextId) setCustomVar(key, value);
    else {
      const next = { ...effectiveVars, [key]: value };
      updateLayoutSettings(themeContextId, { customVars: next });
    }
  }

  function clearThemeVar(key: keyof ThemeVars) {
    if (!themeContextId) {
      const next = { ...customVars }; delete next[key];
      resetCustom();
      Object.entries(next).forEach(([k, v]) => setCustomVar(k as keyof ThemeVars, v!));
    } else {
      const next = { ...effectiveVars }; delete next[key];
      updateLayoutSettings(themeContextId, { customVars: Object.keys(next).length ? next : undefined });
    }
  }

  function resetAllVars() {
    if (!themeContextId) { resetCustom(); return; }
    updateLayoutSettings(themeContextId, { customVars: undefined });
  }

  const hasCustomVars = themeContextId
    ? Object.keys(themeLs?.customVars ?? {}).length > 0
    : Object.keys(customVars).length > 0;

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

      {/* Browser-Theme-Sync */}
      {!themeContextId && (() => {
        const selSty = { background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)', borderRadius: 8, padding: '4px 8px', fontSize: 12 };
        return (
          <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Theme folgt Browser</p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Wechselt automatisch je nach System-Einstellung (Hell/Dunkel)</p>
              </div>
              <button onClick={() => setFollowBrowser(!followBrowser)}
                className="relative w-9 h-5 rounded-full transition-colors shrink-0"
                style={{ background: followBrowser ? 'var(--accent)' : 'var(--app-border)' }}>
                <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                  style={{ left: followBrowser ? '18px' : '2px' }} />
              </button>
            </div>
            {followBrowser && (
              <div className="flex gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Dunkel-Theme</label>
                  <select value={browserDarkThemeId} style={selSty} className="w-full focus:outline-none"
                    onChange={(e) => setBrowserDarkThemeId(e.target.value)}>
                    {THEMES.filter((t) => t.dark).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div className="flex-1 min-w-0">
                  <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Hell-Theme</label>
                  <select value={browserLightThemeId} style={selSty} className="w-full focus:outline-none"
                    onChange={(e) => setBrowserLightThemeId(e.target.value)}>
                    {THEMES.filter((t) => !t.dark).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Preset-Auswahl */}
      <div className="rounded-xl p-6" style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{t('theme.preset.title')}</h2>
          <LayoutContextSwitcher selectedId={themeContextId} onChange={setThemeContextId} />
        </div>
        {themeContextId && (
          <p className="text-xs mb-3 px-2 py-1 rounded" style={{ color: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 10%, transparent)' }}>
            Theme-Auswahl und CSS-Variablen für dieses Layout überschreiben — das globale Theme bleibt unberührt.
          </p>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {THEMES.map((theme) => {
            const activeId = effectiveThemeId;
            return (
              <button
                key={theme.id}
                onClick={() => {
                  if (!themeContextId) { setTheme(theme.id); resetCustom(); }
                  else updateLayoutSettings(themeContextId, { themeId: theme.id, customVars: undefined });
                }}
                className="rounded-xl p-4 text-left transition-opacity hover:opacity-80 space-y-3"
                style={{
                  background: theme.vars['--app-surface'],
                  border: `2px solid ${activeId === theme.id ? 'var(--accent)' : theme.vars['--app-border']}`,
                }}
              >
                <div className="flex gap-1.5">
                  {(['--widget-bg', '--accent', '--accent-green', '--accent-yellow'] as const).map((k) => (
                    <div key={k} className="w-4 h-4 rounded-full" style={{ background: theme.vars[k], border: `1px solid ${theme.vars['--app-border']}` }} />
                  ))}
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: theme.vars['--text-primary'] }}>{theme.name}</p>
                  {activeId === theme.id && <p className="text-xs mt-0.5" style={{ color: theme.vars['--accent'] }}>{t('theme.preset.active')}</p>}
                </div>
              </button>
            );
          })}
        </div>
        {themeContextId && themeLs?.themeId && (
          <button
            onClick={() => clearLayoutSettings(themeContextId, 'themeId')}
            className="mt-3 text-xs hover:opacity-70"
            style={{ color: 'var(--text-secondary)' }}
          >
            ↩ Auf Global zurücksetzen
          </button>
        )}
      </div>

      {/* CSS-Variablen anpassen */}
      <div className="rounded-xl p-6" style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{t('theme.vars.title')}</h2>
          <div className="flex items-center gap-3 flex-wrap">
            <LayoutContextSwitcher selectedId={themeContextId} onChange={setThemeContextId} />
            <button
              onClick={resetAllVars}
              disabled={!hasCustomVars}
              className="text-xs px-3 py-1.5 rounded-lg hover:opacity-80 disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ background: 'var(--app-bg)', color: 'var(--accent-red)', border: '1px solid var(--app-border)' }}
            >
              {t('theme.vars.resetAll')}
            </button>
          </div>
        </div>
        <div className="space-y-6">
          {VAR_GROUPS.map(({ labelKey, keys }) => (
            <div key={labelKey}>
              <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--text-secondary)' }}>{t(labelKey as never)}</p>
              <div className="space-y-3">
                {keys.map((key) => {
                  const base = activeTheme.vars[key];
                  const custom = effectiveVars[key];
                  const current = custom ?? base;
                  const varLabelKey = VAR_LABEL_KEYS[key];
                  const isOv = isThemeOv(key);
                  return (
                    <div key={key} className="flex items-center gap-3">
                      <label className="text-xs w-32 shrink-0 flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                        {varLabelKey ? t(varLabelKey as never) : key}
                        {isOv && (
                          <span className="text-[9px] px-1 py-0.5 rounded font-medium" style={{ background: 'color-mix(in srgb, var(--accent) 15%, transparent)', color: 'var(--accent)' }}>L</span>
                        )}
                      </label>
                      <div className="flex items-center gap-2 flex-1">
                        {isColor(current) && (
                          <input type="color" value={current.startsWith('#') ? current : '#000000'}
                            onChange={(e) => setThemeVar(key, e.target.value)}
                            className="w-8 h-8 rounded-lg cursor-pointer border-0 p-0.5 shrink-0"
                            style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }} />
                        )}
                        <input type="text" value={custom ?? ''}
                          placeholder={base}
                          onChange={(e) => { if (e.target.value) setThemeVar(key, e.target.value); else clearThemeVar(key); }}
                          className="flex-1 text-xs rounded-lg px-3 py-2 focus:outline-none font-mono"
                          style={{ background: 'var(--app-bg)', color: custom ? 'var(--text-primary)' : 'var(--text-secondary)', border: `1px solid ${custom ? 'var(--accent)' : 'var(--app-border)'}` }} />
                        {custom && (
                          <button onClick={() => clearThemeVar(key)}
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
        <div className="flex items-start justify-between flex-wrap gap-2">
          <div>
            <h2 className="font-semibold text-lg" style={{ color: 'var(--text-primary)' }}>{t('theme.typography.title')}</h2>
            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
              {t('theme.typography.subtitle')}
            </p>
          </div>
          <LayoutContextSwitcher selectedId={spacingContextId} onChange={setSpacingContextId} />
        </div>

        {/* Scale slider */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t('theme.typography.fontSize')}</p>
              {spacingContextId && spacingLs?.fontScale !== undefined && (
                <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: 'color-mix(in srgb, var(--accent) 15%, transparent)', color: 'var(--accent)' }}>Layout</span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {spacingContextId && spacingLs?.fontScale !== undefined && (
                <button onClick={() => clearSpacing('fontScale')} className="text-[10px] px-1.5 py-0.5 rounded hover:opacity-70" style={{ color: 'var(--text-secondary)' }}>↩ Global</button>
              )}
              <span className="text-sm font-mono font-bold px-2.5 py-1 rounded-lg"
                style={{ background: 'var(--app-bg)', color: 'var(--accent)', border: '1px solid var(--app-border)' }}>
                {Math.round(fontScale * 100)} %
              </span>
            </div>
          </div>
          <input
            type="range" min={0.7} max={1.6} step={0.05}
            value={fontScale}
            onChange={(e) => setSpacing('fontScale', Number(e.target.value))}
            className="w-full accent-[var(--accent)] mb-3"
          />
          <div className="flex gap-2 flex-wrap">
            {FONT_SCALE_PRESETS.map(({ label, value }) => {
              const active = Math.abs(fontScale - value) < 0.01;
              return (
                <button key={value} onClick={() => setSpacing('fontScale', value)}
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
          <button onClick={() => setSpacing('fontScale', 1)}
            className="text-xs hover:opacity-70"
            style={{ color: 'var(--text-secondary)' }}>
            {t('theme.typography.reset')}
          </button>
        )}
      </div>

      {/* Layout & Abstände */}
      <div className="rounded-xl p-6 space-y-5" style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{t('theme.layout.title')}</h2>
          <LayoutContextSwitcher selectedId={spacingContextId} onChange={setSpacingContextId} />
        </div>
        <SpacingSlider
          label={t('theme.layout.gap')}
          value={gridGap}
          min={0} max={40} step={2} unit=" px"
          onChange={(v) => setSpacing('gridGap', v)}
          presets={[{ label: '0', value: 0 }, { label: '4', value: 4 }, { label: '8', value: 8 }, { label: '10', value: 10 }, { label: '16', value: 16 }, { label: '24', value: 24 }]}
          isOverridden={spacingContextId !== null && spacingLs?.gridGap !== undefined}
          onClearOverride={() => clearSpacing('gridGap')}
        />
        <SpacingSlider
          label={t('theme.layout.padding')}
          value={widgetPad}
          min={0} max={40} step={2} unit=" px"
          onChange={(v) => setSpacing('widgetPadding', v)}
          presets={[{ label: '0', value: 0 }, { label: '8', value: 8 }, { label: '12', value: 12 }, { label: '16', value: 16 }, { label: '24', value: 24 }]}
          isOverridden={spacingContextId !== null && spacingLs?.widgetPadding !== undefined}
          onClearOverride={() => clearSpacing('widgetPadding')}
        />
      </div>

      {/* Custom CSS */}
      <div className="rounded-xl p-6" style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}>
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{t('theme.css.title')}</h2>
          <div className="flex items-center gap-3 flex-wrap">
            <LayoutContextSwitcher selectedId={cssContextId} onChange={setCssContextId} />
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t('theme.css.enabled')}</span>
              <button
                type="button"
                role="switch"
                aria-checked={cssEnabled}
                onClick={() => setCss({ customCSSEnabled: !cssEnabled })}
                className="relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors"
                style={{ background: cssEnabled ? 'var(--accent)' : 'var(--app-border)' }}
              >
                <span
                  className="inline-block h-4 w-4 rounded-full bg-white shadow transition-transform m-0.5"
                  style={{ transform: cssEnabled ? 'translateX(16px)' : 'translateX(0)' }}
                />
              </button>
            </label>
          </div>
        </div>
        {cssContextId && (cssLs?.customCSS !== undefined || cssLs?.customCSSEnabled !== undefined) && (
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: 'color-mix(in srgb, var(--accent) 15%, transparent)', color: 'var(--accent)' }}>
              Layout-CSS aktiv
            </span>
            <button
              onClick={() => { clearLayoutSettings(cssContextId, 'customCSS'); clearLayoutSettings(cssContextId, 'customCSSEnabled'); }}
              className="text-[10px] hover:opacity-70"
              style={{ color: 'var(--text-secondary)' }}
            >
              ↩ Auf Global zurücksetzen
            </button>
          </div>
        )}
        <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
          {t('theme.css.subtitle')}
        </p>
        <textarea
          value={cssValue}
          onChange={(e) => setCss({ customCSS: e.target.value })}
          disabled={!cssEnabled}
          rows={12}
          spellCheck={false}
          placeholder={`/* Beispiele */\n:root { --widget-radius: 0.5rem; }\n.widget-card { transition: transform 0.2s; }\n.widget-card:hover { transform: scale(1.02); }\n@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap');\nbody { font-family: 'Inter', sans-serif; }`}
          className="w-full rounded-xl px-4 py-3 text-xs font-mono focus:outline-none resize-none disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)', lineHeight: 1.7 }}
        />
        <p className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>
          {cssValue.trim()
            ? t('theme.css.lines', { count: String(cssValue.split('\n').length) })
            : t('theme.css.empty')}
        </p>
      </div>
    </div>
  );
}
