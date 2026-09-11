'use strict';

/**
 * Same-origin Iconify API.
 *
 * The frontend renders every widget/tab/list icon through `@iconify/react`,
 * which by default fetches icon data from `api.iconify.design` (with
 * `api.simplesvg.com` / `api.unisvg.com` as rotating fallbacks). That works on
 * a desktop browser and fails on exactly the clients a wall dashboard runs on:
 * Samsung Internet and Opera block those hosts with their built-in tracker
 * blockers, kiosk WebViews (Fully Kiosk, Native Alpha) often have no route to
 * the public internet at all, and a blocked request is retried against all
 * three hosts every 750 ms — so the icons stay invisible AND the client keeps
 * talking to the network (#636).
 *
 * This module answers the same requests from Aura's own origin:
 *
 *     GET /icons/<prefix>.json?icons=<name>,<name>,…
 *
 * Icons are served from a per-prefix JSON file in the instance data dir. Names
 * that are not cached yet are fetched from the public API once, merged into the
 * cache and written back, so every later request — from any client in the house
 * — is answered locally and works offline.
 */

const fs = require('node:fs');
const path = require('node:path');

const UPSTREAM = 'https://api.iconify.design';
const FETCH_TIMEOUT_MS = 8000;
/** Iconify's own icon/prefix name rule — anything else is a bad request. */
const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** URL length cap on the client side is 500, so a request never carries more. */
const MAX_NAMES = 128;
/** Icon-set level defaults that apply to every icon in the set. */
const SET_PROPS = ['width', 'height', 'rotate', 'hFlip', 'vFlip'];
/** How long a name the upstream API does not know stays "missing" (1 h). */
const NOT_FOUND_TTL_MS = 60 * 60 * 1000;
/** Depth limit for alias → parent chains, guards against a cyclic cache file. */
const MAX_ALIAS_DEPTH = 8;
/** How long a search result stays usable without asking the catalogue again. */
const SEARCH_TTL_MS = 10 * 60 * 1000;

function emptySet(prefix) {
    return { prefix, icons: {}, aliases: {} };
}

/**
 * Pull the requested names — plus every alias parent they resolve through —
 * out of a cached icon set. Names the set does not hold land in `notFound`;
 * a half-resolved alias chain counts as not found and leaves nothing behind.
 */
function collect(set, names) {
    const icons = {};
    const aliases = {};
    const notFound = [];
    for (const name of names) {
        const chain = {};
        let cur = name;
        let resolved = null;
        for (let depth = 0; depth < MAX_ALIAS_DEPTH; depth++) {
            if (set.icons[cur]) {
                resolved = cur;
                break;
            }
            const alias = set.aliases[cur];
            if (!alias || typeof alias.parent !== 'string') break;
            chain[cur] = alias;
            cur = alias.parent;
        }
        if (resolved === null) {
            notFound.push(name);
            continue;
        }
        icons[resolved] = set.icons[resolved];
        Object.assign(aliases, chain);
    }
    return { icons, aliases, notFound };
}

/** Fold an upstream API response into the cached set for that prefix. */
function mergeSet(set, data) {
    if (!data || typeof data !== 'object') return false;
    let changed = false;
    for (const [name, icon] of Object.entries(data.icons || {})) {
        if (icon && typeof icon.body === 'string') {
            set.icons[name] = icon;
            changed = true;
        }
    }
    for (const [name, alias] of Object.entries(data.aliases || {})) {
        if (alias && typeof alias.parent === 'string') {
            set.aliases[name] = alias;
            changed = true;
        }
    }
    for (const prop of SET_PROPS) {
        if (data[prop] !== undefined && set[prop] !== data[prop]) {
            set[prop] = data[prop];
            changed = true;
        }
    }
    return changed;
}

/**
 * @param {object} opts
 * @param {string} opts.dir            directory the per-prefix cache files live in
 * @param {{warn: Function, debug: Function}} [opts.log]
 * @param {boolean} [opts.upstream=true] allow refilling the cache from the public API
 */
