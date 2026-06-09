/**
 * Shared DP relevance check.
 *
 * Returns true when a datapoint's role/type indicates it is user-facing
 * and worth showing selected by default in list widgets / multi-pickers.
 *
 * Deliberately stricter than detectWidgetTypeFromRole:
 *   - excludes indicator.* (LOWBAT, UNREACH, CONFIG_PENDING, INSTALL_TEST …)
 *   - excludes bare "button" role (PRESS_SHORT, …)
 *   - excludes generic boolean-with-no-role (system flags)
 */
export function isRelevantDp(role?: string, _type?: string): boolean {
    const r = (role ?? '').toLowerCase();

    if (r.startsWith('level.') || r === 'level') return true;
    if (r.startsWith('value.') || r === 'value') return true;
    if (r === 'switch' || r.startsWith('switch.')) return true;
    if (r === 'sensor.window' || r === 'window') return true;
    if (r === 'sensor.door' || r === 'door') return true;
    if (r === 'motion' || r.startsWith('sensor.motion') || r.includes('presence')) return true;
    if (r.startsWith('sensor.alarm') || r.includes('smoke')) return true;
    if (r.startsWith('heating')) return true;
    if (r === 'level.volume' || r === 'media.volume') return true;

    return false;
}
