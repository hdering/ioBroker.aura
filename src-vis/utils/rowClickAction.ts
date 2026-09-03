import type { ClickAction } from '../types';
import { detectWidgetTypeFromRole } from './dpTemplates';
import { lookupDatapointEntry } from '../hooks/useDatapointList';

/**
 * Generic detail popup for a datapoint that has no type-specific built-in view.
 * Deliberately NOT registered in BUILTIN_TYPE_DEFAULTS: it is a row-level
 * fallback only, so plain `value` widgets keep their current (no popup) behaviour.
 */
export const ROW_FALLBACK_VIEW_ID = 'pv-builtin-datapoint';

/** Stored per-row/per-list setting. `'auto'` derives from the role, undefined = off. */
export type RowClickSetting = ClickAction | 'auto';

/**
 * Preset the config panel stores when the user picks "Eigene Aktion": the datapoint
 * list of the clicked row's own branch, which renders something useful on every
 * datapoint.
 *
 * NOT the fallback for an unconfigured list - a row click does nothing until an
 * action is picked (see resolveRowAction).
 */
export const DEFAULT_ROW_CLICK_ACTION: ClickAction = {
    kind: 'popup-dps',
    scope: 'parent',
    relevantOnly: true,
};

/** Row-popup settings shared by the static and the dynamic list widget. */
export interface RowPopupOptions {
    /** undefined = off (rows are not clickable). `'auto'` derives from the role. */
    rowClickAction?: RowClickSetting;
    rowPopupTitle?: string;
    rowPopupHideTitle?: boolean;
    rowPopupWidth?: number;
    rowPopupHeight?: number;
    rowPopupAutoCloseSec?: number;
    /** Popup transparency / backdrop dim in percent; undefined = inherit view/global. */
    rowPopupTransparency?: number;
    rowPopupBackdropDim?: number;
    /** Popup surface colour; undefined = inherit view/global/theme. */
    rowPopupBackground?: string;
}

/**
 * True when the row carries a deliberately configured action (not 'auto', not off).
 *
 * The badge layouts need this: a badge IS the whole row, so toggling and opening
 * something would collide. Automatic mode therefore leaves toggleable badges alone -
 * but an action the user explicitly picked for that row wins over the toggle.
 *
 * An unset setting is never explicit - it resolves to no action at all, so it can
 * never steal the click from a toggleable badge.
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
}

/**
 * Resolves the popup a clicked list row should open.
 *
 * Nothing configured = no popup: rows stay inert until an action is picked, so a
 * plain list does not turn every row into a click target on its own. `'auto'` runs
 * the same chain WidgetFrame uses for widget clicks, but keyed on the widget type
 * detected from the datapoint's role instead of the (list) widget's own type:
 *
 *   1. admin type default (popupConfigStore.typeDefaults)
 *   2. the generic datapoint view
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
    // Unconfigured means off - only 'auto' derives an action from the datapoint.
    if (!configured) return null;
    // The role derivation needs a source datapoint.
    if (!dpId) return null;

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
        // must suppress the generic fallback, exactly as for widget clicks.
        if (widgetType in ctx.typeDefaults) return null;
    }
    return { kind: 'popup-view', viewId: ROW_FALLBACK_VIEW_ID };
}
