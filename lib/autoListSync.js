'use strict';

/**
 * The periodic sync of the dynamic list (autolist), run in the adapter (#893).
 *
 * The filters of an autolist (role, room, id pattern …) are searched again every
 * `syncIntervalMin` minutes; new hits are added to `options.entries`, and with
 * `syncRemove` the vanished ones without own settings are taken out. This used to be
 * a setInterval in the widget: a list nobody looked at went stale, and every open
 * browser wrote the dashboard on its own. Here it runs once, with no browser open,
 * and the result is written once into the stored config.
 *
 *     sendTo('aura.0', 'autolistSync', { widgetId, now })
 *       → { ok: true, managed, changed?, added?, removed? }
 *
 * `managed` false = the adapter does not hold this widget (not saved yet, inside a
 * PIN-protected view, no filter) — the widget keeps syncing on its own then. With
 * `now` the widget is synced at once (the widget's "sync now" button, an empty list).
 *
 * Search and merge are the widget's own code (src-vis/utils/autoListDiscovery.ts,
 * autoListSync.ts via lib/shared/auraShared.js). One run reads the object DB once for
 * all lists due in it, and keeps nothing in memory afterwards.
 */

const shared = require('./shared/auraShared');

const END = '香';
const DEFAULT_INTERVAL_MIN = 5;
/** The config states an autolist can live in, by the key passed to read/write. */
const CONFIG_KEYS = ['dashboard', 'groupDefs', 'popupConfig'];

function parseJson(raw) {
    if (typeof raw !== 'string' || raw.length < 2) {
        return null;
    }
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

/** Every autolist node in a parsed config value. */
function autolistNodes(node, visit, depth = 0) {
    if (!node || typeof node !== 'object' || depth > 40) {
        return;
    }
    if (Array.isArray(node)) {
        for (const x of node) {
            autolistNodes(x, visit, depth + 1);
        }
        return;
    }
    if (node.type === 'autolist' && typeof node.id === 'string' && node.id) {
        visit(node);
    }
    for (const v of Object.values(node)) {
        if (v && typeof v === 'object') {
            autolistNodes(v, visit, depth + 1);
        }
    }
}

/** Minutes between two syncs of a widget; garbage and values below 1 fall back. */
function intervalMs(options) {
    const n = Number(options && options.syncIntervalMin);
    return (Number.isFinite(n) && n >= 1 ? n : DEFAULT_INTERVAL_MIN) * 60 * 1000;
}

/** A widget the adapter syncs: it has a filter to search with. */
function syncable(node) {
    return !!(node.options && typeof node.options === 'object' && shared.hasDiscoveryFilter(node.options));
}

/**
 * @param {{
 *   getObjectView: (type: string, startkey: string, endkey: string) => Promise<{ rows?: any[] } | null | undefined>,
 *   readConfig: () => Promise<Record<string, unknown>>,
 *   writeConfig: (key: string, raw: string) => Promise<void>,
 *   log?: { info: (m: string) => void, warn: (m: string) => void },
 *   now?: () => number,
 * }} deps
 */
function createAutoListSync({ getObjectView, readConfig, writeConfig, log, now = Date.now }) {
    /** @type {Map<string, number>} widget id → when it was last synced */
    const lastRun = new Map();
    let chain = Promise.resolve();

    const serial = (fn) => {
        const run = chain.then(fn);
        chain = run.catch(() => {});
        return run;
    };

    const view = async (type, startkey = '', endkey = END) => {
        const res = await getObjectView(type, startkey, endkey);
        return (res && res.rows) || [];
    };

    async function rows() {
        const [states, aliasStates, channels, aliasChannels, devices, aliasDevices, enums] = await Promise.all([
            view('state'),
            view('state', 'alias.', `alias.${END}`),
            view('channel'),
            view('channel', 'alias.', `alias.${END}`),
            view('device'),
            view('device', 'alias.', `alias.${END}`),
            view('enum', 'enum.', `enum.${END}`),
        ]);
        return { states, aliasStates, channels, aliasChannels, devices, aliasDevices, enums };
    }

    /** The parsed config states and the syncable autolists in them, by id. */
    async function scan() {
        const raw = await readConfig();
        /** @type {Record<string, any>} */
        const parsed = {};
        /** @type {Map<string, any>} */
        const widgets = new Map();
        for (const key of CONFIG_KEYS) {
            parsed[key] = parseJson(raw[key]);
            autolistNodes(parsed[key], (n) => {
                if (syncable(n) && !widgets.has(n.id)) {
                    widgets.set(n.id, n);
                }
            });
        }
        return { parsed, widgets };
    }

    /**
     * Syncs the given widgets (all due ones when `ids` is null) against one fresh read
     * of the config, and writes each config state that changed once.
     *
     * @param {string[] | null} ids
     */
    async function run(ids) {
        let { widgets } = await scan();
        const t = now();
        const pick = [...widgets.values()].filter((n) =>
            ids ? ids.includes(n.id) : t - (lastRun.get(n.id) || 0) >= intervalMs(n.options),
        );
        /** @type {Record<string, { added: number, removed: number, changed: boolean }>} */
        const result = {};
        if (!pick.length) {
            return result;
        }
        const found = new Map();
        const r = await rows();
        for (const n of pick) {
            found.set(n.id, shared.discoverFromRows(r, n.options));
        }
        // Read again right before writing: the object views take a moment, and an
        // editor saving in between must not be overwritten with the older config.
        const fresh = await scan();
        widgets = fresh.widgets;
        /** @type {Map<string, any[]>} */
        const next = new Map();
        for (const n of pick) {
            lastRun.set(n.id, t);
            const w = widgets.get(n.id);
            if (!w) {
                continue;
            }
            const round = shared.autoListSyncRound(w.options, found.get(n.id));
            result[n.id] = { added: round.added, removed: round.removed, changed: round.changed };
            if (round.changed) {
                next.set(n.id, round.entries);
            }
        }
        if (!next.size) {
            return result;
        }
        for (const key of CONFIG_KEYS) {
            const value = fresh.parsed[key];
            let touched = false;
            autolistNodes(value, (n) => {
                if (next.has(n.id)) {
                    n.options.entries = next.get(n.id);
                    touched = true;
                }
            });
            if (touched) {
                await writeConfig(key, JSON.stringify(value));
            }
        }
        if (log) {
            for (const [id, r2] of Object.entries(result)) {
                if (r2.changed) {
                    log.info(`[autolist] ${id}: ${r2.added} added, ${r2.removed} removed`);
                }
            }
        }
        return result;
    }

    /** Timer tick: syncs every widget whose interval has passed. */
    function tick() {
        return serial(() => run(null)).catch((e) => log && log.warn(`[autolist] sync failed: ${e.message}`));
    }

    /**
     * The widget asks whether the adapter syncs it — and with `now`, to sync it at once.
     *
     * @param {string} widgetId
     * @param {boolean} [immediate]
     */
    function request(widgetId, immediate) {
        return serial(async () => {
            const { widgets } = await scan();
            if (typeof widgetId !== 'string' || !widgets.has(widgetId)) {
                return { ok: true, managed: false };
            }
            if (!immediate) {
                return { ok: true, managed: true };
            }
            const r = (await run([widgetId]))[widgetId] || { added: 0, removed: 0, changed: false };
            return { ok: true, managed: true, ...r };
        });
    }

    return { tick, request };
}

module.exports = { createAutoListSync };
