/**
 * Reachability of the device behind a list row (#925): the dynamic list can hide rows
 * whose device reports itself unreachable, e.g. a fairy light that is unplugged over
 * the summer. Pure, so it can be tested without a socket.
 */

/** A datapoint that says whether the device answers - and which way round it says it. */
export interface ReachDp {
    id: string;
    /** true: the value is true while the device IS reachable (available, online …). */
    positive: boolean;
}

// true = unreachable: HomeMatic/alias UNREACH, offline flags.
const NEGATIVE_NAMES = ['UNREACH', 'unreach', 'UNREACHABLE', 'unreachable', 'offline', 'OFFLINE'];
const NEGATIVE_ROLES = ['indicator.maintenance.unreach', 'indicator.unreach'];
// true = reachable: zigbee `available`, Shelly `online`, `reachable`, `alive`.
const POSITIVE_NAMES = ['available', 'AVAILABLE', 'reachable', 'REACHABLE', 'online', 'ONLINE', 'alive', 'ALIVE'];
const POSITIVE_ROLES = ['indicator.reachable', 'indicator.available'];

/**
 * The reachability datapoint for `dpId` among `rows` - the states of its own channel
 * and, where the caller passes them, of the device above (HmIP keeps UNREACH on
 * channel 0). Own channel first, names before roles. Undefined = the device has none,
 * and the row is never hidden for it.
 */
export function findReachDp(dpId: string, rows: Array<{ id: string; role?: string }>): ReachDp | undefined {
    const parts = dpId.split('.');
    const parent = parts.slice(0, -1).join('.');
    const parentUp = parts.slice(0, -2).join('.');
    const scopes = [rows.filter((r) => r.id.startsWith(`${parent}.`))];
    if (parentUp.split('.').length >= 3) scopes.push(rows.filter((r) => r.id.startsWith(`${parentUp}.`)));
    for (const scope of scopes) {
        const own = scope.filter((r) => r.id !== dpId);
        const last = (r: { id: string }) => r.id.split('.').pop() ?? '';
        const byName = (names: string[]) => own.find((r) => names.includes(last(r)));
        const byRole = (roles: string[]) => own.find((r) => roles.includes((r.role ?? '').toLowerCase()));
        const neg = byName(NEGATIVE_NAMES) ?? byRole(NEGATIVE_ROLES);
        if (neg) return { id: neg.id, positive: false };
        const pos = byName(POSITIVE_NAMES) ?? byRole(POSITIVE_ROLES);
        if (pos) return { id: pos.id, positive: true };
    }
    return undefined;
}

const truthy = (v: unknown): boolean | null => {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    const s = String(v).trim().toLowerCase();
    if (['true', '1', 'on', 'yes'].includes(s)) return true;
    if (['false', '0', 'off', 'no'].includes(s)) return false;
    return null;
};

/** True only when the datapoint clearly says "not reachable" - no value hides nothing. */
export function isUnreachable(reach: ReachDp, value: unknown): boolean {
    const t = truthy(value);
    if (t === null) return false;
    return reach.positive ? !t : t;
}

/** The id an alias reads from: `common.alias.id` as a string or its `read` side. */
export function aliasTargetOf(common: unknown): string | undefined {
    const alias = (common as { alias?: { id?: unknown } } | undefined)?.alias;
    const id = alias?.id;
    if (typeof id === 'string') return id || undefined;
    if (id && typeof id === 'object') {
        const rw = id as { read?: unknown; write?: unknown };
        const pick = typeof rw.read === 'string' && rw.read ? rw.read : rw.write;
        return typeof pick === 'string' && pick ? pick : undefined;
    }
    return undefined;
}
