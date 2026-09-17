'use strict';

/**
 * Safety net for the config datapoints (`<ns>.config.*`).
 *
 * The frontend backs up every save it makes and the MCP server every change it
 * writes — both with ack=true. A script or another tool that writes one of these
 * states directly does neither, and the previous value is gone the moment the
 * write lands. This guard keeps the last seen value of every config state and,
 * when a write arrives WITHOUT ack, drops that previous value into the very same
 * backup ring the settings page lists and restores from — same file format
 * (gzip+base64 JSON with a `.meta.json` sidecar), labelled as an external write.
 *
 * Rate-limited per state (a script hammering a datapoint must not fill the
 * ring) and hard-capped so the ring cannot grow without bound when no admin ever
 * prunes it to the configured count.
 */
const zlib = require('zlib');

/** Config state (short id) → the key the frontend uses in backups and localStorage. */
const CONFIG_KEYS = {
    'config.dashboard': 'aura-dashboard',
    'config.theme': 'aura-theme',
    'config.groups': 'aura-groups',
    'config.app-config': 'aura-config',
    'config.global-settings': 'aura-global-settings',
    'config.group-defs': 'aura-group-defs',
    'config.popup-config': 'aura-popup-config',
    'config.widget-presets': 'aura-widget-presets',
};

const MIN_INTERVAL_MS = 30 * 1000;
/** Matches MAX_BACKUP_COUNT in the frontend — the admin's own prune runs below that. */
const HARD_CAP = 100;

/**
 * @param {object} adapter ioBroker adapter (namespace, getStateAsync, writeFileAsync, readDirAsync, delFileAsync)
 * @param {{ now?: () => number, minIntervalMs?: number, hardCap?: number }} [opts] clock and limits, overridable for tests
 */
function createConfigGuard(adapter, opts = {}) {
    const ns = adapter.namespace;
    const now = opts.now || (() => Date.now());
    const minInterval = opts.minIntervalMs ?? MIN_INTERVAL_MS;
    const hardCap = opts.hardCap ?? HARD_CAP;
    /** short id → last seen raw value */
    const cache = new Map();
    /** short id → time of the last backup this guard wrote for it */
    const lastBackupAt = new Map();

    const shortId = (id) => (id.startsWith(`${ns}.`) ? id.slice(ns.length + 1) : id);
    const asString = (val) => (typeof val === 'string' ? val : val == null ? '' : String(val));

    /** Read every config state once so the first foreign write already has a "before". */
    async function prime() {
        for (const short of Object.keys(CONFIG_KEYS)) {
            try {
                const st = await adapter.getStateAsync(short);
                if (st && st.val != null) {
                    cache.set(short, asString(st.val));
                }
            } catch {
                /* state missing on a fresh install */
            }
        }
    }

    /**
     * Feed every change of a config state here (any ack). Resolves the backup file
     * name when the previous value was saved, null otherwise.
     *
     * @param {string} id full state id (`<ns>.config.dashboard`)
     * @param {{ val: unknown, ack?: boolean, from?: string } | null} state the new state
     */
    async function onChange(id, state) {
        const short = shortId(id);
        if (!(short in CONFIG_KEYS) || !state) {
            return null;
        }
        const next = asString(state.val);
        const prev = cache.get(short);
        cache.set(short, next);
        // Acknowledged writes are the frontend's saves and the MCP server's — both
        // back themselves up (and the adapter's own PIN-vault writeback is ack too).
        if (state.ack) {
            return null;
        }
        if (prev === undefined || prev === next || prev.length < 3) {
            return null;
        }
        const t = now();
        if (t - (lastBackupAt.get(short) || 0) < minInterval) {
            return null;
        }
        lastBackupAt.set(short, t);
        return writeBackup(short, prev, state.from);
    }

    async function writeBackup(short, prevRaw, from) {
        const ts = new Date(now()).toISOString();
        const stamp = ts.replace(/[:.]/g, '-');
        const store = CONFIG_KEYS[short];
        const details = [
            {
                store,
                kind: 'external-write',
                label: String(from || '?').replace(/^system\.(adapter|user)\./, ''),
            },
        ];
        const payload = { _ts: ts, _changed: [store], _details: details };
        // Every state a restore can put back — the changed one at its PREVIOUS value.
        for (const [s, key] of Object.entries(CONFIG_KEYS)) {
            const v = s === short ? prevRaw : cache.get(s);
            if (typeof v === 'string' && v.length >= 3) {
                payload[key] = v;
            }
        }
        const gz = zlib.gzipSync(Buffer.from(JSON.stringify(payload), 'utf8')).toString('base64');
        const name = `backup-${stamp}.json.gz`;
        await adapter.writeFileAsync(`${ns}.backups`, name, gz);
        await adapter.writeFileAsync(
            `${ns}.backups`,
            `backup-${stamp}.meta.json`,
            JSON.stringify({ _ts: ts, _changed: payload._changed, _details: details }),
        );
        await prune();
        return name;
    }

    async function prune() {
        let files = [];
        try {
            files = (await adapter.readDirAsync(`${ns}.backups`, '')) || [];
        } catch {
            return;
        }
        const payloads = files
            .map((f) => (typeof f === 'string' ? f : f.file))
            .filter((n) => typeof n === 'string' && /^backup-.*\.json(\.gz)?$/.test(n) && !n.endsWith('.meta.json'))
            .sort()
            .reverse();
        for (const f of payloads.slice(hardCap)) {
            try {
                await adapter.delFileAsync(`${ns}.backups`, f);
                await adapter.delFileAsync(`${ns}.backups`, f.replace(/\.json(\.gz)?$/, '.meta.json'));
            } catch {
                /* already gone */
            }
        }
    }

    return { prime, onChange, cachedValue: (short) => cache.get(short) };
}

module.exports = { createConfigGuard, CONFIG_KEYS, MIN_INTERVAL_MS, HARD_CAP };
