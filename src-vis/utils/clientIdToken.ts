import type { WidgetCondition } from '../types';

/**
 * `{{clientId}}` in a datapoint stands for the device the dashboard runs on, so
 * ONE rule on `clients.{{clientId}}.idle.active` is a screensaver for every device
 * instead of one rule per client (#822), and one tab rule on
 * `0_userdata.0.aura.{{clientId}}.showX` shows or hides a tab per device (#896).
 */
export const CLIENT_ID_TOKEN = '{{clientId}}';

/** Tab/section rules with the token replaced by this device's id; untouched when none uses it. */
export function withClientIdConditions(
    conditions: WidgetCondition[] | undefined,
    clientId: string,
): WidgetCondition[] | undefined {
    const uses = (v: string | undefined) => !!v && v.includes(CLIENT_ID_TOKEN);
    if (
        !conditions?.some((c) =>
            c.clauses.some((cl) => uses(cl.datapoint) || (cl.valueType === 'datapoint' && uses(cl.value))),
        )
    )
        return conditions;
    const sub = (v: string) => v.split(CLIENT_ID_TOKEN).join(clientId);
    return conditions.map((c) => ({
        ...c,
        clauses: c.clauses.map((cl) => ({
            ...cl,
            datapoint: sub(cl.datapoint),
            value: cl.valueType === 'datapoint' ? sub(cl.value) : cl.value,
        })),
    }));
}
