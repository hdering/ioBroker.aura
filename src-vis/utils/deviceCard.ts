// ─────────────────────────────────────────────────────────────────────────────
// Device card (#743): a group whose children are shared by every copy of the card
// and resolve `{{dp}}` & co. against the card's own datapoint.
// ─────────────────────────────────────────────────────────────────────────────
// The children live in the groupDefsStore under `options.defId`, like a group's.
// Copying a card keeps that defId (widgetCopy only re-issues group/panels defs),
// so every copy shows the same layout; detaching gives one card a def of its own.
import type { WidgetConfig } from '../types';
import { buildPopupSubMap, resolvePopupWidget } from './popupPlaceholders';
import { runtimeId } from '../contexts/RenderTransformContext';
import { hostsGroupDef } from './groupTypes';
import { cloneGroupDef, newCloneScope, finishClone } from './widgetCopy';

/**
 * Token table of one card: `{{dp}}`, `{{name}}`, `{{parent}}`, `{{parent2}}` … from
 * the card's datapoint, plus the card's own string options as `{{key}}` — the same
 * table a popup view gets from the widget that opened it.
 */
export function deviceCardVars(card: WidgetConfig): Record<string, string> {
    return buildPopupSubMap(card, card.datapoint ?? '');
}

/**
 * The display rewrite a card applies to each child: placeholders resolved and the
 * id moved into the card's runtime scope (`scope` = the card's own runtime id), so
 * registries keyed by widget id keep the copies apart. WidgetFrame strips both off
 * again on every write.
 */
export function deviceCardTransform(vars: Record<string, string>, scope: string): (w: WidgetConfig) => WidgetConfig {
    return (w) => ({ ...resolvePopupWidget(w, vars, undefined), id: runtimeId(w.id, scope) });
}

/** Every device card in a widget list, walking into nested group defs. */
function collectCards(
    widgets: WidgetConfig[],
    defs: Record<string, WidgetConfig[]>,
    out: WidgetConfig[],
    seen: Set<string>,
): void {
    for (const w of widgets) {
        if (w.type === 'devicecard') out.push(w);
        if (hostsGroupDef(w) && !seen.has(w.options.defId)) {
            seen.add(w.options.defId);
            collectCards(defs[w.options.defId] ?? [], defs, out, seen);
        }
    }
}

/** The part of a dashboard layout the walk needs. */
type LayoutLike = { sections: { tabs: { widgets: WidgetConfig[] }[] }[] };

/** All device cards on the dashboard and in popup views that show `defId`. */
export function cardsSharingDef(
    defId: string | undefined,
    layouts: LayoutLike[],
    popupWidgets: WidgetConfig[][],
    defs: Record<string, WidgetConfig[]>,
): WidgetConfig[] {
    if (!defId) return [];
    const cards: WidgetConfig[] = [];
    const seen = new Set<string>();
    for (const l of layouts)
        for (const sec of l.sections) for (const tab of sec.tabs) collectCards(tab.widgets, defs, cards, seen);
    for (const list of popupWidgets) collectCards(list, defs, cards, seen);
    return cards.filter((c) => c.options?.defId === defId);
}

/**
 * Give one card a layout of its own: its children are copied into a fresh def
 * (fresh child ids, nested groups cloned too) and only this card points at it.
 * Returns the updated card config; the caller persists it.
 */
export function detachDeviceCard(card: WidgetConfig): WidgetConfig {
    if (!hostsGroupDef(card)) return card;
    const scope = newCloneScope();
    const defId = cloneGroupDef(card.options.defId, scope);
    finishClone(scope);
    return { ...card, options: { ...card.options, defId } };
}

/** Distinct, theme-independent hues for telling linked card sets apart in the editor. */
const LINK_COLORS = ['#8b5cf6', '#f97316', '#14b8a6', '#ec4899', '#eab308', '#3b82f6', '#ef4444', '#22c55e'];

/**
 * The editor colour of one shared layout: every card with the same defId gets the
 * same colour, so linked cards can be told apart from another linked set at a glance.
 * Derived from the id (stable across reloads); two sets may collide past eight.
 */
export function deviceCardColor(defId: string | undefined): string {
    if (!defId) return LINK_COLORS[0];
    let h = 0;
    for (let i = 0; i < defId.length; i++) h = (h * 31 + defId.charCodeAt(i)) | 0;
    return LINK_COLORS[Math.abs(h) % LINK_COLORS.length];
}
