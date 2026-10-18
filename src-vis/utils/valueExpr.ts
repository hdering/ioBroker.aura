/**
 * Display-only value conversion by expression (issue #794).
 *
 * Where factor/offset is not enough — a value inside a JSON object, a calculation
 * with several steps, rounding to fixed decimals — a list entry may carry an
 * expression instead: `dp.objektName * 0.4 | fixed(2)`. `dp` is the entry's value
 * (a JSON string is addressable directly, `dp.devices[0].soc`), the grammar is the
 * one of the datapoint bindings (utils/expr). No other datapoints are read, so the
 * expression needs no subscriptions of its own.
 */
import { evalExpr, exprToString } from './expr';
import type { OpsContext } from './exprOps';

const NUMERIC_RE = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

/**
 * Applies `expr` to `value`. An empty expression, or one that does not parse, leaves
 * the value as it is — a typo mid-edit must not blank the row.
 */
export function applyValueExpr(value: unknown, expr: string | undefined, ops: OpsContext): unknown {
    const src = (expr ?? '').trim();
    if (!src) return value;
    // Some adapters store numbers as text (upnp & co.); `dp + 1` must add, not append.
    // Only a plain decimal counts — "0x004" stays the text it is (issue #494).
    const dp = typeof value === 'string' && NUMERIC_RE.test(value.trim()) ? Number(value) : value;
    const out = evalExpr(src, { resolveRaw: () => null, vars: { dp }, ops });
    if (out === undefined) return value;
    // NaN/Infinity read as "no value", like a datapoint without one.
    if (typeof out === 'number' && !Number.isFinite(out)) return null;
    // An object (`dp.devices`) prints as JSON instead of "[object Object]".
    if (out !== null && typeof out === 'object') return exprToString(out);
    return out;
}
