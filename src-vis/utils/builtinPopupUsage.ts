import { useDashboardStore } from '../store/dashboardStore';
import { useGroupDefsStore } from '../store/groupDefsStore';
import {
    usePopupConfigStore,
    ALWAYS_SEEDED_VIEW_IDS,
    BUILTIN_VIEW_IDS,
    type PopupView,
} from '../store/popupConfigStore';
import type { WidgetConfig } from '../types';

/**
 * Is a built-in popup view still in use anywhere in this installation?
 *
 * Answers the one question that makes removing the shipped views safe: nothing
 * records "the user relies on this". A dimmer widget with no stored clickAction
 * opens the built-in dimmer popup purely through the type default, so absence of
 * configuration is not absence of use.
 *
 * Deliberately conservative — every check can only ever mark a view as *used*.
 * A false "used" costs one leftover entry in the list; a false "unused" takes a
 * working popup away from someone.
 */

export type UsageReason = 'always' | 'edited' | 'linked' | 'type-default' | 'row-auto';

export interface BuiltinUsage {
    view: PopupView;
    /** Widget types whose type default points at this view. */
    types: string[];
    /** undefined = nothing references it, safe to remove. */
    reason?: UsageReason;
}

/**
 * Every widget config that can carry a click action and belongs to the *user*.
 *
 * The contents of an untouched built-in view are bundle payload, not
 * configuration: the shipped dimmer view holds a dimmer widget, so counting it
 * would let every built-in vouch for itself and nothing would ever be removable.
 * A built-in the user edited is theirs again, so it counts.
 */
function userWidgets(): WidgetConfig[] {
    const out: WidgetConfig[] = [];
    for (const layout of useDashboardStore.getState().layouts) {
        for (const section of layout.sections) {
            for (const tab of section.tabs) out.push(...tab.widgets);
        }
    }
    // Group children live in their own RAM-only store, not inside the layout tree.
    for (const children of Object.values(useGroupDefsStore.getState().defs)) out.push(...children);
    const popup = usePopupConfigStore.getState();
    for (const view of popup.views) {
        if (BUILTIN_VIEW_IDS.has(view.id) && !view.userEdited) continue;
        out.push(...view.widgets);
    }
    for (const trigger of popup.triggers) out.push(trigger.host);
    return out;
}

/**
 * True when any widget leaves a row action on `'auto'`, list-wide or per entry.
 *
 * `'auto'` resolves through `typeDefaults` at click time, keyed on the role of
 * whatever datapoint the row happens to carry — which rows those are cannot be
 * known without the live datapoint cache. So one `'auto'` anywhere keeps every
 * assigned view.
 */
function hasAutoRowAction(widgets: WidgetConfig[]): boolean {
    const scan = (value: unknown): boolean => {
        if (Array.isArray(value)) return value.some(scan);
        if (!value || typeof value !== 'object') return false;
        for (const [key, v] of Object.entries(value)) {
            if (v === 'auto' && /clickaction$/i.test(key)) return true;
            if (scan(v)) return true;
        }
        return false;
    };
    return widgets.some((w) => scan(w.options));
}

/**
 * Usage verdict for every built-in view this installation still has, in the
 * store's own order. Views the user never received are not listed.
 */
export function builtinUsage(): BuiltinUsage[] {
    const { views, typeDefaults } = usePopupConfigStore.getState();
    const widgets = userWidgets();
    // Widget configs only — typeDefaults would match every seeded view and make
    // the whole scan answer "used".
    const serialised = JSON.stringify(widgets);
    const autoRows = hasAutoRowAction(widgets);

    return views
        .filter((v) => BUILTIN_VIEW_IDS.has(v.id))
        .map((view) => {
            const types = Object.entries(typeDefaults)
                .filter(([, viewId]) => viewId === view.id)
                .map(([type]) => type);
            const reason = ((): UsageReason | undefined => {
                if (ALWAYS_SEEDED_VIEW_IDS.has(view.id)) return 'always';
                if (view.userEdited) return 'edited';
                if (serialised.includes(`"${view.id}"`)) return 'linked';
                if (types.length > 0) {
                    // A widget of that type without its own action opens this view.
                    if (widgets.some((w) => types.includes(w.type) && w.options?.clickAction === undefined))
                        return 'type-default';
                    if (autoRows) return 'row-auto';
                }
                return undefined;
            })();
            return { view, types, reason };
        });
}
