import type { TabBarSettings } from '../store/dashboardStore';

/**
 * Does the frontend tab bar render on its own merits — i.e. ignoring an injected
 * headerSlot (the collapsed section-menu hamburger)? A single tab with no extra
 * items means there is genuinely nothing to show, so the bar stays hidden.
 *
 * Single source of truth for TabBar's own visibility guard, App's automatic
 * mobile placement of the section menu and the guideline top inset — those three
 * must agree or the frame and the guidelines drift apart.
 */
export function tabBarShowsOnOwn(tabCount: number, tbs?: TabBarSettings): boolean {
    return tabCount > 1 || (tbs?.showSingle ?? false) || (tbs?.items?.length ?? 0) > 0;
}
