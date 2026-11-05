'use strict';

/**
 * Announcement of a Zeitschaltuhr event (#918, phase 3).
 *
 * With `allowEventAnnounce` an event carries `announce` (text or sound file) and
 * speaks when it fires — on the device that saved it (`announceClients`), or
 * everywhere with `announceTarget: 'all'`. Pure: the adapter fills in the
 * `[[id]]` values and hands the payload to speech.say.
 */

/** A client id as sanitizeClientId() in main.js produces it. */
const CLIENT_ID_RE = /^[a-z0-9_-]{1,40}$/;

/**
 * What an event says and where, before `[[id]]` values are filled in.
 *
 * @param {object|null} payload the timer config (timers.<id>.config)
 * @param {object|null} ev the event that fired
 * @returns {{ template: string, payload: Record<string, unknown> } | null} null = no announcement
 */
function timerEventAnnouncement(payload, ev) {
    if (!payload || payload.allowEventAnnounce !== true || !ev) {
        return null;
    }
    const template = typeof ev.announce === 'string' ? ev.announce.trim() : '';
    if (!template) {
        return null;
    }
    /** @type {Record<string, unknown>} */
    const out = {};
    if (payload.announceTarget !== 'all' && Array.isArray(ev.announceClients)) {
        const clients = [...new Set(ev.announceClients.filter((c) => typeof c === 'string' && CLIENT_ID_RE.test(c)))];
        if (clients.length) {
            out.target = { clients };
        }
    }
    return { template, payload: out };
}

/**
 * Whether the scheduler has anything to do for this timer: a target to write or
 * events allowed to speak.
 *
 * @param {object|null} payload the timer config
 * @param {string[]} targets resolved target datapoints
 */
function timerHasWork(payload, targets) {
    return targets.length > 0 || !!(payload && payload.allowEventAnnounce === true);
}

module.exports = { timerEventAnnouncement, timerHasWork };
