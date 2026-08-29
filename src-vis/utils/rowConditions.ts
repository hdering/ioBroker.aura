import { subAll } from './popupPlaceholders';
import { subDpTokenMap, isResolvedDpId } from './subDpTemplate';
import { evaluateClause, OWN_DP_TOKEN } from './conditionEval';
import type { ElementConditionRule, ElementConditionTarget } from '../types';

/**
 * Conditional formatting for the rows of a list (issue #572).
 *
 * A list row is not one element but four — icon, name, value and the row itself —
 * so a rule names its `target`. Everything else is the machinery the custom-grid
 * cells already use: the same clause operators, the same "later rule wins per
 * field" merge.
 *
 * Two placeholder syntaxes meet here and mean different things. Keeping them apart
 * is the whole point of this module:
 *
 *   {dp}            the row's own VALUE      (conditionSources, single braces)
 *   {{parent}}.X    a neighbour DP's ID      (subDpTemplate, double braces)
 *
 * The second is what makes one rule work for 40 discovered thermostats: the clause
 * datapoint is resolved per row, exactly like the second line's template.
 */

export interface ElementCondResult {
    color?: string;
    bg?: string;
    bold?: boolean;
    italic?: boolean;
    icon?: string;
    iconColor?: string;
    iconSize?: number;
    /** Text size in px; undefined = the size the row renders the part at. */
    fontSize?: number;
    text?: string;
    effect?: 'pulse' | 'blink';
    hide?: boolean;
}

/** Merged effects per target. Absent target = no rule painted that part. */
export type RowCondResult = Partial<Record<ElementConditionTarget, ElementCondResult>>;

export const EMPTY_ROW_COND: RowCondResult = {};

/** Every target a rule can name — drives the editor's target select. */
export const ELEMENT_TARGETS: ElementConditionTarget[] = ['row', 'name', 'value', 'icon'];

/** '{dp}', an empty field and the element's own DP all mean "its own value". */
export function isOwnRef(ref: string | undefined, ownDp: string): boolean {
    return !ref || ref === OWN_DP_TOKEN || ref === ownDp;
}

/**
 * Resolve `{{parent}}` / `{{dp}}` / `{{name}}` in every clause of every rule against
 * one row's datapoint.
 *
 * A rule whose clause still holds an unresolved token is dropped for this row: a
 * top-level datapoint has no parent strang to answer `{{parent}}`, and silently
 * comparing against the literal string would paint rows at random. Rules without
 * tokens are returned unchanged, identity included, so a list without templates
 * costs nothing.
 */
export function resolveRuleRefs(rules: ElementConditionRule[] | undefined, rowDpId: string): ElementConditionRule[] {
    if (!rules?.length) return [];
    const map = subDpTokenMap(rowDpId);
    const out: ElementConditionRule[] = [];
    for (const rule of rules) {
        const clauses = rule.clauses ?? [];
        if (!clauses.length) continue;
        let changed = false;
        let dropped = false;
        const next = clauses.map((cl) => {
            const dp = subAll(cl.datapoint ?? '', map);
            const isDpValue = cl.valueType === 'datapoint';
            const val = isDpValue ? subAll(cl.value ?? '', map) : cl.value;
            if (dp && !isResolvedDpId(dp)) dropped = true;
            if (isDpValue && val && !isResolvedDpId(val)) dropped = true;
            if (dp === cl.datapoint && val === cl.value) return cl;
            changed = true;
            return { ...cl, datapoint: dp, value: val };
        });
        if (dropped) continue;
        out.push(changed ? { ...rule, clauses: next } : rule);
    }
    return out;
}

/** Clause refs that are not the row's own value and therefore need a subscription. */
export function ruleForeignRefs(rules: ElementConditionRule[], ownDp: string): string[] {
    const set = new Set<string>();
    for (const rule of rules) {
        for (const cl of rule.clauses ?? []) {
            if (!isOwnRef(cl.datapoint, ownDp)) set.add(cl.datapoint);
            if (cl.valueType === 'datapoint' && !isOwnRef(cl.value, ownDp)) set.add(cl.value);
        }
    }
    set.delete('');
    return [...set];
}

