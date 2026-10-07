'use strict';

/**
 * Exception values for the timer widget (#757).
 *
 * A timer may carry a fixed value per special-day source (vacationValue for
 * vacationDp, holidaysValue for holidaysDp). While such a source marks today as
 * special, the scheduler writes that value once and holds it: regular events are
 * suppressed, only events filtered to exactly that source still fire. When the
 * exception ends, the value of the regular schedule that would be in effect now
 * is restored (see lastDueWrite).
 *
 * Pure logic — main.js injects ioBroker reads and the astro calculation.
 */

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const RESTORE_LOOKBACK_DAYS = 7;

/**
 * @param {Date} d local date
 * @returns {string} zero-padded YYYY-MM-DD
 */
function dayKeyOf(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * @param {unknown} v raw option value
 * @returns {boolean} true when the option holds a usable exception value
 */
function hasValue(v) {
    return typeof v === 'string' && v.trim() !== '';
}

/**
 * Which exception is active today. Vacation wins over holidays.
 *
 * @param {object} payload timer config payload
 * @param {{has:(k:string)=>boolean}} holidays special-day matcher for holidaysDp
 * @param {{has:(k:string)=>boolean}} vacation special-day matcher for vacationDp
 * @param {string} dayKey today as YYYY-MM-DD
 * @returns {{kind:'vacation'|'holiday', value:string}|null} active exception or null
 */
function activeException(payload, holidays, vacation, dayKey) {
    if (!payload) {
        return null;
    }
    if (payload.vacationDp && hasValue(payload.vacationValue) && vacation.has(dayKey)) {
        return { kind: 'vacation', value: payload.vacationValue };
    }
    if (payload.holidaysDp && hasValue(payload.holidaysValue) && holidays.has(dayKey)) {
        return { kind: 'holiday', value: payload.holidaysValue };
    }
    return null;
}

/**
 * Whether an event is held back while an exception is active. Only events
 * filtered to the active source itself keep firing.
 *
 * @param {object} ev timer event
 * @param {{kind:string}|null} exc active exception
 * @returns {boolean} true when the event must not fire
 */
function suppressedByException(ev, exc) {
    if (!exc) {
        return false;
    }
    if (exc.kind === 'vacation') {
        return ev.filter !== 'only-vacation';
    }
    return ev.filter !== 'only-holidays';
}

/**
 * Day filter of one event, evaluated for `date`.
 *
 * @param {object} ev timer event
 * @param {Date} date moment the event fires
 * @param {{has:(k:string)=>boolean}} holidays special-day matcher
 * @param {{has:(k:string)=>boolean}} vacation special-day matcher
 * @returns {boolean} true when the event may fire
 */
function filterPasses(ev, date, holidays, vacation) {
    const dayKey = dayKeyOf(date);
    if (ev.filter === 'no-special') {
        return !holidays.has(dayKey) && !vacation.has(dayKey);
    }
    if (ev.filter === 'only-holidays') {
        return holidays.has(dayKey);
    }
    if (ev.filter === 'only-vacation') {
        return vacation.has(dayKey);
    }
    if (ev.filter === 'blocked') {
        const minNow = date.getHours() * 60 + date.getMinutes();
        const from = Number.isFinite(ev.blockFromMin) ? ev.blockFromMin : 0;
        const to = Number.isFinite(ev.blockToMin) ? ev.blockToMin : 0;
        // window may wrap midnight if from > to
        const inWindow = from <= to ? minNow >= from && minNow < to : minNow >= from || minNow < to;
        return !inWindow;
    }
    return true;
}

/**
 * Raw (unparsed) value an event writes: its own value when the widget allows it,
 * otherwise the widget value.
 *
 * @param {object} ev timer event
 * @param {object} payload timer config payload
 * @returns {string} raw value
 */
function eventBaseValue(ev, payload) {
    const widgetValue = payload.value != null ? payload.value : 'true';
    const own = payload.allowEventValue === true && typeof ev.value === 'string' && ev.value !== '' ? ev.value : null;
    return own != null ? own : widgetValue;
}

/**
 * The write the regular schedule would have made last — used to restore the
 * normal state when an exception ends. Looks back RESTORE_LOOKBACK_DAYS days over
 * time/astro events (weekday + filter of that day) and range start/end points.
 * One-shot events are ignored (they disable themselves after firing).
 *
 * @param {object} payload timer config payload
 * @param {Date} now current moment
 * @param {{has:(k:string)=>boolean}} holidays special-day matcher
 * @param {{has:(k:string)=>boolean}} vacation special-day matcher
 * @param {(event:string, date:Date, offsetMin:number)=>Date|null} astroAt astro resolver
 * @returns {{ev:object, ts:number, baseValue:string, invert:boolean}|null} latest due write
 */
function lastDueWrite(payload, now, holidays, vacation, astroAt) {
    const nowMs = now.getTime();
    let best = null;
    const consider = (ev, ts, invert) => {
        if (!Number.isFinite(ts) || ts > nowMs || nowMs - ts > RESTORE_LOOKBACK_DAYS * 86400000) {
            return;
        }
        if (!filterPasses(ev, new Date(ts), holidays, vacation)) {
            return;
        }
        if (!best || ts >= best.ts) {
            best = { ev, ts, baseValue: eventBaseValue(ev, payload), invert };
        }
    };
    for (const ev of Array.isArray(payload.events) ? payload.events : []) {
        if (!ev || !ev.enabled || !ev.trigger) {
            continue;
        }
        const t = ev.trigger;
        if (t.kind === 'range') {
            consider(ev, Date.parse(t.fromIso), false);
            consider(ev, Date.parse(t.toIso), true);
            continue;
        }
        if (t.kind !== 'time' && t.kind !== 'astro') {
            continue;
        }
        for (let back = 0; back <= RESTORE_LOOKBACK_DAYS; back++) {
            const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back, 12, 0, 0, 0);
            if (!Array.isArray(ev.weekdays) || !ev.weekdays.includes(WEEKDAYS[day.getDay()])) {
                continue;
            }
            let ts;
            if (t.kind === 'time') {
                ts = new Date(day.getFullYear(), day.getMonth(), day.getDate(), t.hour, t.minute, 0, 0).getTime();
            } else {
                const d = astroAt(t.event, day, t.offsetMin || 0);
                ts = d ? d.getTime() : NaN;
            }
            consider(ev, ts, false);
        }
    }
    return best;
}

module.exports = {
    activeException,
    suppressedByException,
    filterPasses,
    eventBaseValue,
    lastDueWrite,
    dayKeyOf,
};
