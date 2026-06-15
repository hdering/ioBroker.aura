/**
 * Datapoint references may carry an optional JSON path so a single ioBroker
 * state that holds an object/array can feed any widget with one nested value.
 *
 * Syntax:  <stateId>?<path>
 *   0_userdata.0.battery?soc
 *   myadapter.0.battery?devices.0.soc      (dot notation)
 *   myadapter.0.battery?devices[0].soc     (bracket notation, equivalent)
 *
 * The separator is `?` because isValidStateId() forbids it (along with
 * whitespace and & = :), so it can never collide with a real state ID. `#`
 * must NOT be used here: it is a legitimate character in some adapters
 * (e.g. Shelly: shelly.0.SHSW-25#XXXXXX#1.Relay0.Switch) — splitting on `#`
 * truncated such IDs and broke writes (state could no longer be set).
 * The path part is stripped before any socket call (subscribe/getState use
 * the bare base ID) and applied to the returned value.
 */

const PATH_SEP = '?';

export interface DpRef {
    /** Bare ioBroker state ID — safe to pass to subscribe/getState. */
    id: string;
    /** JSON path into the state value, or null when the ref is a plain ID. */
    path: string | null;
}

/** Split a datapoint reference into its base state ID and optional JSON path. */
export function splitDpRef(ref: string | undefined | null): DpRef {
    if (!ref) return { id: ref ?? '', path: null };
    const i = ref.indexOf(PATH_SEP);
    if (i === -1) return { id: ref, path: null };
    const path = ref.slice(i + 1).trim();
    return { id: ref.slice(0, i), path: path || null };
}

/** Bare state ID without any JSON path suffix. */
export function baseDpId(ref: string | undefined | null): string {
    return splitDpRef(ref).id;
}

/** Recombine a base ID and JSON path into a single reference string. */
export function joinDpRef(id: string, path: string | undefined | null): string {
    const p = (path ?? '').trim();
    return p ? `${id}${PATH_SEP}${p}` : id;
}

/**
 * Walk a JSON path into a state value. The value may be a real object/array or
 * a JSON string (ioBroker often stores objects as stringified JSON). Returns
 * null when the path cannot be resolved.
 */
export function extractJsonPath(val: unknown, path: string): unknown {
    let cur: unknown = val;

    if (typeof cur === 'string') {
        const s = cur.trim();
        if (s.startsWith('{') || s.startsWith('[')) {
            try {
                cur = JSON.parse(s);
            } catch {
                return null;
            }
        } else {
            // A scalar string has no addressable members.
            return null;
        }
    }

    // Normalise bracket indices (devices[0]) to dot segments (devices.0).
    const segments = path
        .replace(/\[(\d+)\]/g, '.$1')
        .split('.')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

    for (const seg of segments) {
        if (cur == null || typeof cur !== 'object') return null;
        cur = (cur as Record<string, unknown>)[seg];
    }

    return cur ?? null;
}

/**
 * Resolve the effective value for a datapoint reference: the raw state value
 * when there is no path, otherwise the nested value addressed by the path.
 */
export function resolveDpValue(rawVal: unknown, path: string | null): unknown {
    if (!path) return rawVal ?? null;
    return extractJsonPath(rawVal, path);
}
