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

export function substituteWidget(w: WidgetConfig, map: Record<string, string>): WidgetConfig {
    if (Object.keys(map).length === 0) return w;
    return {
        ...w,
        datapoint: subAll(w.datapoint, map),
        title: subAll(w.title, map),
        options: w.options ? (subDeep(w.options, map) as WidgetConfig['options']) : w.options,
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
    if (mainDp) {
        map.dp = mainDp;
        const lastDot = mainDp.lastIndexOf('.');
        if (lastDot > 0) {
            map.parent = mainDp.slice(0, lastDot); // parent strang, e.g. 0_userdata.0
            map.name = mainDp.slice(lastDot + 1); // last segment, e.g. Anzeige
        }
    }
    return map;
}
