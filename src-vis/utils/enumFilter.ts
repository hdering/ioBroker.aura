/**
 * Custom enum categories for the datapoint search of the dynamic list (issue #568).
 *
 * ioBroker's `enum.*` tree is not limited to `enum.rooms` and `enum.functions` — an
 * admin can create any category, and a common one is `enum.floors` with one enum per
 * storey. The discovery filter only knew the two built-in trees, so those categories
 * were invisible even though they describe exactly the cut a dashboard wants.
 *
 * Two things make that awkward and are handled here:
 *
 *  - **Enums may contain enums.** A floor is usually filled with `enum.rooms.*`
 *    entries, not with states, so a plain member lookup finds nothing. Membership is
 *    therefore resolved transitively (and a child enum counts as part of its parent,
 *    mirroring how the admin tree reads).
 *  - **Labels are not unique.** "Bad" can exist under several categories, so the
 *    filter stores full enum IDs and only shows the name.
 *
 * Selection semantics match the room/function filters: OR inside one category, AND
 * across categories — "Obergeschoss OR Dachgeschoss" *and* "Heizung".
 */

/** The only shape this module needs from an ioBroker enum object. */
export interface EnumObjectLike {
    _id: string;
    common?: { name?: string | Record<string, string>; members?: string[] };
}

/** One selectable entry of the category filter. */
export interface EnumFilterOption {
    /** Full enum id, e.g. `enum.floors.og` — this is what gets stored. */
    id: string;
    /** Name of the enum itself, e.g. 'Obergeschoss'. */
    label: string;
    /** Category id, e.g. `enum.floors`. */
    category: string;
    /** Name of the category, e.g. 'Stockwerke'. Falls back to the id segment. */
    categoryLabel: string;
}

/** Membership index: object id → the enum ids it belongs to (transitively). */
export type EnumMemberIndex = Map<string, Set<string>>;

const BUILTIN_TREES = ['enum.rooms', 'enum.functions'];

function resolveName(name: string | Record<string, string> | undefined, fallback: string): string {
    if (!name) return fallback;
    if (typeof name === 'string') return name || fallback;
    return name.de ?? name.en ?? Object.values(name)[0] ?? fallback;
}

/**
 * Is this a user-defined category entry? Everything under `enum.` that is neither
 * a room nor a function, and at least one level below the category root — the root
 * itself (`enum.floors`) is the heading, not a choice.
 */
export function isCustomEnumId(id: string | undefined): boolean {
    if (!id || !id.startsWith('enum.')) return false;
    if (BUILTIN_TREES.some((t) => id === t || id.startsWith(`${t}.`))) return false;
    return id.split('.').length >= 3;
}

/** `enum.floors.og.left` → `enum.floors`. */
export function enumCategoryOf(id: string): string {
    return id.split('.').slice(0, 2).join('.');
}

/** Splits a stored `filterEnums` value into enum ids. */
export function splitEnumFilter(csv: string | undefined): string[] {
    return (csv ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
}

/**
 * object id → enum ids, resolved through nested enums.
 *
 * A member that is itself an enum contributes ITS members instead of its own id, and
 * every child enum counts towards its parent, so selecting a floor finds the states
 * of the rooms assigned to it.
 */
export function buildEnumMemberIndex(objects: (EnumObjectLike | undefined)[]): EnumMemberIndex {
    const members = new Map<string, string[]>();
    for (const obj of objects) {
        if (!obj?._id?.startsWith('enum.')) continue;
        members.set(obj._id, obj.common?.members ?? []);
    }
    // Child enums of each enum, precomputed — resolve() would otherwise rescan all
    // enum ids per node.
    const children = new Map<string, string[]>();
    for (const id of members.keys()) {
        const parent = id.split('.').slice(0, -1).join('.');
        if (!members.has(parent)) continue;
        const list = children.get(parent);
        if (list) list.push(id);
        else children.set(parent, [id]);
    }

    const cache = new Map<string, Set<string>>();
    const resolve = (enumId: string, stack: Set<string>): Set<string> => {
        const done = cache.get(enumId);
        if (done) return done;
        if (stack.has(enumId)) return new Set(); // guards a hand-edited member cycle
        stack.add(enumId);
        const out = new Set<string>();
        for (const m of [...(members.get(enumId) ?? []), ...(children.get(enumId) ?? [])]) {
            if (!m) continue;
            if (members.has(m)) for (const nested of resolve(m, stack)) out.add(nested);
            else out.add(m);
        }
        stack.delete(enumId);
        cache.set(enumId, out);
        return out;
    };

    const index: EnumMemberIndex = new Map();
    for (const enumId of members.keys()) {
        for (const member of resolve(enumId, new Set())) {
            const set = index.get(member);
            if (set) set.add(enumId);
            else index.set(member, new Set([enumId]));
        }
    }
    return index;
}

/**
 * Every enum the object belongs to, including via its parents — adapters assign
 * enums to the device or the channel far more often than to the single state.
 */
export function enumIdsForObject(objectId: string, index: EnumMemberIndex): Set<string> {
    const out = new Set<string>();
    const parts = objectId.split('.');
    for (let i = parts.length; i >= 2; i--) {
        const hit = index.get(parts.slice(0, i).join('.'));
        if (hit) for (const e of hit) out.add(e);
    }
    return out;
}

/** OR inside one category, AND across categories. No selection matches everything. */
export function matchesEnumFilter(selected: string[], memberships: Set<string>): boolean {
    if (!selected.length) return true;
    const byCategory = new Map<string, string[]>();
    for (const id of selected) {
        const cat = enumCategoryOf(id);
        const list = byCategory.get(cat);
        if (list) list.push(id);
        else byCategory.set(cat, [id]);
    }
    for (const ids of byCategory.values()) {
        if (!ids.some((id) => memberships.has(id))) return false;
    }
    return true;
}

/**
 * The entries of the category dropdown, grouped by category and sorted by name.
 * Categories whose enums hold nothing (empty containers) are left out — they would
 * only ever return an empty search.
 */
export function collectEnumFilterOptions(objects: (EnumObjectLike | undefined)[]): EnumFilterOption[] {
    const names = new Map<string, string>();
    for (const obj of objects) {
        if (!obj?._id?.startsWith('enum.')) continue;
        names.set(obj._id, resolveName(obj.common?.name, obj._id.split('.').pop() ?? obj._id));
    }
    const index = buildEnumMemberIndex(objects);
    const nonEmpty = new Set<string>();
    for (const enumIds of index.values()) for (const id of enumIds) nonEmpty.add(id);

    const out: EnumFilterOption[] = [];
    for (const [id, label] of names) {
        if (!isCustomEnumId(id) || !nonEmpty.has(id)) continue;
        const category = enumCategoryOf(id);
        // Nested entries keep their path so 'Links' under two floors stays tellable
        // apart: 'Obergeschoss › Links'.
        const path = id
            .split('.')
            .slice(2)
            .map((_, i, arr) => names.get([category, ...arr.slice(0, i + 1)].join('.')) ?? arr[i])
            .join(' › ');
        out.push({
            id,
            label: path || label,
            category,
            categoryLabel: names.get(category) ?? category.split('.').pop() ?? category,
        });
    }
    return out.sort(
        (a, b) =>
            a.categoryLabel.localeCompare(b.categoryLabel, undefined, { sensitivity: 'base' }) ||
            a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' }),
    );
}
