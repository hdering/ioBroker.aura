'use strict';

/**
 * Announcements without a script (issue #834, phase 4).
 *
 * Admin → Ansagen stores rules in `config.announcements`: datapoint + conditions →
 * text → devices, with a time window and a lock. The adapter runs them, not the
 * dashboards: "at most once a day" has to hold across every device, and the
 * doorbell must be announced no matter which dashboards are open and whether one
 * of them was just reloaded. A rule that fires writes one JSON payload to
 * `speech.say`; the clients take it from there (target, queue, autoplay).
 *
 * Condition, window, lock and text are the shared logic of
 * src-vis/utils/announcements.ts (lib/shared/auraShared.js), so the admin preview
 * and the adapter agree on what a rule means.
 *
 * Like the popup triggers a rule speaks on the edge: when its conditions turn
 * from unmet to met. The value present at startup or when a rule is saved is
 * only the baseline — a restart must not announce every doorbell that is still
 * `true`. Mode `update` speaks on every new value of the trigger datapoint while
 * the conditions hold.
 */

const shared = require('./shared/auraShared');

/** Mode `update`: a command written without ack and confirmed with ack is one press. */
const UPDATE_DEBOUNCE_MS = 2000;

const hasChangedClause = (rule) =>
    [rule.clause, ...(rule.extraClauses || [])].some((c) => c && c.operator === 'changed');

/**
 * @param {object} adapter the Aura adapter (getForeignStateAsync, log)
 * @param {object} opts wiring
 * @param {(payload: object) => (void|Promise<void>)} opts.announce hands a payload to speech.say
 * @param {(id: string) => Promise<void>} opts.subscribe subscribe a foreign state
 * @param {(id: string) => Promise<void>} opts.unsubscribe drop a foreign subscription
 * @param {Record<string, number>} [opts.lastFired] when each rule last spoke (persisted by the caller)
 * @param {(lastFired: Record<string, number>) => unknown} [opts.saveLastFired] persist it
 * @param {() => number} [opts.now] clock, for tests
 */
