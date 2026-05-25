import { useThemeStore } from '../../../../store/themeStore';
import { useDashboardStore } from '../../../../store/dashboardStore';
import { getTheme, type ThemeVars } from '../../../../themes';
import { LayoutContextSwitcher } from '../shared/LayoutContextSwitcher';
import { useT } from '../../../../i18n';

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

interface ThemeVarsSectionProps {
  contextId: string | null;
  onContextChange: (id: string | null) => void;
}

export function ThemeVarsSection({ contextId, onContextChange }: ThemeVarsSectionProps) {
  const t = useT();
  const { themeId, customVars, setCustomVar, resetCustom } = useThemeStore();
  const layouts = useDashboardStore((s) => s.layouts);
  const updateLayoutSettings = useDashboardStore((s) => s.updateLayoutSettings);

  const ls = contextId ? layouts.find((l) => l.id === contextId)?.settings : undefined;
  const effectiveThemeId = ls?.themeId ?? themeId;
  const effectiveVars = ls?.customVars ?? customVars;
  const activeTheme = getTheme(effectiveThemeId);

  const hasCustomVars = contextId
    ? Object.keys(ls?.customVars ?? {}).length > 0
    : Object.keys(customVars).length > 0;

  const isThemeOv = (key: keyof typeof customVars) =>
    contextId !== null && ls?.customVars?.[key] !== undefined;

  function setThemeVar(key: keyof ThemeVars, value: string) {
    if (!contextId) setCustomVar(key, value);
    else {
      const next = { ...effectiveVars, [key]: value };
      updateLayoutSettings(contextId, { customVars: next });
    }
  }

  function clearThemeVar(key: keyof ThemeVars) {
    if (!contextId) {
      const next = { ...customVars }; delete next[key];
      resetCustom();
      Object.entries(next).forEach(([k, v]) => setCustomVar(k as keyof ThemeVars, v!));
    } else {
      const next = { ...effectiveVars }; delete next[key];
      updateLayoutSettings(contextId, { customVars: Object.keys(next).length ? next : undefined });
    }
  }

  function resetAllVars() {
    if (!contextId) { resetCustom(); return; }
    updateLayoutSettings(contextId, { customVars: undefined });
  }

  return (
    <div className="rounded-xl p-6" style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{t('theme.vars.title')}</h2>
        <div className="flex items-center gap-3 flex-wrap">
          <LayoutContextSwitcher selectedId={contextId} onChange={onContextChange} />
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
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-x-6 gap-y-5">
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
                  <div key={key} className="flex items-center gap-2">
                    <label className="text-xs w-24 shrink-0 flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                      {varLabelKey ? t(varLabelKey as never) : key}
                      {isOv && (
                        <span className="text-[9px] px-1 py-0.5 rounded font-medium" style={{ background: 'color-mix(in srgb, var(--accent) 15%, transparent)', color: 'var(--accent)' }}>L</span>
                      )}
                    </label>
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      {isColor(current) && (
                        <input type="color" value={current.startsWith('#') ? current : '#000000'}
                          onChange={(e) => setThemeVar(key, e.target.value)}
                          className="w-8 h-8 rounded-lg cursor-pointer border-0 p-0.5 shrink-0"
                          style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }} />
                      )}
                      <input type="text" value={custom ?? ''}
                        placeholder={base}
                        onChange={(e) => { if (e.target.value) setThemeVar(key, e.target.value); else clearThemeVar(key); }}
                        className="flex-1 min-w-0 text-xs rounded-lg px-2 py-2 focus:outline-none font-mono"
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
  );
}
