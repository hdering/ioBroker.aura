/**
 * What the filters of a dynamic list (autolist) find in the object DB. Pure: the rows
 * are handed in, so the widget (over the socket) and the adapter (lib/autoListSync.js,
 * #893, via lib/shared/auraShared.js) run the very same search.
 */
import { isRelevantDp } from './dpRelevance';
import { buildEnumMemberIndex, enumIdsForObject, matchesEnumFilter, splitEnumFilter } from './enumFilter';

export interface DiscoveredDp {
    id: string;
    name: string;
    role?: string;
    type?: string;
    unit?: string;
    write?: boolean;
    rooms: string[];
    /** true if the role/type matches a known widget pattern */
    isRelevant: boolean;
}

/** The options of the dynamic list the search reads. */
export interface AutoListDiscoveryOptions {
    filterRoles?: string;
    filterIdPattern?: string;
    filterRooms?: string;
    filterFuncs?: string;
    filterEnums?: string;
    filterTypes?: string;
    filterAdapters?: string;
    excludeIdPatterns?: string;
    excludeIds?: string[];
}

interface ObjectLike {
    _id: string;
    common?: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

/** One row of an ioBroker object view. */
export interface DiscoveryRow {
    id: string;
    value: ObjectLike;
}

/** The object views the search needs; `aliasX` are the `alias.*` range queries (#524). */
export interface DiscoveryRows {
    states: DiscoveryRow[];
    aliasStates?: DiscoveryRow[];
    channels: DiscoveryRow[];
    aliasChannels?: DiscoveryRow[];
    devices: DiscoveryRow[];
    aliasDevices?: DiscoveryRow[];
    enums: DiscoveryRow[];
}

/**
 * Match id against a pattern that is either:
 *   - plain text  → case-insensitive substring match
 *   - /regex/flags → RegExp test (default flag: i)
 */
export function matchesIdPattern(id: string, pattern: string): boolean {
    const p = pattern.trim();
    if (p.startsWith('/')) {
        const lastSlash = p.lastIndexOf('/');
        const body = p.slice(1, lastSlash > 0 ? lastSlash : undefined);
        const flags = lastSlash > 0 ? p.slice(lastSlash + 1) : 'i';
        try {
            return new RegExp(body, flags || 'i').test(id);
        } catch {
            return false;
        }
    }
    return id.toLowerCase().includes(p.toLowerCase());
}

export function resolveName(name: string | Record<string, string> | undefined, fallback: string): string {
    if (!name) return fallback;
    if (typeof name === 'string') return name;
    return name.de ?? name.en ?? Object.values(name)[0] ?? fallback;
}

/** True when the stored filter makes the periodic sync re-add matching datapoints. */
export function hasDiscoveryFilter(
    opts: Pick<
        AutoListDiscoveryOptions,
        | 'filterRoles'
        | 'filterIdPattern'
        | 'filterRooms'
        | 'filterFuncs'
        | 'filterEnums'
        | 'filterTypes'
        | 'filterAdapters'
    >,
): boolean {
    return !!(
        opts.filterRoles ||
        opts.filterIdPattern ||
        opts.filterRooms ||
        opts.filterFuncs ||
        opts.filterEnums ||
        opts.filterTypes ||
        opts.filterAdapters
    );
}

/** The plain view plus its `alias.*` range, the alias rows only where the id is new. */
export function withAliases(plain: DiscoveryRow[], aliases: DiscoveryRow[] | undefined): DiscoveryRow[] {
    if (!aliases?.length) return plain;
    const seen = new Set(plain.map((r) => r.id));
    const out = [...plain];
    for (const row of aliases) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        out.push(row);
    }
    return out;
}

