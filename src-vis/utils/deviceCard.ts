// ─────────────────────────────────────────────────────────────────────────────
// Device card (#743): a group whose children are shared by every copy of the card
// and resolve `{{dp}}` & co. against the card's own datapoint.
// ─────────────────────────────────────────────────────────────────────────────
// The children live in the groupDefsStore under `options.defId`, like a group's.
// Copying a card keeps that defId (widgetCopy only re-issues group/panels defs),
// so every copy shows the same layout; detaching gives one card a def of its own.
import type { WidgetConfig } from '../types';
import { buildPopupSubMap, dpVarMap, resolvePopupWidget } from './popupPlaceholders';
import { runtimeId } from '../contexts/RenderTransformContext';
import { hostsGroupDef } from './groupTypes';
import { cloneGroupDef, newCloneScope, finishClone } from './widgetCopy';

/**
 * Token table of one card: `{{dp}}`, `{{name}}`, `{{parent}}`, `{{parent2}}` … from
 * the card's datapoint, plus the card's own string options as `{{key}}` — the same
 * table a popup view gets from the widget that opened it — and the tokens of the
 * card's further datapoints (`{{aussen}}`, `{{aussen_parent}}` …, #1007).
 */
export function deviceCardVars(card: WidgetConfig): Record<string, string> {
    const extra: Record<string, string> = {};
    for (const { key, dp } of deviceCardExtraDps(card)) Object.assign(extra, extraDpVarMap(key, dp));
    return { ...extra, ...buildPopupSubMap(card, card.datapoint ?? '') };
}

// ── Further datapoints of one card (#1007) ──────────────────────────────────────
// A card may draw on more than its own device: each entry of `options.extraDps`
// adds that datapoint's token set under a short name — `{{aussen}}`,
// `{{aussen_parent}}`, `{{aussen_dpname}}` … The names belong to the shared layout
// (the children use them), the datapoints to each card.

/** One further datapoint of a card: `key` is the token prefix, `dp` the id. */
export interface DeviceCardExtraDp {
    key: string;
    dp: string;
}

/** Letters and digits only, starting with a letter — no `_`, so `{{key_parent}}` stays unambiguous. */
const EXTRA_KEY_RE = /^[A-Za-z][A-Za-z0-9]*$/;
/** Token names of the card's own datapoint, which a short name must not hide. */
const RESERVED_KEY_RE = /^(?:dp|name|dpname|dpunit|parent\d*|parent\d*name)$/i;

export type ExtraDpKeyProblem = 'invalid' | 'reserved' | 'duplicate';

/** Why a short name cannot be used (`others` = the names before it), or null when it can. */
export function extraDpKeyProblem(key: string, others: string[]): ExtraDpKeyProblem | null {
    if (!EXTRA_KEY_RE.test(key)) return 'invalid';
    if (RESERVED_KEY_RE.test(key)) return 'reserved';
    if (others.includes(key)) return 'duplicate';
    return null;
}

/** The entries of a card as stored — may hold half-typed rows. */
export function deviceCardExtraDpsRaw(card: WidgetConfig): DeviceCardExtraDp[] {
    const list = card.options?.extraDps;
    if (!Array.isArray(list)) return [];
    return list
        .filter((e): e is Partial<DeviceCardExtraDp> => !!e && typeof e === 'object')
        .map((e) => ({ key: typeof e.key === 'string' ? e.key : '', dp: typeof e.dp === 'string' ? e.dp : '' }));
}

/** The usable entries of a card: a valid, unique short name and a datapoint. */
export function deviceCardExtraDps(card: WidgetConfig): DeviceCardExtraDp[] {
    const seen: string[] = [];
    const out: DeviceCardExtraDp[] = [];
    for (const e of deviceCardExtraDpsRaw(card)) {
        const key = e.key.trim();
        const dp = e.dp.trim();
        if (!dp || extraDpKeyProblem(key, seen)) continue;
        seen.push(key);
        out.push({ key, dp });
    }
    return out;
}

/** Renames a token table of one datapoint to a short name: `dp` → `key`, the rest → `key_<token>`. */
export function prefixVars(key: string, vars: Record<string, string>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [token, value] of Object.entries(vars)) out[token === 'dp' ? key : `${key}_${token}`] = value;
    return out;
}

/** The id tokens of one further datapoint: `key`, `key_name`, `key_parent`, `key_parent2` … */
export function extraDpVarMap(key: string, dp: string): Record<string, string> {
    return prefixVars(key, dpVarMap(dp));
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