function createAnnouncements(adapter, opts) {
    const now = opts.now || (() => Date.now());
    /** runnable rules */
    let rules = [];
    /** rule id → JSON of the rule the baseline was taken for */
    const ruleKeys = new Map();
    /** rule id → last evaluation */
    const matched = new Map();
    /** rule id → time of the last value that fired it in mode update */
    const lastUpdate = new Map();
    /** datapoint → rules reading it */
    let consumers = new Map();
    const values = new Map();
    const watched = new Set();
    const lastFired = new Map(Object.entries(opts.lastFired || {}).filter(([, ts]) => typeof ts === 'number'));
    let queue = Promise.resolve();
    let stopped = false;

    const persist = () => {
        if (!opts.saveLastFired) {
            return;
        }
        /** @type {Record<string, number>} */
        const out = {};
        for (const r of rules) {
            const ts = lastFired.get(r.id);
            if (ts) {
                out[r.id] = ts;
            }
        }
        return opts.saveLastFired(out);
    };

    const readValue = async (id) => {
        try {
            const st = await adapter.getForeignStateAsync(id);
            return st ? st.val : null;
        } catch {
            return null;
        }
    };

    /**
     * The spoken text of a rule right now, values read fresh where not watched.
     *
     * @param {any} rule a normalized rule
     */
    async function render(rule) {
        const template = shared.announcementTextTemplate(rule);
        const textValues = new Map();
        for (const id of shared.announcementTextDps(template)) {
            textValues.set(id, watched.has(id) && values.has(id) ? values.get(id) : await readValue(id));
        }
        return shared.renderAnnouncementText(template, textValues).trim();
    }

    async function speak(rule, reason) {
        const text = await render(rule);
        if (!text) {
            adapter.log.debug(`[announcements] "${rule.name}" has nothing to say`);
            return '';
        }
        adapter.log.info(`[announcements] "${rule.name}" (${reason}): ${text}`);
        await opts.announce(shared.announcementPayload(rule, text));
        return text;
    }

    async function fire(rule) {
        const at = now();
        if (!shared.announcementInWindow(rule, new Date(at))) {
            adapter.log.debug(`[announcements] "${rule.name}" outside its time window`);
            return;
        }
        if (!shared.announcementLockAllows(rule, lastFired.get(rule.id), at)) {
            adapter.log.debug(`[announcements] "${rule.name}" locked`);
            return;
        }
        lastFired.set(rule.id, at);
        await persist();
        await speak(rule, 'condition');
    }

    async function evaluate(rule, changedId) {
        const hit = shared.announcementMatches(rule, values, changedId);
        const prev = matched.get(rule.id);
        // A `changed` condition only holds for the value that changed — the next
        // change is a new edge, not a continuation.
        matched.set(rule.id, hit && !hasChangedClause(rule));
        if (!hit) {
            return;
        }
        if (rule.mode === 'update') {
            if (changedId !== rule.clause.datapoint) {
                if (prev) {
                    return;
                }
            } else {
                const last = lastUpdate.get(rule.id) || 0;
                if (now() - last < UPDATE_DEBOUNCE_MS) {
                    return;
                }
                lastUpdate.set(rule.id, now());
            }
        } else if (prev) {
            return;
        }
        await fire(rule);
    }

    /**
     * Take a new `config.announcements`. Subscribes what the rules read, drops
     * what they no longer read, and takes a baseline for every new or changed
     * rule — saving a rule never announces anything.
     *
     * @param {unknown} raw the state value
     */
    function load(raw) {
        queue = queue.then(async () => {
            if (stopped) {
                return;
            }
            rules = shared.parseAnnouncementConfig(raw).rules.filter(shared.announcementRunnable);
            consumers = new Map();
            for (const rule of rules) {
                for (const dp of shared.announcementDps(rule)) {
                    const list = consumers.get(dp);
                    if (list) {
                        list.push(rule);
                    } else {
                        consumers.set(dp, [rule]);
                    }
                }
            }
            for (const id of consumers.keys()) {
                if (watched.has(id)) {
                    continue;
                }
                watched.add(id);
                await opts.subscribe(id);
                values.set(id, await readValue(id));
            }
            for (const id of [...watched]) {
                if (consumers.has(id)) {
                    continue;
                }
                watched.delete(id);
                values.delete(id);
                await opts.unsubscribe(id);
            }
            const live = new Set(rules.map((r) => r.id));
            for (const map of [ruleKeys, matched, lastUpdate]) {
                for (const id of [...map.keys()]) {
                    if (!live.has(id)) {
                        map.delete(id);
                    }
                }
            }
            for (const rule of rules) {
                const key = JSON.stringify(rule);
                if (ruleKeys.get(rule.id) === key) {
                    continue;
                }
                ruleKeys.set(rule.id, key);
                matched.set(rule.id, shared.announcementMatches(rule, values));
            }
            adapter.log.debug(`[announcements] ${rules.length} rule(s), ${watched.size} datapoint(s) watched`);
        });
        return queue;
    }

    /**
     * A new value of a watched datapoint.
     *
     * @param {string} id full state id
     * @param {{val: unknown}|null|undefined} state the new state
     * @returns {boolean} true when the id is one the rules read
     */
    function onStateChange(id, state) {
        if (!watched.has(id)) {
            return false;
        }
        queue = queue.then(async () => {
            if (stopped || !watched.has(id)) {
                return;
            }
            values.set(id, state ? state.val : null);
            for (const rule of consumers.get(id) || []) {
                try {
                    await evaluate(rule, id);
                } catch (e) {
                    adapter.log.warn(`[announcements] "${rule.name}" failed: ${e.message}`);
                }
            }
        });
        return true;
    }

    /**
     * Speak a rule now, regardless of its conditions, window and lock — the
     * admin's "Test" button. Does not count as a firing for the lock.
     *
     * @param {unknown} raw one rule as the admin holds it
     * @returns {Promise<string>} the spoken text ('' = nothing to say)
     */
    async function test(raw) {
        const rule = shared.parseAnnouncementConfig({ rules: [raw] }).rules[0];
        if (!rule) {
            return '';
        }
        return speak({ ...rule, name: rule.name || rule.id }, 'test');
    }

    function stop() {
        stopped = true;
    }

    return { load, onStateChange, test, stop, watched: () => [...watched] };
}

module.exports = { createAnnouncements };
