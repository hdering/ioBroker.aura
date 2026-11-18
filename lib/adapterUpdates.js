'use strict';

/**
 * Version comparison and the "which adapters have an update" verdict.
 *
 * The adapter-status widget used to read `admin.X.info.updatesJson`. Admin only
 * rewrites that state on its own repository refresh, so switching the active
 * repository (Beta → Stable) left the widget showing the Beta offers until the
 * next scheduled check — while the admin UI itself compared live against the
 * active repository (issue #962). This module does what the admin UI does:
 * installed version against the highest offer of the active repositories.
 */

/**
 * Split a version into comparable parts. Returns null for anything that is not
 * `x.y.z` with an optional `-prerelease` tail (build metadata is ignored).
 *
 * @param {unknown} raw
 * @returns {{ core: number[], pre: string[] | null } | null}
 */
function parseVersion(raw) {
    const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(String(raw ?? '').trim());
    if (!m) {
        return null;
    }
    return {
        core: [Number(m[1]), Number(m[2]), Number(m[3])],
        pre: m[4] ? m[4].split('.') : null,
    };
}

/**
 * Semver ordering, so a beta install is never told to "update" to the older
 * stable it came from. Returns -1 / 0 / 1, or null when either side is unparsable.
 *
 * @param {unknown} a
 * @param {unknown} b
 * @returns {-1 | 0 | 1 | null}
 */
function compareVersions(a, b) {
    const va = parseVersion(a);
    const vb = parseVersion(b);
    if (!va || !vb) {
        return null;
    }
    for (let i = 0; i < 3; i++) {
        if (va.core[i] !== vb.core[i]) {
            return va.core[i] < vb.core[i] ? -1 : 1;
        }
    }
    // 1.0.0-beta.1 < 1.0.0 — a release without a prerelease tail always wins.
    if (va.pre && !vb.pre) {
        return -1;
    }
    if (!va.pre && vb.pre) {
        return 1;
    }
    if (!va.pre || !vb.pre) {
        return 0;
    }
    for (let i = 0; i < Math.max(va.pre.length, vb.pre.length); i++) {
        const x = va.pre[i];
        const y = vb.pre[i];
        if (x === undefined) {
            return -1;
        }
        if (y === undefined) {
            return 1;
        }
        const nx = /^\d+$/.test(x) ? Number(x) : null;
        const ny = /^\d+$/.test(y) ? Number(y) : null;
        if (nx !== null && ny !== null) {
            if (nx !== ny) {
                return nx < ny ? -1 : 1;
            }
        } else if (x !== y) {
            return x < y ? -1 : 1;
        }
    }
    return 0;
}

/**
 * Names of the activated repositories that actually hold data. js-controller 5
 * allows several at once (`activeRepo` is then an array). When none of them was
 * ever fetched, every known repository is used — same fallback as the own update
 * check had before.
 *
 * @param {unknown} activeRepo system.config.common.activeRepo
 * @param {Record<string, any>} repos system.repositories.native.repositories
 * @param {{ strict?: boolean }} [opts] strict: no fallback to unlisted repositories
 * @returns {string[]}
 */
function usableRepoNames(activeRepo, repos, opts = {}) {
    const names = (typeof activeRepo === 'string' ? [activeRepo] : Array.isArray(activeRepo) ? activeRepo : []).map(
        String,
    );
    const usable = names.filter((n) => repos?.[n]?.json && typeof repos[n].json === 'object');
    if (usable.length || opts.strict) {
        return usable;
    }
    return Object.keys(repos || {}).filter((n) => repos[n]?.json && typeof repos[n].json === 'object');
}

/**
 * Highest version of one adapter across the given repositories.
 *
 * @param {Record<string, any>} repos
 * @param {string[]} names
 * @param {string} adapter
 * @returns {{ version: string, repo: string } | null}
 */
function bestRepoVersion(repos, names, adapter) {
    let best = null;
    for (const name of names) {
        const version = repos?.[name]?.json?.[adapter]?.version;
        if (!parseVersion(version)) {
            continue;
        }
        if (!best || compareVersions(best.version, version) === -1) {
            best = { version: String(version).trim(), repo: name };
        }
    }
    return best;
}

/**
 * `common.ignoreVersion` of an adapter object: the admin's "ignore this update".
 * A plain version hides exactly that offer; a `<=x` / `<x` range everything up to it.
 *
 * @param {unknown} ignore
 * @param {string} offered
 */
function isIgnored(ignore, offered) {
    const raw = typeof ignore === 'string' ? ignore.trim() : '';
    if (!raw) {
        return false;
    }
    const m = /^(<=|<|=)?\s*(.+)$/.exec(raw);
    if (!m) {
        return false;
    }
    const cmp = compareVersions(offered, m[2]);
    if (cmp === null) {
        return false;
    }
    if (m[1] === '<=') {
        return cmp <= 0;
    }
    if (m[1] === '<') {
        return cmp < 0;
    }
    return cmp === 0;
}

/**
 * Adapters with a strictly newer version in the active repositories.
 *
 * @param {{
 *   activeRepo: unknown,
 *   repos: Record<string, any>,
 *   adapters: Array<{ name: string, version?: string, ignoreVersion?: string }>,
 * }} input
 * @returns {{ repos: string[], updates: Record<string, { availableVersion: string, installedVersion: string, repo: string }> } | null}
 *   null when no active repository holds data — the caller then knows nothing
 *   and should keep whatever source it had.
 */
function computeAdapterUpdates({ activeRepo, repos, adapters }) {
    const names = usableRepoNames(activeRepo, repos, { strict: true });
    if (!names.length) {
        return null;
    }
    const updates =
        /** @type {Record<string, { availableVersion: string, installedVersion: string, repo: string }>} */ ({});
    for (const a of adapters || []) {
        if (!a || !a.name || !parseVersion(a.version)) {
            continue;
        }
        const best = bestRepoVersion(repos, names, a.name);
        if (!best) {
            continue;
        }
        if (compareVersions(a.version, best.version) !== -1) {
            continue;
        }
        if (isIgnored(a.ignoreVersion, best.version)) {
            continue;
        }
        updates[a.name] = { availableVersion: best.version, installedVersion: String(a.version), repo: best.repo };
    }
    return { repos: names, updates };
}

module.exports = {
    parseVersion,
    compareVersions,
    usableRepoNames,
    bestRepoVersion,
    isIgnored,
    computeAdapterUpdates,
};
