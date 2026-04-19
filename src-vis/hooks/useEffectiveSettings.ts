import { useDashboardStore } from '../store/dashboardStore';
import { useConfigStore } from '../store/configStore';
import { useThemeStore } from '../store/themeStore';
import type { FrontendSettings } from '../store/configStore';
import type { LayoutSettings } from '../store/dashboardStore';
import type { ThemeVars } from '../themes';

// ── FrontendSettings keys that can be overridden per layout ──────────────────
const LAYOUT_FRONTEND_KEYS: (keyof LayoutSettings & keyof FrontendSettings)[] = [
  'customCSS',
  'customCSSEnabled',
  'fontScale',
  'gridRowHeight',
  'gridSnapX',
  'gridGap',
  'widgetPadding',
  'mobileBreakpoint',
  'guidelinesEnabled',
  'guidelinesWidth',
  'guidelinesHeight',
  'guidelinesShowInFrontend',
];

/** Merged global + per-layout FrontendSettings. */
export function useEffectiveSettings(layoutId?: string): FrontendSettings {
  const global = useConfigStore((s) => s.frontend);
  const layouts = useDashboardStore((s) => s.layouts);
  const ls = layoutId ? layouts.find((l) => l.id === layoutId)?.settings : undefined;
  if (!ls) return global;

  const patch: Partial<FrontendSettings> = {};
  for (const key of LAYOUT_FRONTEND_KEYS) {
    const v = ls[key as keyof LayoutSettings];
    if (v !== undefined) (patch as Record<string, unknown>)[key] = v;
  }
  return { ...global, ...patch };
}

/** Effective theme ID for a layout (falls back to global). */
export function useEffectiveThemeId(layoutId?: string): string {
  const globalId = useThemeStore((s) => s.themeId);
  const layouts = useDashboardStore((s) => s.layouts);
  const ls = layoutId ? layouts.find((l) => l.id === layoutId)?.settings : undefined;
  return ls?.themeId ?? globalId;
}

/** Effective custom theme vars for a layout (falls back to global). */
export function useEffectiveCustomVars(layoutId?: string): Partial<ThemeVars> {
  const globalVars = useThemeStore((s) => s.customVars);
  const layouts = useDashboardStore((s) => s.layouts);
  const ls = layoutId ? layouts.find((l) => l.id === layoutId)?.settings : undefined;
  return ls?.customVars ?? globalVars;
}