const splitList = (s: string | undefined) =>
    (s ?? '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);

export function discoverFromRows(rows: DiscoveryRows, opts: AutoListDiscoveryOptions): DiscoveredDp[] {
    const stateRows = withAliases(rows.states, rows.aliasStates);
    const channelRows = withAliases(rows.channels, rows.aliasChannels);
    const deviceRows = withAliases(rows.devices, rows.aliasDevices);
    const enumRows = rows.enums;

    // Build parent name map (channels override devices when both exist)
    const parentNames = new Map<string, string>();
    for (const { id, value: obj } of [...deviceRows, ...channelRows]) {
        if (!obj?.common?.name) continue;
        const n = resolveName(obj.common.name as string | Record<string, string>, '');
        if (n) parentNames.set(id, n);
    }

    // Build memberId → { rooms, funcs } map.
    // IMPORTANT: index by each member ID so we can do parent-path traversal below.
    // This mirrors useDatapointList which checks the state ID AND all parent paths,
    // because ioBroker adapters often assign rooms/functions to channels or devices,
    // not to individual state objects.
    const enumMap = new Map<string, { rooms: string[]; funcs: string[] }>();
    for (const { value: obj } of enumRows) {
        if (!obj?.common?.members?.length) continue;
        const isRoom = obj._id.startsWith('enum.rooms.');
        const isFunc = obj._id.startsWith('enum.functions.');
        if (!isRoom && !isFunc) continue;
        const label = resolveName(obj.common.name, obj._id.split('.').pop() ?? obj._id);
        for (const memberId of obj.common.members as string[]) {
            if (!enumMap.has(memberId)) enumMap.set(memberId, { rooms: [], funcs: [] });
            const e = enumMap.get(memberId)!;
            if (isRoom) e.rooms.push(label);
            else e.funcs.push(label);
        }
    }

    // Custom categories (enum.floors & co.) get their own index: they are matched by
    // enum id, and their members are usually rooms rather than states, so membership
    // has to be resolved through the nested enums (see utils/enumFilter).
    const enumFilter = splitEnumFilter(opts.filterEnums);
    const customEnumIndex = enumFilter.length ? buildEnumMemberIndex(enumRows.map((r) => r.value)) : null;

    // Role filter: exact match (same as DatapointPicker) with OR semantics for multiple values.
    const roleFilter = splitList(opts.filterRoles);
    const idPatterns = splitList(opts.filterIdPattern);
    const roomFilter = splitList(opts.filterRooms);
    const funcFilter = splitList(opts.filterFuncs);
    const typeFilter = splitList(opts.filterTypes);
    const adapterFilter = splitList(opts.filterAdapters);
    const excludePats = splitList(opts.excludeIdPatterns);
    const excludeIdsSet = new Set<string>(opts.excludeIds ?? []);

    return stateRows
        .filter(({ id, value: obj }) => {
            // Malformed rows (missing common) exist in some user DBs - drop them so
            // the mapper below can dereference common safely.
            if (!obj?.common) return false;
            const role = obj.common.role ?? '';
            if (roleFilter.length > 0 && !roleFilter.includes(role)) return false;
            if (idPatterns.length > 0 && !idPatterns.some((p) => matchesIdPattern(id, p))) return false;
            if (adapterFilter.length > 0) {
                const prefix = id.split('.').slice(0, 2).join('.');
                if (!adapterFilter.includes(prefix)) return false;
            }
            const type = (obj.common.type as string | undefined) ?? '';
            if (typeFilter.length > 0 && !typeFilter.includes(type)) return false;
            if (excludeIdsSet.has(id)) return false;
            if (excludePats.some((p) => matchesIdPattern(id, p))) return false;

            // Traverse the state ID and all parent paths to find room/func memberships.
            // e.g. for "hm-rpc.0.ABC.1.STATE" check:
            //   hm-rpc.0.ABC.1.STATE → hm-rpc.0.ABC.1 → hm-rpc.0.ABC → hm-rpc.0
            if (roomFilter.length > 0 || funcFilter.length > 0) {
                const parts = id.split('.');
                const roomsSet = new Set<string>();
                const funcsSet = new Set<string>();
                for (let i = parts.length; i >= 2; i--) {
                    const e = enumMap.get(parts.slice(0, i).join('.'));
                    if (e) {
                        e.rooms.forEach((r) => roomsSet.add(r));
                        e.funcs.forEach((f) => funcsSet.add(f));
                    }
                }
                if (roomFilter.length > 0 && !roomFilter.some((r) => roomsSet.has(r))) return false;
                if (funcFilter.length > 0 && !funcFilter.some((f) => funcsSet.has(f))) return false;
            }
            if (customEnumIndex && !matchesEnumFilter(enumFilter, enumIdsForObject(id, customEnumIndex))) return false;
            return true;
        })
        .map(({ id, value: obj }) => {
            const common = obj.common!;
            // Build rooms array via parent-path traversal (same logic as filter above)
            const parts = id.split('.');
            const roomsSet = new Set<string>();
            for (let i = parts.length; i >= 2; i--) {
                const e = enumMap.get(parts.slice(0, i).join('.'));
                if (e) e.rooms.forEach((r) => roomsSet.add(r));
            }
            const role = common.role as string | undefined;
            const type = common.type as string | undefined;
            const stateName = resolveName(common.name as string | Record<string, string>, '');
            let parentName = '';
            for (let i = parts.length - 1; i >= 2; i--) {
                const pName = parentNames.get(parts.slice(0, i).join('.'));
                if (pName) {
                    parentName = pName;
                    break;
                }
            }
            let name: string;
            if (parentName && stateName && parentName !== stateName) {
                name = `${parentName} › ${stateName}`;
            } else if (stateName) {
                name = stateName;
            } else if (parentName) {
                name = `${parentName} › ${parts[parts.length - 1]}`;
            } else {
                name = parts[parts.length - 1] ?? id;
            }
            return {
                id,
                name,
                role,
                type,
                unit: (common.unit as string | undefined) || undefined,
                write: common.write !== false ? undefined : false,
                rooms: [...roomsSet],
                isRelevant: isRelevantDp(role, type),
            };
        });
}
