/**
 * Functions the admin hands to the value conversion from Custom JS (issue #794).
 *
 * `aura.registerFn('geraeteStatus', (dp) => …)` in Custom JS, `callback("geraeteStatus", dp)`
 * in a list's expression. Only what is registered here is callable — never an arbitrary
 * `window` global, which would put `fetch`/`eval` within reach of the expression.
 *
 * Calls are synchronous: a function that returns a Promise yields `null`, as does one
 * that throws or is not registered (yet — Custom JS loads asynchronously, so the lists
 * re-render on every registration via `subscribeFns`).
 */

type Fn = (...args: unknown[]) => unknown;

const NAME_RE = /^[A-Za-z_$][\w$]*$/;

const fns = new Map<string, Fn>();
const listeners = new Set<() => void>();
const warned = new Set<string>();
let version = 0;

function bump(): void {
    version++;
    for (const l of listeners) l();
}

function warnOnce(key: string, msg: string, err?: unknown): void {
    if (warned.has(key)) return;
    warned.add(key);
    if (err === undefined) console.warn(msg);
    else console.warn(msg, err);
}

export function registerFn(name: unknown, fn: unknown): void {
    if (typeof name !== 'string' || !NAME_RE.test(name)) {
        console.warn('[aura] registerFn: invalid name', name);
        return;
    }
    if (typeof fn !== 'function') {
        console.warn(`[aura] registerFn('${name}'): not a function`);
        return;
    }
    fns.set(name, fn as Fn);
    warned.delete(`err:${name}`);
    warned.delete(`async:${name}`);
    bump();
}

export function unregisterFn(name: unknown): void {
    if (typeof name === 'string' && fns.delete(name)) bump();
}

/** Drops every registration — Custom JS is about to run again (layout/section switch). */
export function clearFns(): void {
    if (!fns.size) return;
    fns.clear();
    warned.clear();
    bump();
}

export function callRegisteredFn(name: unknown, args: unknown[]): unknown {
    if (typeof name !== 'string') return null;
    const fn = fns.get(name);
    if (!fn) return null;
    let out: unknown;
    try {
        out = fn(...args);
    } catch (err) {
        warnOnce(`err:${name}`, `[aura] callback('${name}') threw:`, err);
        return null;
    }
    if (
        out !== null &&
        (typeof out === 'object' || typeof out === 'function') &&
        typeof (out as { then?: unknown }).then === 'function'
    ) {
        warnOnce(`async:${name}`, `[aura] callback('${name}') returned a Promise — async functions are not supported`);
        return null;
    }
    return out === undefined ? null : out;
}

export function subscribeFns(cb: () => void): () => void {
    listeners.add(cb);
    return () => {
        listeners.delete(cb);
    };
}

export function getFnsVersion(): number {
    return version;
}
