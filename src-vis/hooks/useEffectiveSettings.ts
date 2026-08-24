import { useDashboardStore } from '../store/dashboardStore';
import { useConfigStore } from '../store/configStore';
import { useThemeStore } from '../store/themeStore';
import type { FrontendSettings } from '../store/configStore';
import type { LayoutSettings } from '../store/dashboardStore';
import type { ThemeVars } from '../themes';
import { resolveThemeModeId, useThemeModeStore } from '../utils/themeModeCache';

// ── 3-level keys: overridable per layout AND per section (section wins) ──────
const LAYOUT_FRONTEND_KEYS: (keyof LayoutSettings & keyof FrontendSettings)[] = [
    'customCSS',
    'customCSSEnabled',
    'customCSSInEditor',
    'customJS',
    'customJSEnabled',
    'customJSInEditor',
    'fontScale',
    'gridRowHeight',
    'gridSnapX',
    'gridGap',
    'widgetPadding',
    'mobileBreakpoint',
    'hideGridScrollbar',
    'guidelinesEnabled',
    'guidelinesWidth',
    'guidelinesHeight',
    'guidelinesShowInFrontend',
    'guidelinesShowResolution',
    // layoutDrawerEnabled stays 3-level: the per-section "hide menu here" toggle
    // writes it onto section.settings, so a section must be able to override it.
    'layoutDrawerEnabled',
];

// ── 2-level keys: frame settings that belong to a whole layout ───────────────
// Merged from the layout level only — a section never overrides these.
const LAYOUT_ONLY_KEYS: (keyof LayoutSettings & keyof FrontendSettings)[] = [
    // Layout drawer / menu appearance
    'layoutDrawerShowSingle',
    'layoutDrawerSize',
    'layoutDrawerAutoHide',
    'layoutDrawerPlacement',
    'layoutDrawerMobilePlacement',
    'layoutDrawerWidth',
    'layoutDrawerTopOffset',
    'layoutDrawerBottomOffset',
    'layoutDrawerShowTitle',
    'layoutDrawerTitle',
    'layoutDrawerTitleMarginTop',
    'layoutDrawerTitleMarginBottom',
    'layoutDrawerEntryStyle',
    'layoutDrawerEntryHeight',
    'layoutDrawerIndicatorStyle',
    'layoutDrawerFontSize',
    'layoutDrawerIconSize',
    'layoutDrawerBarAlignment',
    'layoutDrawerHideMobileScrollbar',
    'layoutDrawerItems',
    // Header
    'showHeader',
    'headerTitle',
    'showConnectionBadge',
    'showAdminLink',
    'showMessageBell',
    'headerClockEnabled',
    'headerClockDisplay',
    'headerClockShowSeconds',
    'headerClockDateLength',
    'headerClockCustomFormat',
    'headerDatapoint',
    'headerDatapointTemplate',
    // Navigation (idle-return)
    'idleReturnEnabled',
    'idleReturnDelay',
];

// Narrow selectors: stable settings-object references so these only re-render
// when the specific layout/section settings change (widget-only mutations keep
// the settings reference, so this stays stable across widget edits).
function useLayoutSettingsObj(layoutId?: string): LayoutSettings | undefined {
    return useDashboardStore((s) => (layoutId ? s.layouts.find((l) => l.id === layoutId)?.settings : undefined));
}
function useSectionSettingsObj(layoutId?: string, sectionId?: string): LayoutSettings | undefined {
    return useDashboardStore((s) => {
        if (!layoutId || !sectionId) return undefined;
        const l = s.layouts.find((x) => x.id === layoutId);
        return l?.sections.find((x) => x.id === sectionId)?.settings;
    });
}

/** Merged FrontendSettings: global → layout → section (section wins). */
export function useEffectiveSettings(layoutId?: string, sectionId?: string): FrontendSettings {
    const global = useConfigStore((s) => s.frontend);
    const ls = useLayoutSettingsObj(layoutId);
    const ss = useSectionSettingsObj(layoutId, sectionId);
    if (!ls && !ss) return global;

    const patch: Partial<FrontendSettings> = {};
    // Layout-only frame keys: layout level only (a section never overrides them).
    for (const key of LAYOUT_ONLY_KEYS) {
        const lv = ls?.[key as keyof LayoutSettings];
        if (lv !== undefined) (patch as Record<string, unknown>)[key] = lv;
    }
    // 3-level keys: layout first, then section (section wins).
    for (const key of LAYOUT_FRONTEND_KEYS) {
        const lv = ls?.[key as keyof LayoutSettings];
        if (lv !== undefined) (patch as Record<string, unknown>)[key] = lv;
        const sv = ss?.[key as keyof LayoutSettings];
        if (sv !== undefined) (patch as Record<string, unknown>)[key] = sv;
    }
    return { ...global, ...patch };
}

/**
 * The global theme id with the datapoint-driven dark/light mode applied. Used
 * wherever no layout/section context exists (ThemeProvider's :root vars).
 */
export function useGlobalThemeId(): string {
    const themeId = useThemeStore((s) => s.themeId);
    const darkId = useThemeStore((s) => s.browserDarkThemeId);
    const lightId = useThemeStore((s) => s.browserLightThemeId);
    const mode = useThemeModeStore((s) => s.mode);
    return resolveThemeModeId(themeId, mode, darkId, lightId);
}

/** Effective theme ID: global → layout → section (falls back up the chain). */
export function useEffectiveThemeId(layoutId?: string, sectionId?: string): string {
    const globalId = useThemeStore((s) => s.themeId);
    const followBrowser = useThemeStore((s) => s.followBrowser);
    const darkId = useThemeStore((s) => s.browserDarkThemeId);
    const lightId = useThemeStore((s) => s.browserLightThemeId);
    const mode = useThemeModeStore((s) => s.mode);
    const ls = useLayoutSettingsObj(layoutId);
    const ss = useSectionSettingsObj(layoutId, sectionId);
    // When followBrowser is active, the global themeId is already managed by the
    // browser-sync effect — overrides must not fight it (the admin greys the
    // preset pickers out and says so).
    const base = followBrowser ? globalId : (ss?.themeId ?? ls?.themeId ?? globalId);
    // The dark/light mode datapoint wins over the design, but only when the
    // design has the wrong polarity — a dark design stays put in dark mode.
    return resolveThemeModeId(base, mode, darkId, lightId);
}

/** Effective custom theme vars: global → layout → section. */
export function useEffectiveCustomVars(layoutId?: string, sectionId?: string): Partial<ThemeVars> {
    const globalVars = useThemeStore((s) => s.customVars);
    const ls = useLayoutSettingsObj(layoutId);
    const ss = useSectionSettingsObj(layoutId, sectionId);
    return ss?.customVars ?? ls?.customVars ?? globalVars;
}
