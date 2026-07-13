import { useDashboardStore } from '../store/dashboardStore';
import { useConfigStore } from '../store/configStore';
import { useThemeStore } from '../store/themeStore';
import type { FrontendSettings } from '../store/configStore';
import type { LayoutSettings } from '../store/dashboardStore';
import type { ThemeVars } from '../themes';

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
    'layoutDrawerItems',
    // Header
    'showHeader',
    'headerTitle',
    'showConnectionBadge',
    'showAdminLink',
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

/** Effective theme ID: global → layout → section (falls back up the chain). */
export function useEffectiveThemeId(layoutId?: string, sectionId?: string): string {
    const globalId = useThemeStore((s) => s.themeId);
    const followBrowser = useThemeStore((s) => s.followBrowser);
    const ls = useLayoutSettingsObj(layoutId);
    const ss = useSectionSettingsObj(layoutId, sectionId);
    // When followBrowser is active, the global themeId is already managed by the
    // browser-sync effect — overrides must not fight it.
    if (followBrowser) return globalId;
    return ss?.themeId ?? ls?.themeId ?? globalId;
}

/** Effective custom theme vars: global → layout → section. */
export function useEffectiveCustomVars(layoutId?: string, sectionId?: string): Partial<ThemeVars> {
    const globalVars = useThemeStore((s) => s.customVars);
    const ls = useLayoutSettingsObj(layoutId);
    const ss = useSectionSettingsObj(layoutId, sectionId);
    return ss?.customVars ?? ls?.customVars ?? globalVars;
}
