/**
 * Second-line template of the dynamic list: one set of extra datapoints configured
 * once and resolved per row against that row's own datapoint.
 *
 * The static list configures its second line per entry — for a list whose rows come
 * from a filter that does not work: nobody hand-picks the battery datapoint of 40
 * discovered thermostats. The template closes that gap with the SAME tokens popup
 * views already use (`{{dp}}`, `{{parent}}`, `{{parent2}}`, `{{name}}`, see utils/popupPlaceholders),
 * so there is no second placeholder concept to learn.
 *
 * A per-entry `subDps` list always wins over the template — see AutoListWidget.
 */
import { dpVarMap, subAll } from './popupPlaceholders';
import type { EntrySubDp } from '../components/widgets/EntrySubLine';

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
    const map = dpVarMap(dpId);
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
 * Picking across channels works the same way: the sample's ancestors are tried from
 * the deepest one down, so the HomeMatic thermostat's maintenance channel comes back
 * as `{{parent2}}.0.OPERATING_VOLTAGE` — the deepest match keeps the relative part as
 * short and as specific as it can be.
 *
 * The walk stops BELOW `adapter.instance`, which is the difference between "another
 * channel of this device" and "a different device entirely". `hm-rpc.2` matches every
 * device of that instance, so tokenising against it would turn a deliberately chosen
 * neighbour datapoint into a wrong one for every other row; those ids stay absolute,
 * which is exactly what a shared datapoint (outdoor temperature, a price) needs.
 */
export function toSubDpTemplateId(id: string, sampleDpId: string): string {
    if (!id || !sampleDpId) return id;
    const vars = dpVarMap(sampleDpId);
    for (let level = 1; ; level++) {
        const token = level === 1 ? 'parent' : `parent${level}`;
        const strang = vars[token];
        // The direct parent is always fair game — it is the row's own strang, however
        // shallow the tree is. Climbing further is only safe while the strang stays
        // below `adapter.instance`, which has two segments.
        if (!strang || (level > 1 && strang.split('.').length < 3)) return id;
        if (id.startsWith(`${strang}.`)) {
            const rest = id.slice(strang.length + 1);
            return rest ? `{{${token}}}.${rest}` : id;
        }
    }
}
