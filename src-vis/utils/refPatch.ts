/**
 * Minimal structural diff/patch for history snapshots.
 *
 * Snapshots of one store share every unchanged subtree by reference, so a diff
 * that stops at the first identical reference is both cheap and exact: it emits
 * one `set` per replaced subtree and one `delete` per removed key. Arrays of a
 * different length are replaced whole (a tab's widget list after an add/remove),
 * arrays of the same length are compared per index (a moved widget).
 *
 * `applyPatch` is copy-on-write along each path, so the rebuilt snapshots share
 * their unchanged subtrees again after a reload.
 */
export interface PatchOp {
    /** Path from the snapshot root; numbers index arrays. */
    p: (string | number)[];
    /** New value at the path. Absent together with `d` → delete. */
    v?: unknown;
    /** Delete the key at the path. */
    d?: true;
}

const isPlainObject = (x: unknown): x is Record<string, unknown> =>
    x !== null && typeof x === 'object' && !Array.isArray(x);

export function diffSnapshots(
    before: unknown,
    after: unknown,
    path: (string | number)[] = [],
    out: PatchOp[] = [],
): PatchOp[] {
    if (before === after) return out;
    if (isPlainObject(before) && isPlainObject(after)) {
        for (const k of Object.keys(before)) {
            if (!(k in after) || after[k] === undefined) out.push({ p: [...path, k], d: true });
        }
        for (const k of Object.keys(after)) {
            if (after[k] === undefined) continue;
            if (!(k in before)) out.push({ p: [...path, k], v: after[k] });
            else diffSnapshots(before[k], after[k], [...path, k], out);
        }
        return out;
    }
    if (Array.isArray(before) && Array.isArray(after) && before.length === after.length) {
        for (let i = 0; i < after.length; i++) diffSnapshots(before[i], after[i], [...path, i], out);
        return out;
    }
    out.push({ p: path, v: after });
    return out;
}

function setAt(node: unknown, path: (string | number)[], i: number, op: PatchOp): unknown {
    if (i === path.length) return op.v;
    const key = path[i];
    const last = i === path.length - 1;
    if (Array.isArray(node)) {
        const copy = node.slice();
        if (last && op.d) copy.splice(key as number, 1);
        else copy[key as number] = setAt(node[key as number], path, i + 1, op);
        return copy;
    }
    const obj = isPlainObject(node) ? node : {};
    if (last && op.d) {
        const rest = { ...obj };
        delete rest[key as string];
        return rest;
    }
    return { ...obj, [key as string]: setAt(obj[key as string], path, i + 1, op) };
}

export function applyPatch(base: unknown, ops: PatchOp[]): unknown {
    let root = base;
    for (const op of ops) root = op.p.length === 0 ? op.v : setAt(root, op.p, 0, op);
    return root;
}