function applyEffects(into: ElementCondResult, rule: ElementConditionRule): void {
    if (rule.color) into.color = rule.color;
    if (rule.bg) into.bg = rule.bg;
    if (rule.bold !== undefined) into.bold = rule.bold;
    if (rule.italic !== undefined) into.italic = rule.italic;
    if (rule.icon) into.icon = rule.icon;
    if (rule.iconColor) into.iconColor = rule.iconColor;
    if (rule.iconSize !== undefined) into.iconSize = rule.iconSize;
    if (rule.fontSize !== undefined) into.fontSize = rule.fontSize;
    if (rule.text !== undefined && rule.text !== '') into.text = rule.text;
    if (rule.effect && rule.effect !== 'none') into.effect = rule.effect;
    // Hiding is absorbing — a later rule never brings the element back.
    if (rule.hide) into.hide = true;
}

/**
 * Evaluate a row's rules and merge the effects of every match.
 *
 * `rules` is the already-resolved concatenation of the list-wide rules and the
 * entry's own ones, in that order — so the entry wins, per field, simply by coming
 * later. The result keeps the targets apart; partOf() is what layers a row-level
 * effect under a part-specific one at render time.
 */
export function evalRowRules(
    rules: ElementConditionRule[],
    ownDp: string,
    ownValue: unknown,
    values: Map<string, unknown>,
): RowCondResult {
    const out: RowCondResult = {};
    let any = false;
    for (const rule of rules) {
        const clauses = rule.clauses ?? [];
        if (!clauses.length) continue;
        const hits = clauses.map((cl) => {
            const raw = isOwnRef(cl.datapoint, ownDp) ? ownValue : values.get(cl.datapoint);
            // A compare value pointing back at the element's own datapoint has to be
            // resolved here as well — `values` holds only the foreign ones.
            const clause =
                cl.valueType === 'datapoint' && isOwnRef(cl.value, ownDp)
                    ? { ...cl, valueType: 'static' as const, value: String(ownValue ?? '') }
                    : cl;
            return evaluateClause(clause, raw, values);
        });
        const matched = (rule.logic ?? 'AND') === 'OR' ? hits.some(Boolean) : hits.every(Boolean);
        if (!matched) continue;
        any = true;
        const target = rule.target ?? 'row';
        applyEffects((out[target] ??= {}), rule);
    }
    return any ? out : EMPTY_ROW_COND;
}

/**
 * The effect that applies to one part of the row: what the row-level rules said,
 * overlaid with what the part-specific ones said.
 *
 * `bg` and `hide` are deliberately NOT inherited from the row — a row background
 * is the row's, and hiding the row is not hiding its name.
 */
export function partOf(
    res: RowCondResult | undefined,
    target: Exclude<ElementConditionTarget, 'row'>,
): ElementCondResult {
    if (!res) return {};
    const row = res.row;
    const own = res[target];
    if (!row && !own) return {};
    if (!row) return own!;
    const base: ElementCondResult = {
        color: row.color,
        bold: row.bold,
        italic: row.italic,
        fontSize: row.fontSize,
        effect: row.effect,
        ...(target === 'icon' ? { icon: row.icon, iconColor: row.iconColor, iconSize: row.iconSize } : null),
    };
    return own ? { ...base, ...stripUndefined(own) } : base;
}

function stripUndefined(o: ElementCondResult): ElementCondResult {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
    return out as ElementCondResult;
}

/**
 * The inline animation an element effect produces. Inline rather than a class:
 * every render site already spreads a style object for the colour, so this rides
 * along instead of threading a className through a dozen components.
 */
export function condAnimation(part: ElementCondResult | undefined): string | undefined {
    if (part?.effect === 'pulse') return 'auraCondPulse 1.5s ease-in-out infinite';
    if (part?.effect === 'blink') return 'blink 1s step-end infinite';
    return undefined;
}

/** True when any rule hides the whole row. */
export function rowHidden(res: RowCondResult | undefined): boolean {
    return !!res?.row?.hide;
}
