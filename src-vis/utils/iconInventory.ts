/**
 * Icon inventory of a layout (#290).
 *
 * "Which icons does this layout use?" has no single answer in the config: icons
 * sit in widget options, list entries, state maps, badges, custom cells, tab and
 * section headers, menu and header items, popup views and group children — and
 * every new widget adds fields of its own. So instead of enumerating fields the
 * inventory walks the JSON and takes
 *
 *   - every string that is a complete Iconify ID (`mdi:garage`), and
 *   - every legacy PascalCase Lucide name (`ZapOff`) stored under a key that
 *     mentions "icon".
 *
 * A false positive (a text like `on:off`) costs one 404 at the icon source,
 * which the adapter remembers for an hour — harmless. A miss would leave a
 * device without internet blank, which is the failure this exists to prevent.
 */
import type { DashboardLayout } from '../store/dashboardStore';
import type { FrontendSettings } from '../store/configStore';
import type { PopupView } from '../store/popupConfigStore';
import type { WidgetConfig } from '../types';
import { isIconifyId, isLucidePascalName, lucidePascalToIconify } from './iconId';

/** Keys that mention "icon" but hold something else (colour, size, flag …). */
const NOT_AN_ICON_KEY = /color|colour|size|scale|pos|align|width|height|bg|opacity|show|hide|only|mode|style/i;

function isIconKey(key: string): boolean {
    return /icon/i.test(key) && !NOT_AN_ICON_KEY.test(key);
}

/** Guard against a cyclic structure — the config is JSON, but the walk is generic. */
const MAX_DEPTH = 40;

/** Collect every icon ID found in `value`, recursively, into `into`. */
export function collectIconIds(value: unknown, into: Set<string> = new Set<string>(), depth = 0): Set<string> {
    if (depth > MAX_DEPTH || value == null) return into;
    if (typeof value === 'string') {
        if (isIconifyId(value)) into.add(value);
        return into;
    }
    if (Array.isArray(value)) {
        for (const item of value) collectIconIds(item, into, depth + 1);
        return into;
    }
    if (typeof value === 'object') {
        for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
            if (typeof child === 'string') {
                if (isIconifyId(child)) into.add(child);
                else if (isIconKey(key) && isLucidePascalName(child)) into.add(lucidePascalToIconify(child));
                continue;
            }
            collectIconIds(child, into, depth + 1);
        }
    }
    return into;
}

export interface IconInventorySources {
    /** The layout a device shows — sections, tabs, widgets and its own settings. */
    layout?: DashboardLayout | null;
    /** Global frame settings; only the parts that carry icons are read. */
    frontend?: Partial<Pick<FrontendSettings, 'tabBar' | 'layoutDrawerItems' | 'headerItems'>> | null;
    /** Popup views — a popup can be opened from any widget, so all of them count. */
    popupViews?: PopupView[] | null;
    /** Group children live outside the layout tree, keyed by the group widget's id. */
    groupDefs?: Record<string, WidgetConfig[]> | null;
}

/** Every widget id in the layout tree — the keys under which group children are stored. */
function widgetIds(layout: DashboardLayout): Set<string> {
    const ids = new Set<string>();
    for (const section of layout.sections ?? []) {
        for (const tab of section.tabs ?? []) {
            for (const w of tab.widgets ?? []) if (w?.id) ids.add(w.id);
        }
    }
    return ids;
}

/**
 * The complete, sorted icon inventory of one layout: the layout tree, the
 * global frame parts it shows, every popup view, and the children of the
 * groups it contains.
 */
export function collectLayoutIconIds(src: IconInventorySources): string[] {
    const into = new Set<string>();
    if (src.layout) {
        collectIconIds(src.layout, into);
        if (src.groupDefs) {
            const ids = widgetIds(src.layout);
            for (const [groupId, children] of Object.entries(src.groupDefs)) {
                if (ids.has(groupId)) collectIconIds(children, into);
            }
        }
    }
    if (src.frontend) {
        collectIconIds(
            {
                tabBar: src.frontend.tabBar,
                layoutDrawerItems: src.frontend.layoutDrawerItems,
                headerItems: src.frontend.headerItems,
            },
            into,
        );
    }
    if (src.popupViews) collectIconIds(src.popupViews, into);
    return [...into].sort();
}