function createIconCache({ dir, log, upstream = true }) {
    const cacheDir = path.join(dir, 'icons');
    /** prefix → icon set, lazily read from disk. */
    const sets = new Map();
    /** prefix → Map(name → timestamp) of names the upstream API does not know. */
    const missing = new Map();
    /** request key → Promise, so parallel clients trigger one upstream call. */
    const inFlight = new Map();
    /** prefix → Promise chain, so two merges never write the same file at once. */
    const writing = new Map();
    /** "query|limit" → { at, body } for the picker's free-text search. */
    const searchCache = new Map();

    const warn = (msg) => log && log.warn && log.warn(`aura: icon cache — ${msg}`);

    function loadSet(prefix) {
        let set = sets.get(prefix);
        if (set) return set;
        set = emptySet(prefix);
        try {
            const raw = fs.readFileSync(path.join(cacheDir, `${prefix}.json`), 'utf8');
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                set.icons = parsed.icons && typeof parsed.icons === 'object' ? parsed.icons : {};
                set.aliases = parsed.aliases && typeof parsed.aliases === 'object' ? parsed.aliases : {};
                for (const prop of SET_PROPS) if (parsed[prop] !== undefined) set[prop] = parsed[prop];
            }
        } catch {
            /* no cache for this prefix yet — start empty */
        }
        sets.set(prefix, set);
        return set;
    }

    function persist(prefix, set) {
        const prev = writing.get(prefix) || Promise.resolve();
        const next = prev
            .then(() => fs.promises.mkdir(cacheDir, { recursive: true }))
            .then(() => {
                const file = path.join(cacheDir, `${prefix}.json`);
                const tmp = `${file}.tmp`;
                return fs.promises
                    .writeFile(tmp, JSON.stringify(set), 'utf8')
                    .then(() => fs.promises.rename(tmp, file));
            })
            .catch((e) => warn(`could not write ${prefix}.json — ${e.message}`));
        writing.set(prefix, next);
        return next;
    }

    function isMissing(prefix, name) {
        const seen = missing.get(prefix);
        if (!seen) return false;
        const at = seen.get(name);
        if (at === undefined) return false;
        if (Date.now() - at > NOT_FOUND_TTL_MS) {
            seen.delete(name);
            return false;
        }
        return true;
    }

    function rememberMissing(prefix, names) {
        let seen = missing.get(prefix);
        if (!seen) missing.set(prefix, (seen = new Map()));
        const now = Date.now();
        for (const name of names) seen.set(name, now);
    }

    async function fetchUpstream(prefix, names) {
        const key = `${prefix}|${names.join(',')}`;
        const pending = inFlight.get(key);
        if (pending) return pending;
        const url = `${UPSTREAM}/${prefix}.json?icons=${encodeURIComponent(names.join(','))}`;
        const task = (async () => {
            const res = await fetch(url, {
                signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
                headers: { Accept: 'application/json' },
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        })().finally(() => inFlight.delete(key));
        inFlight.set(key, task);
        return task;
    }

    /**
     * The icon picker's free-text search. Purely a relay — results depend on the
     * live Iconify catalogue, so they are only held in memory for a few minutes.
     * A query that cannot be answered returns an empty list rather than an error:
     * the picker's curated categories still work without it.
     */
    function handleSearch(res, parsedUrl) {
        const query = (parsedUrl.searchParams.get('query') || '').trim().slice(0, 64);
        const limit = Math.min(999, Math.max(1, Number(parsedUrl.searchParams.get('limit')) || 200));
        const sendJson = (status, body) => {
            res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' });
            res.end(JSON.stringify(body));
        };
        if (query.length < 2) return sendJson(400, { error: 'query too short' });

        const key = `${query}|${limit}`;
        const hit = searchCache.get(key);
        if (hit && Date.now() - hit.at < SEARCH_TTL_MS) return sendJson(200, hit.body);
        if (!upstream) return sendJson(200, { icons: [], total: 0 });

        fetch(`${UPSTREAM}/search?query=${encodeURIComponent(query)}&limit=${limit}`, {
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
            headers: { Accept: 'application/json' },
        })
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
            .then((body) => {
                searchCache.set(key, { at: Date.now(), body });
                if (searchCache.size > 200) searchCache.delete(searchCache.keys().next().value);
                sendJson(200, body);
            })
            .catch((e) => {
                warn(`search "${query}" unavailable — ${e.message}`);
                sendJson(200, { icons: [], total: 0 });
            });
    }

    /**
     * Answer `/icons/<prefix>.json?icons=…` and `/icons/search?query=…`.
     * @returns {boolean} true when the request belonged to this handler
     */
    function handle(req, res, parsedUrl) {
        const isSearch = parsedUrl.pathname === '/icons/search';
        const match = /^\/icons\/([^/]+)\.json$/.exec(parsedUrl.pathname);
        if (!match && !isSearch) return false;
        if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
            res.writeHead(405, { Allow: 'GET' });
            res.end();
            return true;
        }
        if (isSearch) {
            handleSearch(res, parsedUrl);
            return true;
        }

        const prefix = match[1];
        const raw = parsedUrl.searchParams.get('icons') || '';
        const names = [...new Set(raw.split(',').filter(Boolean))];
        if (
            !NAME_RE.test(prefix) ||
            !names.length ||
            names.length > MAX_NAMES ||
            !names.every((n) => NAME_RE.test(n))
        ) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: 'bad icon request' }));
            return true;
        }

        const send = (found) => {
            const body = {
                prefix,
                ...pickSetProps(set),
                icons: found.icons,
                aliases: found.aliases,
                not_found: found.notFound,
            };
            const complete = !body.not_found.length;
            res.writeHead(200, {
                'Content-Type': 'application/json; charset=utf-8',
                // Found icons never change under their name; a partial answer must
                // stay revalidatable so a later fetch can still fill the gap.
                'Cache-Control': complete ? 'public, max-age=604800' : 'no-cache',
            });
            res.end(JSON.stringify(body));
        };

        const set = loadSet(prefix);
        const local = collect(set, names);
        const wanted = local.notFound.filter((n) => !isMissing(prefix, n));

        if (!wanted.length || !upstream) {
            send(local);
            return true;
        }

        fetchUpstream(prefix, wanted)
            .then((data) => {
                if (mergeSet(set, data)) persist(prefix, set);
                const fresh = collect(set, names);
                if (fresh.notFound.length) rememberMissing(prefix, fresh.notFound);
                send(fresh);
            })
            .catch((e) => {
                // No data and no way to get it. A 5xx lets the client fall back to
                // the widget's bundled Lucide icon instead of waiting forever.
                warn(`${prefix}: ${wanted.join(',')} unavailable — ${e.message}`);
                if (Object.keys(local.icons).length) {
                    send(local);
                    return;
                }
                res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
                res.end(JSON.stringify({ error: 'icon source unavailable' }));
            });
        return true;
    }

    function pickSetProps(set) {
        const out = {};
        for (const prop of SET_PROPS) if (set[prop] !== undefined) out[prop] = set[prop];
        return out;
    }

    return { handle };
}

module.exports = { createIconCache };
