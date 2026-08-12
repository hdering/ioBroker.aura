/**
 * Second-line template of the dynamic list: one set of extra datapoints configured
 * once and resolved per row against that row's own datapoint.
 *
 * The static list configures its second line per entry — for a list whose rows come
 * from a filter that does not work: nobody hand-picks the battery datapoint of 40
 * discovered thermostats. The template closes that gap with the SAME tokens popup
 * views already use (`{{dp}}`, `{{parent}}`, `{{name}}`, see utils/popupPlaceholders),
 * so there is no second placeholder concept to learn.
 *
 * A per-entry `subDps` list always wins over the template — see AutoListWidget.
 */
import { subAll } from './popupPlaceholders';
import type { EntrySubDp } from '../components/widgets/EntrySubLine';

/** Token table for one list row — the same keys buildPopupSubMap derives for a popup. */
export function subDpTokenMap(dpId: string): Record<string, string> {
    if (!dpId) return {};
    const map: Record<string, string> = { dp: dpId };
    const lastDot = dpId.lastIndexOf('.');
    if (lastDot > 0) {
        map.parent = dpId.slice(0, lastDot); // parent strang, e.g. hm-rpc.0.Thermostat
        map.name = dpId.slice(lastDot + 1); // last segment, e.g. ACTUAL_TEMPERATURE
    }
    return map;
}

/** true once every `{{token}}` in `id` has been substituted. */
export function isResolvedDpId(id: string): boolean {
    return !!id && !/\{\{\w+\}\}/.test(id);
}

/**
 * Resolves the list-wide template for one row's datapoint.
 *
 * Rows whose id still holds an unresolved token are dropped: a top-level datapoint
 * has no parent strang to answer `{{parent}}`, and a literal "{{parent}}.BATTERY"
 * on screen is worse than nothing. Ids without tokens pass through unchanged — an
 * absolute datapoint (outdoor temperature, a shared price) is a legitimate template
 * row that then reads the same on every entry.
 */
export function resolveSubDpTemplate(template: EntrySubDp[] | undefined, dpId: string): EntrySubDp[] {
    if (!template?.length || !dpId) return [];
    const map = subDpTokenMap(dpId);
    const out: EntrySubDp[] = [];
    for (const s of template) {
        if (!s?.id) continue;
        const id = subAll(s.id, map);
        if (!isResolvedDpId(id)) continue;
        out.push(id === s.id ? s : { ...s, id });
    }
    return out;
}

/**
 * Rewrites a concrete datapoint id into a template id, so picking "BATTERY" of the
 * sample device yields `{{parent}}.BATTERY` and applies to every other row too.
 *
 * Only DIRECT siblings are tokenised. Anything else (another channel of the same
 * device, an unrelated datapoint) stays absolute on purpose: `{{parent}}` is defined
 * as "id without its last segment", so a deeper path could not be reconstructed for
 * other rows — and an absolute id is exactly what a shared datapoint needs.
 */
export function toSubDpTemplateId(id: string, sampleDpId: string): string {
    if (!id || !sampleDpId) return id;
    const lastDot = sampleDpId.lastIndexOf('.');
    if (lastDot <= 0) return id;
    const parent = sampleDpId.slice(0, lastDot);
    if (!id.startsWith(`${parent}.`)) return id;
    const rest = id.slice(parent.length + 1);
    return rest && !rest.includes('.') ? `{{parent}}.${rest}` : id;
}
