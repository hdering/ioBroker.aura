/**
 * The `{{key}}` placeholder layer of popups.
 *
 * Pure string substitution, applied ONCE when a popup opens: it rewrites text and
 * never reads a datapoint value. The complementary live layer is `[[dp]]`, handled
 * by components/widgets/DynamicTitle — the two compose because this one runs first.
 *
 * Shared by the popup view body (every field of every embedded widget) and the popup
 * dialog heading, so both resolve the same token set from the same main datapoint.
 */
import type { WidgetConfig } from '../types';

/**
 * The datapoint variables of one id — the token table every `{{key}}` layer shares.
 *
 * `{{dp}}` is the id itself, `{{name}}` its last segment, `{{parent}}` the id without
 * that segment. Each further level is numbered: `{{parent2}}` climbs one more, and so
 * on — HomeMatic keeps a device's maintenance datapoints in a sibling channel, so the
 * thermostat's `…000A.1.ACTUAL_TEMPERATURE` reaches its battery only via
 * `{{parent2}}.0.OPERATING_VOLTAGE`.
 *
 * The climb stops at `adapter.instance`: above that there is no addressable strang
 * left. Numbers rather than `{{parent.parent}}`, because a dot inside double braces
 * belongs to the binding layer (see docs/widgets/bindings.md) — and because `\w+` is
 * what every consumer's token regex already matches.
 */
export function dpVarMap(dpId: string): Record<string, string> {
    if (!dpId) return {};
    const map: Record<string, string> = { dp: dpId };
    const lastDot = dpId.lastIndexOf('.');
    if (lastDot <= 0) return map;
    map.name = dpId.slice(lastDot + 1); // last segment, e.g. ACTUAL_TEMPERATURE
    let strang = dpId.slice(0, lastDot); // parent strang, e.g. hm-rpc.2.000A.1
    map.parent = strang;
    for (let level = 2; strang.includes('.'); level++) {
        strang = strang.slice(0, strang.lastIndexOf('.'));
        if (!strang.includes('.')) break; // one segment left — below adapter.instance
        map[`parent${level}`] = strang;
    }
    return map;
}

/** Replaces every `{{key}}` known to `map`; unknown keys are left untouched. */
export function subAll(value: string, map: Record<string, string>): string {
    if (!value) return value;
    return value.replace(/\{\{(\w+)\}\}/g, (_, key) => map[key] ?? `{{${key}}}`);
}

/** Recursively substitute `{{key}}` in every string within a value, walking nested
 *  arrays and objects. Needed so datapoints buried in option arrays — e.g. the
 *  extended chart's `echartSeries[].datapointId`, camera slots, chips — also resolve. */
export function subDeep(value: unknown, map: Record<string, string>): unknown {
    if (typeof value === 'string') return subAll(value, map);
    if (Array.isArray(value)) return value.map((v) => subDeep(v, map));
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, subDeep(v, map)]));
    }
    return value;
}

/** Option keys holding a datapoint id (`stopDp`, `tiltDp`, `actualDatapoint`, …). */
const DP_OPTION_KEY = /(Dp|Datapoint|datapoint)$/;

/**
 * Drop datapoint options that still carry a `{{token}}`: the trigger widget has
 * no such option, so there is nothing to point at. Left in place the literal
 * would be treated as a datapoint id — a built-in popup would show controls for
 * a datapoint that does not exist and write to it.
 */
function dropUnresolvedDps(options: WidgetConfig['options']): WidgetConfig['options'] {
    if (!options) return options;
    const out: Record<string, unknown> = { ...options };
    let changed = false;
    for (const [key, val] of Object.entries(out)) {
        if (typeof val === 'string' && val.includes('{{') && DP_OPTION_KEY.test(key)) {
            delete out[key];
            changed = true;
        }
    }
    return changed ? (out as WidgetConfig['options']) : options;
}

export function substituteWidget(w: WidgetConfig, map: Record<string, string>): WidgetConfig {
    // Without a token table nothing resolves — the placeholder datapoints still
    // have to go, or the popup would treat them as real ids.
    if (Object.keys(map).length === 0) return { ...w, options: dropUnresolvedDps(w.options) };
    return {
        ...w,
        datapoint: subAll(w.datapoint, map),
        title: subAll(w.title, map),
        options: w.options ? dropUnresolvedDps(subDeep(w.options, map) as WidgetConfig['options']) : w.options,
    };
}

/** The datapoint a popup resolves its tokens against: an explicit click-action
 *  override (e.g. the clicked list row) beats the trigger widget's own datapoint. */
export function popupMainDp(triggerWidget: WidgetConfig | undefined, dpOverride?: string): string {
    return dpOverride || triggerWidget?.datapoint || '';
}

/**
 * Token table for one popup: the trigger widget's string options plus the datapoint
 * variables derived from `mainDp`. The derived ones always win, so a widget option
 * called e.g. `name` can never shadow `{{name}}`.
 */
export function buildPopupSubMap(triggerWidget: WidgetConfig | undefined, mainDp: string): Record<string, string> {
    const map: Record<string, string> = Object.fromEntries(
        Object.entries(triggerWidget?.options ?? {}).filter((e): e is [string, string] => typeof e[1] === 'string'),
    );
    return Object.assign(map, dpVarMap(mainDp));
}
