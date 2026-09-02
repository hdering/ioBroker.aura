/**
 * Datapoint bindings in a marker's label text.
 *
 * A marker (badge) with style 'label' shows a fixed text. This layer lets that text
 * carry the same bindings as free HTML — `{0_userdata.0.Pool.MaxRun} min` — so a
 * corner marker can state a value without a widget of its own:
 *
 *   {0_userdata.0.Pool.MaxRun} min      any datapoint, formatted like a widget value
 *   {dp} °C                             the widget's own (main) datapoint
 *   {0_userdata.0.Netz;round(0)} W      through an operation chain
 *   {{ 0_userdata.0.A + 0_userdata.0.B }}   an expression
 *
 * The engine is utils/htmlTemplate — the very same one the HTML widget and the value
 * widget use, so nothing new has to be learned and `docs/widgets/bindings.md` covers
 * this field too. Only the `dp` variable is offered here: a marker has no colour or
 * unit of its own, and the widget specials (`{view}`, `{wname}`) would need a widget
 * config, which tab and section markers do not have.
 *
 * Kept out of hooks/useBadges so the wiring can be tested without a browser
 * (tools/tests/badge-label-bindings.mjs).
 */

import { extractTemplateDpRefs, renderTemplate } from './htmlTemplate';
import { extractJsonPath } from './dpRef';
import type { DpField } from './expr';
import type { OpsContext } from './exprOps';

/** One subscribed reference as the binding layer needs it — value plus timestamps. */
export interface BadgeLabelState {
    val: unknown;
    ts?: number;
    lc?: number;
}

export interface BadgeLabelEnv {
    /** ref → live state, keyed exactly like badgeLabelRefs returns them. */
    states: Record<string, BadgeLabelState | undefined>;
    /** The widget's main datapoint ref, behind the `{dp}` variable. */
    ownDp?: string;
    /** Display formatting of a value (decimals, thousands separator, dash when unknown). */
    fmt: (val: unknown) => string;
    /** Operations for the calculating forms. */
    ops: OpsContext;
}

/** True when a text could hold a binding at all. A label without a brace never
 *  reaches the engine, which keeps the common case free of any work. */
export function hasBadgeBinding(text: string | undefined | null): boolean {
    return !!text && text.includes('{');
}

/**
 * The datapoint refs a set of label texts reads, de-duplicated. `ownDp` rides along
 * whenever any text holds a binding: `{dp}` is resolved from it, and a marker on a
 * widget whose main datapoint nothing else subscribes to would otherwise stay empty.
 */
export function badgeLabelRefs(labels: Array<string | undefined>, ownDp?: string): string[] {
    const refs = new Set<string>();
    let any = false;
    for (const label of labels) {
        if (!hasBadgeBinding(label)) continue;
        any = true;
        for (const ref of extractTemplateDpRefs(label)) refs.add(ref);
    }
    if (any && ownDp) refs.add(ownDp);
    return [...refs];
}

/** `text` with its bindings replaced by the current values. Anything that is not a
 *  binding — CSS-like braces, a typo, `{{parent}}` — comes through verbatim. */
export function renderBadgeLabel(text: string, env: BadgeLabelEnv): string {
    if (!hasBadgeBinding(text)) return text;
    const own = env.ownDp ? env.states[env.ownDp] : undefined;
    const ownVal = own ? own.val : null;
    return renderTemplate(text, {
        vars: env.ownDp ? { dp: env.fmt(ownVal) } : {},
        resolve: (ref) => env.fmt(env.states[ref]?.val),
        resolveVarPath: (name, path) => (name === 'dp' ? env.fmt(extractJsonPath(ownVal, path)) : '–'),
        // The calculating forms work on raw values — a formatted "1.234,5" cannot be
        // multiplied, and a decimal comma would break the arithmetic.
        resolveRaw: (ref, field: DpField) => env.states[ref]?.[field] ?? null,
        rawVars: { dp: ownVal ?? null },
        ops: env.ops,
    });
}
