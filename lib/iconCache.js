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
/** How long the set catalogue and a set's name list are reused (#716). */
const CATALOGUE_TTL_MS = 24 * 60 * 60 * 1000;
/** A set's name list changes with an Iconify release at most — a week on disk. */
const COLLECTION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Full icon id as the status route takes it: `lucide:zap-off`. */
const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*:[a-z0-9]+(-[a-z0-9]+)*$/;
/** Ids per status request — the admin asks in chunks of 100, well under Node's header cap. */
const MAX_STATUS_IDS = 200;
/** `info.iconCache` lists the names too, but not past this size — the picker's
 *  browsing can leave thousands of icons behind; counts always stay. */
const SUMMARY_MAX_CHARS = 200_000;
/** Several requests of one page load merge one after the other; report once. */
const CHANGE_DEBOUNCE_MS = 300;

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
 * @param {(summary: object) => void} [opts.onChange] called with `summary()` after the cache grew (#290)
 */
function createIconCache({ dir, log, upstream = true, onChange }) {
    const cacheDir = path.join(dir, 'icons');
    /** prefix → icon set, lazily read from disk. */
    const sets = new Map();
    /** Newest change to the cache — from disk on start, then every merge. */
    let changedAt = 0;
    let changeTimer = null;
    /** prefix → Map(name → timestamp) of names the upstream API does not know. */
    const missing = new Map();
    /** request key → Promise, so parallel clients trigger one upstream call. */
    const inFlight = new Map();
    /** prefix → Promise chain, so two merges never write the same file at once. */
    const writing = new Map();
    /** "query|limit" → { at, body } for the picker's free-text search. */
    const searchCache = new Map();
    /** `{ at, body }` of the Iconify set catalogue — memory first, disk as fallback. */
    let collections = null;
    /** prefix → { at, body } of one set's name list (browsing a set in the picker). */
    const collectionCache = new Map();

    const warn = (msg) => log && log.warn && log.warn(`aura: icon cache — ${msg}`);
    const info = (msg) => log && log.info && log.info(`aura: icon cache — ${msg}`);

    function loadSet(prefix) {
        let set = sets.get(prefix);
        if (set) return set;
        set = emptySet(prefix);
        try {
            const file = path.join(cacheDir, `${prefix}.json`);
            const raw = fs.readFileSync(file, 'utf8');
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                set.icons = parsed.icons && typeof parsed.icons === 'object' ? parsed.icons : {};
                set.aliases = parsed.aliases && typeof parsed.aliases === 'object' ? parsed.aliases : {};
                for (const prop of SET_PROPS) if (parsed[prop] !== undefined) set[prop] = parsed[prop];
            }
            try {
                changedAt = Math.max(changedAt, fs.statSync(file).mtimeMs || 0);
            } catch {
                /* mtime is a nicety */
            }
        } catch {
            /* no cache for this prefix yet — start empty */
        }
        sets.set(prefix, set);
        return set;
    }

    /** Read every prefix that has a cache file, so a summary sees all of them. */
    function loadAll() {
        let files = [];
        try {
            files = fs.readdirSync(cacheDir);
        } catch {
            return;
        }
        for (const f of files) {
            const m = /^([a-z0-9]+(?:-[a-z0-9]+)*)\.json$/.exec(f);
            if (m) {
                loadSet(m[1]);
            }
        }
    }

    /**
     * What the adapter holds, for `info.iconCache` and the admin (#290): per
     * prefix the count and — while it fits — the names, plus when it last grew.
     */
    function summary() {
        loadAll();
        const prefixes = {};
        let total = 0;
        for (const prefix of [...sets.keys()].sort()) {
            const names = Object.keys(sets.get(prefix).icons).sort();
            if (!names.length) continue;
            prefixes[prefix] = { count: names.length, names };
            total += names.length;
        }
        const out = { total, prefixes, updatedAt: changedAt ? new Date(changedAt).toISOString() : null };
        if (JSON.stringify(out).length > SUMMARY_MAX_CHARS) {
            for (const p of Object.values(prefixes)) {
                delete p.names;
            }
            out.namesOmitted = true;
        }
        return out;
    }

    /** Log what arrived and hand the new summary to the adapter, once per burst. */
    function noteGrowth(prefix, added) {
        changedAt = Date.now();
        const total = [...sets.values()].reduce((n, s) => n + Object.keys(s.icons).length, 0);
        const shown = added.slice(0, 8).join(', ') + (added.length > 8 ? ', …' : '');
        info(`+${added.length} ${prefix} (${shown}) — ${total} total`);
        if (!onChange) return;
        if (changeTimer) clearTimeout(changeTimer);
        changeTimer = setTimeout(() => {
            changeTimer = null;
            try {
                onChange(summary());
            } catch (e) {
                warn(`summary listener failed — ${e.message}`);
            }
        }, CHANGE_DEBOUNCE_MS);
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
        // The picker's source filter (#716) narrows the search to one or a few sets.
        const prefixes = (parsedUrl.searchParams.get('prefixes') || '')
            .split(',')
            .filter((p) => NAME_RE.test(p))
            .slice(0, 32)
            .join(',');
        const sendJson = (status, body) => {
            res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' });
            res.end(JSON.stringify(body));
        };
        if (query.length < 2) return sendJson(400, { error: 'query too short' });

        const key = `${query}|${limit}|${prefixes}`;
        const hit = searchCache.get(key);
        if (hit && Date.now() - hit.at < SEARCH_TTL_MS) return sendJson(200, hit.body);
        if (!upstream) return sendJson(200, { icons: [], total: 0 });

        const scope = prefixes ? `&prefixes=${encodeURIComponent(prefixes)}` : '';
        fetch(`${UPSTREAM}/search?query=${encodeURIComponent(query)}&limit=${limit}${scope}`, {
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
     * The catalogue behind the picker's source filter (#716), relayed like the
     * search: `/icons/collections` names every Iconify set (title, licence,
     * size), `/icons/collection?prefix=mdi` lists the names of one set with its
     * categories, so a set can be browsed without typing a query. The catalogue
     * is also written to disk — it changes rarely, and an adapter that lost its
     * internet still knows which sets exist; a set's name list stays in memory.
     */
    function sendCatalogue(res, status, body) {
        res.writeHead(status, {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': status === 200 ? 'public, max-age=3600' : 'no-cache',
        });
        res.end(JSON.stringify(body));
    }

    function fetchCatalogue(url) {
        return fetch(url, {
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
            headers: { Accept: 'application/json' },
        }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))));
    }

    function handleCollections(res) {
        const file = path.join(cacheDir, '_collections.json');
        if (!collections) {
            try {
                collections = JSON.parse(fs.readFileSync(file, 'utf8'));
            } catch {
                /* not fetched yet */
            }
        }
        const fresh = collections && Date.now() - (collections.at || 0) < CATALOGUE_TTL_MS;
        // An empty catalogue is a 503, so the picker leaves the Iconify group out
        // instead of listing sets it cannot open.
        const fallback = () =>
            collections
                ? sendCatalogue(res, 200, collections.body)
                : sendCatalogue(res, 503, { error: 'icon catalogue unavailable' });
        if (fresh) return sendCatalogue(res, 200, collections.body);
        if (!upstream) return fallback();
        fetchCatalogue(`${UPSTREAM}/collections`)
            .then((body) => {
                collections = { at: Date.now(), body };
                fs.promises
                    .mkdir(cacheDir, { recursive: true })
                    .then(() => fs.promises.writeFile(file, JSON.stringify(collections)))
                    .catch((e) => warn(`could not write _collections.json — ${e.message}`));
                sendCatalogue(res, 200, body);
            })
            .catch((e) => {
                warn(`collections unavailable — ${e.message}`);
                fallback();
            });
    }

    /**
     * A set's name list is kept on disk as well: the public API rate-limits
     * (HTTP 429) a house that opens a few sets in a row, and a list that failed
     * must not come back as an empty set — the picker then showed nothing and
     * gave no reason. A miss with nothing stored is a 503, not an empty list.
     */
    function handleCollection(res, parsedUrl) {
        const prefix = parsedUrl.searchParams.get('prefix') || '';
        if (!NAME_RE.test(prefix)) return sendCatalogue(res, 400, { error: 'bad prefix' });
        const file = path.join(cacheDir, `_collection-${prefix}.json`);
        let hit = collectionCache.get(prefix);
        if (!hit) {
            try {
                hit = JSON.parse(fs.readFileSync(file, 'utf8'));
                if (hit && hit.body) collectionCache.set(prefix, hit);
                else hit = undefined;
            } catch {
                /* never fetched */
            }
        }
        const unavailable = () =>
            hit
                ? sendCatalogue(res, 200, hit.body)
                : sendCatalogue(res, 503, { error: 'icon set unavailable', prefix });
        if (hit && Date.now() - hit.at < COLLECTION_TTL_MS) return sendCatalogue(res, 200, hit.body);
        if (!upstream) return unavailable();
        fetchCatalogue(`${UPSTREAM}/collection?prefix=${encodeURIComponent(prefix)}`)
            .then((body) => {
                const entry = { at: Date.now(), body };
                collectionCache.set(prefix, entry);
                if (collectionCache.size > 30) collectionCache.delete(collectionCache.keys().next().value);
                fs.promises
                    .mkdir(cacheDir, { recursive: true })
                    .then(() => fs.promises.writeFile(file, JSON.stringify(entry)))
                    .catch((e) => warn(`could not write _collection-${prefix}.json — ${e.message}`));
                sendCatalogue(res, 200, body);
            })
            .catch((e) => {
                warn(`collection ${prefix} unavailable — ${e.message}`);
                unavailable();
            });
    }

    /**
     * `/icons/status` — what the adapter holds, without ever asking upstream (#290).
     * Without ids: the summary. With `?icons=lucide:home,mdi:garage`: which of
     * them the disk cache can answer right now and which it cannot. The admin
     * shows this next to the layout's inventory; the difference to a normal
     * icon request is that a miss here stays a miss instead of triggering a fetch.
     */
    function handleStatus(res, parsedUrl) {
        const sendJson = (status, body) => {
            res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' });
            res.end(JSON.stringify(body));
        };
        // `?all=1` — every id the disk cache answers, aliases included, uncapped:
        // the picker's "offline only" filter (#716) needs the names that
        // `summary()` drops once the cache grows large.
        if (parsedUrl.searchParams.get('all') === '1') {
            loadAll();
            const ids = [];
            for (const [prefix, set] of sets) {
                for (const name of Object.keys(set.icons)) ids.push(`${prefix}:${name}`);
                for (const name of Object.keys(set.aliases)) {
                    if (!collect(set, [name]).notFound.length) ids.push(`${prefix}:${name}`);
                }
            }
            return sendJson(200, { ids });
        }
        const raw = (parsedUrl.searchParams.get('icons') || '').trim();
        if (!raw) {
            return sendJson(200, summary());
        }
        const ids = [...new Set(raw.split(',').filter(Boolean))];
        if (ids.length > MAX_STATUS_IDS || !ids.every((id) => ID_RE.test(id))) {
            return sendJson(400, { error: 'bad icon request' });
        }
        const cached = [];
        const missing = [];
        for (const id of ids) {
            const colon = id.indexOf(':');
            const found = collect(loadSet(id.slice(0, colon)), [id.slice(colon + 1)]);
            (found.notFound.length ? missing : cached).push(id);
        }
        sendJson(200, { cached, missing });
    }

    /**
     * Answer `/icons/<prefix>.json?icons=…`, `/icons/search?query=…` and `/icons/status`.
     * @returns {boolean} true when the request belonged to this handler
     */
    function handle(req, res, parsedUrl) {
        const isSearch = parsedUrl.pathname === '/icons/search';
        const isStatus = parsedUrl.pathname === '/icons/status';
        const isCollections = parsedUrl.pathname === '/icons/collections';
        const isCollection = parsedUrl.pathname === '/icons/collection';
        const match = /^\/icons\/([^/]+)\.json$/.exec(parsedUrl.pathname);
        if (!match && !isSearch && !isStatus && !isCollections && !isCollection) return false;
        if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
            res.writeHead(405, { Allow: 'GET' });
            res.end();
            return true;
        }
        if (isSearch) {
            handleSearch(res, parsedUrl);
            return true;
        }
        if (isStatus) {
            handleStatus(res, parsedUrl);
            return true;
        }
        if (isCollections) {
            handleCollections(res);
            return true;
        }
        if (isCollection) {
            handleCollection(res, parsedUrl);
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
                // Found icons never change under their name. A partial answer has
                // to expire — the gap may fill once the host is back online — but
                // `no-cache` made every remount of a widget re-ask for the same
                // missing name, which is traffic for nothing on a dashboard whose
                // adapter has no internet. A minute is short enough to recover.
                'Cache-Control': complete ? 'public, max-age=604800' : 'public, max-age=60',
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
                const had = new Set(Object.keys(set.icons));
                if (mergeSet(set, data)) {
                    persist(prefix, set);
                    const added = Object.keys(set.icons).filter((n) => !had.has(n));
                    if (added.length) {
                        noteGrowth(prefix, added);
                    }
                }
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

    return { handle, summary };
}

module.exports = { createIconCache };
