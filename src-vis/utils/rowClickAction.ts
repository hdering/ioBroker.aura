import type { ClickAction, WidgetConfig } from '../types';
import { detectWidgetTypeFromRole } from './dpTemplates';
import { lookupDatapointEntry } from '../hooks/useDatapointList';
import { defaultActionForConfig } from '../components/config/ClickActionEditor';

/**
 * Generic detail popup for a datapoint that has no type-specific built-in view.
 * Deliberately NOT registered in BUILTIN_TYPE_DEFAULTS: it is a row-level
 * fallback only, so plain `value` widgets keep their current (no popup) behaviour.
 */
export const ROW_FALLBACK_VIEW_ID = 'pv-builtin-datapoint';

/** Stored per-row/per-list setting. `'auto'` derives from the role, undefined = default. */
export type RowClickSetting = ClickAction | 'auto';

/**
 * What a row click does when nothing is configured.
 *
 * The role-derived popups ('auto') are not presentable yet, so the datapoint list
 * of the clicked row's own branch is the better default: it always renders
 * something useful, on every datapoint. `'auto'` stays available as an explicit
 * choice and has to be stored as such now.
 */
export const DEFAULT_ROW_CLICK_ACTION: ClickAction = {
    kind: 'popup-dps',
    scope: 'parent',
    relevantOnly: true,
};

/** Row-popup settings shared by the static and the dynamic list widget. */
export interface RowPopupOptions {
    /** undefined = 'auto' (derive from the role). `{kind:'none'}` switches it off. */
    rowClickAction?: RowClickSetting;
    rowPopupTitle?: string;
    rowPopupHideTitle?: boolean;
    rowPopupWidth?: number;
    rowPopupHeight?: number;
    rowPopupAutoCloseSec?: number;
}

/**
 * True when the row carries a deliberately configured action (not 'auto', not off).
 *
 * The badge layouts need this: a badge IS the whole row, so toggling and opening
 * something would collide. Automatic mode therefore leaves toggleable badges alone -
 * but an action the user explicitly picked for that row wins over the toggle.
 *
 * An unset setting stays non-explicit on purpose: DEFAULT_ROW_CLICK_ACTION must not
 * steal the click from a toggleable badge, only a deliberate choice may do that.
 */
export function isExplicitRowAction(
    override: RowClickSetting | undefined,
    listWide: RowClickSetting | undefined,
): boolean {
    const setting = override ?? listWide;
    return !!setting && setting !== 'auto' && setting.kind !== 'none';
}

export interface RowActionCtx {
    /** popupConfigStore.typeDefaults - admin-assigned view per widget type. */
    typeDefaults: Record<string, string>;
    /** popupConfigStore.removedBuiltinTypeDefaults. */
    removedTypeDefaults: string[];
}

/**
 * Resolves the popup a clicked list row should open.
 *
 * An explicitly configured action always wins, an unset one falls back to
 * DEFAULT_ROW_CLICK_ACTION. `'auto'` runs the same three-level
 * chain WidgetFrame uses for widget clicks, but keyed on the widget type detected
 * from the datapoint's role instead of the (list) widget's own type:
 *
 *   1. admin type default (popupConfigStore.typeDefaults)
 *   2. built-in default for that type (dimmer, switch, shutter, ...)
 *   3. the generic datapoint view
 *
 * The `typeDefaultLayouts` gate from WidgetFrame is intentionally not applied - it
 * filters by widget *layout*, which has no meaning for a row.
 *
 * `hint` carries role/type when the caller already knows them (list entries do);
 * otherwise they are looked up in the datapoint cache, which every list widget
 * populates via ensureDatapointCache().
 */
export function resolveRowAction(
    dpId: string,
    configured: RowClickSetting | undefined,
    ctx: RowActionCtx,
    hint?: { role?: string; type?: string },
): ClickAction | null {
    if (configured && configured !== 'auto') {
        return configured.kind === 'none' ? null : configured;
    }
    // Both the default and the role derivation need a source datapoint.
    if (!dpId) return null;
    if (!configured) return DEFAULT_ROW_CLICK_ACTION;

    let role = hint?.role;
    let type = hint?.type;
    // The cache lookup is a linear scan, so it only runs when the caller has no
    // role at all (StatusItem, entries added before roles were stored).
    if (!role) {
        const entry = lookupDatapointEntry(dpId);
        role = entry?.role;
        type = type ?? entry?.type;
    }

    const widgetType = detectWidgetTypeFromRole(role, type);
    if (widgetType) {
        const viewId = ctx.typeDefaults[widgetType];
        if (viewId) return { kind: 'popup-view', viewId };
        // An explicit empty type default ('- keine View -') means "no popup" and
        // must suppress the built-in fallback, exactly as for widget clicks.
        if (widgetType in ctx.typeDefaults) return null;
        if (!ctx.removedTypeDefaults.includes(widgetType)) {
            const builtIn = defaultActionForConfig({ type: widgetType } as WidgetConfig);
            // popup-widget (slider default) embeds a dashboard widget - meaningless
            // for a row, so only real popup views are taken from here.
            if (builtIn && builtIn.kind === 'popup-view') return builtIn;
        }
    }
    return { kind: 'popup-view', viewId: ROW_FALLBACK_VIEW_ID };
}
