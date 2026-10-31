'use strict';

/**
 * Which datapoints a Statusübersicht watches, found in the adapter (#882).
 *
 *     sendTo('aura.0', 'statusDiscover', { opts, overrides })
 *       → { ok: true, candidates: [{ dp, cat, level? }], devices: [DeviceModel] }
 *
 * The discovery needs every state, channel, device, enum and instance object. In the
 * browser that was the whole object DB over the socket — tens of MB, half a minute on
 * a phone. Here the same rows are a local read, and the answer is only the hits plus
 * the device/channel models above them (battery type, hidden devices, row actions).
 *
 * Same code as the widget's own fallback (src-vis/utils/statusOverview.ts,
 * datapointEntry.ts, batteryLogic.ts via lib/shared/auraShared.js), so both find the
 * same rows. The rows are kept for a few minutes: a dashboard with three overviews,
 * or ten tablets reloading at once, read the object DB once.
 */

const shared = require('./shared/auraShared');

const TTL_MS = 5 * 60 * 1000;
const END = '香';

/**
 * @param {{ getObjectView: (type: string, startkey: string, endkey: string) => Promise<{ rows?: any[] } | null | undefined>, ttlMs?: number }} deps
 */
function createStatusDiscovery({ getObjectView, ttlMs = TTL_MS }) {
    /** @type {{ entries: any[], index: Map<string, any> } | null} */
    let snapshot = null;
    /** @type {Promise<{ entries: any[], index: Map<string, any> }> | null} */
    let loading = null;
    /** @type {ReturnType<typeof setTimeout> | null} */
    let dropTimer = null;
    let lib = null;

    const rows = async (type, startkey = '', endkey = END) => {
        const res = await getObjectView(type, startkey, endkey);
        return (res && res.rows) || [];
    };

    async function read() {
        const [states, aliasStates, channels, devices, enums, instances] = await Promise.all([
            rows('state'),
            rows('state', 'alias.', `alias.${END}`),
            rows('channel'),
            rows('device'),
            rows('enum', 'enum.', `enum.${END}`),
            rows('instance', 'system.adapter.', `system.adapter.${END}`),
        ]);
        const { entries } = shared.buildDatapointEntries({ states, aliasStates, channels, devices, enums, instances });
        return { entries, index: shared.buildDeviceModelIndex(devices, channels) };
    }

    function load() {
        if (snapshot) {
            return Promise.resolve(snapshot);
        }
        if (!loading) {
            loading = read()
                .then((s) => {
                    snapshot = s;
                    // Dropped after the TTL rather than refreshed: between dashboard loads
                    // the adapter should not hold every object in memory.
                    dropTimer = setTimeout(() => {
                        snapshot = null;
                        dropTimer = null;
                    }, ttlMs);
                    if (dropTimer && typeof dropTimer.unref === 'function') {
                        dropTimer.unref();
                    }
                    return s;
                })
                .finally(() => {
                    loading = null;
                });
        }
        return loading;
    }

    function batteryLib() {
        if (!lib) {
            lib = shared.buildBatteryLibIndex(shared.BATTERY_LIBRARY, shared.SNAPSHOT_DATE, shared.SOURCE_VERSION);
        }
        return lib;
    }

    /**
     * @param {unknown} opts  the widget's discovery options (discoveryOptions())
     * @param {unknown} overrides  battery type overrides from the frontend config
     */
    async function discover(opts, overrides) {
        const o = opts && typeof opts === 'object' ? opts : {};
        const ov = overrides && typeof overrides === 'object' ? overrides : {};
        const { entries, index } = await load();
        // The widget's second pass, done at once: the HomeMatic LOWBAT gate also takes
        // devices the battery library knows (no voltage datapoint).
        const test =
            /** @type {any} */ (o).catBattery === false ? undefined : shared.batteryDeviceTest(index, batteryLib(), ov);
        const candidates = shared.discoverStatusCandidates(entries, o, test);
        const devices = shared.deviceModelsAbove(
            candidates.map((c) => c.dp.id),
            index,
        );
        return { ok: true, candidates, devices };
    }

    function stop() {
        if (dropTimer) {
            clearTimeout(dropTimer);
        }
        dropTimer = null;
        snapshot = null;
    }

    return { discover, stop };
}

module.exports = { createStatusDiscovery };
