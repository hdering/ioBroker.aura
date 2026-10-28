'use strict';

/**
 * SayIt → Aura bridge (issue #834, phase 2 interim).
 *
 * SayIt's output type "Browser" generates the announcement, writes it to its own
 * file storage (`sayit.N/tts.mp3`, also `.wav`/`.ogg` depending on the engine)
 * and then tells VIS 1 / VIS 2 to play `/sayit.N/tts.mp3`. Aura is not one of
 * those targets yet, so it watches the file instead: every write of `tts.<ext>`
 * by a SayIt instance of type "browser" becomes an announcement on
 * `speech.say`, and the dashboards play it. The user's script stays untouched —
 * `setState('sayit.0.tts.text', …)` keeps working.
 *
 * Facts about SayIt (v5, src/lib/speech2device.ts, #sayItBrowser):
 *   - native.type === 'browser' selects the browser output.
 *   - native.browserVis '' = both VIS versions, '1' / '2' = one of them. Since
 *     SayIt 5.5.0 'aura' writes { file, volume, clients } to aura.N.speech.say
 *     itself (ioBroker.sayit#518), so the bridge stands down for such an
 *     instance instead of playing everything twice.
 *   - The file is uploaded on every announcement, cached or not.
 *
 * Older SayIt versions, or browserVis '' / '1' / '2' without VIS installed, still
 * log "Cannot control browser via vis(1)"; the announcement plays anyway.
 */

const SAYIT_PREFIX = 'system.adapter.sayit.';
const TTS_FILE_RE = /^tts\.(mp3|wav|ogg)$/i;
/** SayIt writes the file once per announcement; this only swallows a double event. */
const DEBOUNCE_MS = 250;

/**
 * Should Aura relay this SayIt instance?
 *
 * @param {object|null|undefined} obj the `system.adapter.sayit.N` object
 * @returns {boolean} true for an enabled instance of type browser that does not address Aura itself
 */
function relaysInstance(obj) {
    if (!obj || obj.type !== 'instance') {
        return false;
    }
    const native = obj.native || {};
    if (native.type !== 'browser') {
        return false;
    }
    if (obj.common && obj.common.enabled === false) {
        return false;
    }
    return String(native.browserVis || '') !== 'aura';
}

/**
 * @param {object} adapter the Aura adapter (getForeignObjectsAsync, subscribeForeignFiles, log)
 * @param {{ announce: (payload: object) => (void|Promise<void>) }} opts where an announcement goes
 */
function createSayitBridge(adapter, opts) {
    /** Watched SayIt namespaces (`sayit.0`). */
    const watched = new Set();
    const timers = new Map();
    let stopped = false;

    const subscribe = async (ns, on) => {
        try {
            if (on) {
                await adapter.subscribeForeignFiles(ns, 'tts.*');
            } else {
                await adapter.unsubscribeForeignFiles(ns, 'tts.*');
            }
        } catch (e) {
            adapter.log.debug(`[speech] ${on ? '' : 'un'}subscribe files of ${ns} failed: ${e.message}`);
        }
    };

    /** Re-read the SayIt instances and (un)subscribe their files accordingly. */
    async function scan() {
        if (stopped) {
            return;
        }
        let objs = {};
        try {
            objs = (await adapter.getForeignObjectsAsync(`${SAYIT_PREFIX}*`, 'instance')) || {};
        } catch (e) {
            adapter.log.debug(`[speech] reading SayIt instances failed: ${e.message}`);
            return;
        }
        const want = new Set();
        for (const [id, obj] of Object.entries(objs)) {
            if (relaysInstance(obj)) {
                want.add(id.slice('system.adapter.'.length));
            }
        }
        for (const ns of want) {
            if (watched.has(ns)) {
                continue;
            }
            watched.add(ns);
            await subscribe(ns, true);
            adapter.log.info(`[speech] relaying SayIt announcements of ${ns} to the dashboards`);
        }
        for (const ns of [...watched]) {
            if (want.has(ns)) {
                continue;
            }
            watched.delete(ns);
            await subscribe(ns, false);
        }
    }

    /**
     * The adapter's `fileChange` event.
     *
     * @param {string} id file namespace (`sayit.0`)
     * @param {string} fileName file below it (`tts.mp3`, maybe with a leading slash)
     * @param {number|null} size null when the file was deleted
     */
    function onFileChange(id, fileName, size) {
        if (stopped || !watched.has(id)) {
            return;
        }
        if (size === null) {
            return;
        }
        const name = String(fileName || '').replace(/^\/+/, '');
        if (!TTS_FILE_RE.test(name)) {
            return;
        }
        clearTimeout(timers.get(id));
        timers.set(
            id,
            setTimeout(() => {
                timers.delete(id);
                // The query busts the browser cache: the file name never changes.
                void opts.announce({ file: `/${id}/${name}?ts=${Date.now()}`, source: id });
            }, DEBOUNCE_MS),
        );
    }

    /**
     * objectChange of `system.adapter.sayit.*`: settings changed, instance added or removed.
     *
     * @param {string} id the changed object
     * @returns {boolean} true when the id belonged to SayIt (and was handled here)
     */
    function onObjectChange(id) {
        if (!id.startsWith(SAYIT_PREFIX)) {
            return false;
        }
        clearTimeout(timers.get('scan'));
        timers.set(
            'scan',
            setTimeout(() => {
                timers.delete('scan');
                void scan();
            }, 1000),
        );
        return true;
    }

    function stop() {
        stopped = true;
        for (const t of timers.values()) {
            clearTimeout(t);
        }
        timers.clear();
    }

    return { scan, onFileChange, onObjectChange, stop, watched };
}

module.exports = { createSayitBridge, relaysInstance, SAYIT_PREFIX };
