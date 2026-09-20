// The Design page's three bands: how deep a group of settings may be overridden.
//
//   global  → set once, never overridden (values & formatting, browser sync, …)
//   layout  → global → layout (header, section menu, icon source)
//   section → global → layout → section (theme, typography, grid, …)
//
// A band is a property of the GROUP, not of the scope being edited: with a
// section selected, the two shorter chains are locked and point back up.

import type { LayoutSettings } from '../../../../store/dashboardStore';

export type SubTab =
    | 'values'
    | 'sync'
    | 'mythemes'
    | 'behavior'
    | 'header'
    | 'menu'
    | 'icons'
    | 'tabbar'
    | 'theme'
    | 'typo'
    | 'grid'
    | 'guidelines'
    | 'nav';

export type Band = 'global' | 'layout' | 'section';
/** The scope selected in the tree — same three words, same order. */
export type ScopeLevel = Band;

export const BAND_ORDER: readonly Band[] = ['global', 'layout', 'section'];
export const BAND_INDEX: Record<Band, number> = { global: 0, layout: 1, section: 2 };

export const BAND_TABS: Record<Band, readonly SubTab[]> = {
    global: ['values', 'sync', 'mythemes', 'behavior'],
    layout: ['header', 'menu', 'icons'],
    section: ['tabbar', 'theme', 'typo', 'grid', 'guidelines', 'nav'],
};

export const ALL_TABS: readonly SubTab[] = BAND_ORDER.flatMap((b) => BAND_TABS[b]);

export function bandOf(tab: SubTab): Band {
    return BAND_ORDER.find((b) => BAND_TABS[b].includes(tab)) ?? 'section';
}

/** True when the selected scope lies deeper than the group's chain reaches. */
export function isTabLocked(tab: SubTab, level: ScopeLevel): boolean {
    return BAND_INDEX[bandOf(tab)] < BAND_INDEX[level];
}

/**
 * The layout/section settings keys each group owns. Drives the own-value
 * counters in the tree, on the tabs and in the scope bar, so the three always
 * agree. Global-only groups live in other stores and never appear here.
 */
export const TAB_KEYS: Record<SubTab, readonly (keyof LayoutSettings)[]> = {
    values: [],
    sync: [],
    mythemes: [],
    behavior: [],
    header: [
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
        'headerItems',
    ],
    menu: [
        'layoutDrawerEnabled',
        'layoutDrawerShowSingle',
        'layoutDrawerSize',
        'layoutDrawerAutoHide',
        'layoutDrawerPlacement',
        'layoutDrawerMobilePlacement',
        'layoutDrawerTabletPlacement',
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
    ],
    icons: ['iconsOffline'],
    tabbar: ['tabBar'],
    theme: ['themeId', 'customVars', 'customVarsLight', 'customVarsDark'],
    typo: ['fontScale', 'gridGap', 'widgetPadding'],
    grid: ['gridRowHeight', 'gridSnapX', 'mobileBreakpoint', 'tabletBreakpoint', 'tabletCols', 'hideGridScrollbar'],
    guidelines: [
        'guidelinesEnabled',
        'guidelinesWidth',
        'guidelinesHeight',
        'guidelinesShowInFrontend',
        'guidelinesShowResolution',
    ],
    nav: ['idleReturnEnabled', 'idleReturnDelay'],
};

/** Keys a scope may carry, over all groups (custom CSS/JS live on their own page). */
export const ALL_TAB_KEYS: readonly (keyof LayoutSettings)[] = ALL_TABS.flatMap((tab) => TAB_KEYS[tab]);

export function ownKeys(
    settings: LayoutSettings | undefined,
    keys: readonly (keyof LayoutSettings)[] = ALL_TAB_KEYS,
): (keyof LayoutSettings)[] {
    if (!settings) return [];
    return keys.filter((k) => settings[k] !== undefined);
}

export function ownCountsByTab(settings: LayoutSettings | undefined): Partial<Record<SubTab, number>> {
    const out: Partial<Record<SubTab, number>> = {};
    if (!settings) return out;
    for (const tab of ALL_TABS) {
        const n = ownKeys(settings, TAB_KEYS[tab]).length;
        if (n) out[tab] = n;
    }
    return out;
}

/**
 * Own values (overrides) are orange everywhere — tree, tabs, scope bar and the
 * control itself. Blue stays reserved for "selected / active".
 */
export const OVERRIDE_COLOR = '#ea580c';
export const OVERRIDE_TINT = 'color-mix(in srgb, #ea580c 14%, transparent)';
