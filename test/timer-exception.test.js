'use strict';

/**
 * Unit tests for the timer exception values (issue #757): which exception is
 * active, which events it holds back, and what is restored when it ends.
 */

const assert = require('assert');
const { parseSpecialDays } = require('../lib/specialDays');
const { activeException, suppressedByException, lastDueWrite } = require('../lib/timerException');

let n = 0;
const test = (name, fn) => {
    fn();
    n++;
    console.log(`  ok  ${name}`);
};

const ALL = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const NONE = parseSpecialDays(null);
const noAstro = () => null;
const at = (h, m) => ({ kind: 'time', hour: h, minute: m });
const ev = (id, trigger, extra = {}) => ({ id, enabled: true, weekdays: ALL, trigger, filter: 'all-days', ...extra });

const heating = {
    targetDp: 'x.0.setpoint',
    value: '21',
    allowEventValue: true,
    vacationDp: 'u.0.vacation',
    vacationValue: '16',
    holidaysDp: 'u.0.holidays',
    holidaysValue: '19',
    events: [ev('morning', at(6, 0), { value: '21' }), ev('night', at(22, 0), { value: '18' })],
};

test('no exception when the special-day source is not active', () => {
    assert.strictEqual(activeException(heating, NONE, NONE, '2026-10-07'), null);
});

test('boolean vacation DP activates the vacation value', () => {
    const exc = activeException(heating, NONE, parseSpecialDays(true), '2026-10-07');
    assert.deepStrictEqual(exc, { kind: 'vacation', value: '16' });
});

test('vacation wins over holidays', () => {
    const exc = activeException(heating, parseSpecialDays(true), parseSpecialDays(true), '2026-10-07');
    assert.strictEqual(exc.kind, 'vacation');
});

test('holiday value applies when only the holiday is active', () => {
    const exc = activeException(heating, parseSpecialDays('["2026-12-25"]'), NONE, '2026-12-25');
    assert.deepStrictEqual(exc, { kind: 'holiday', value: '19' });
});

test('empty exception value = feature off', () => {
    const p = { ...heating, vacationValue: '  ' };
    assert.strictEqual(activeException(p, NONE, parseSpecialDays(true), '2026-10-07'), null);
});

test('exception value without its DP is ignored', () => {
    const p = { ...heating, vacationDp: '' };
    assert.strictEqual(activeException(p, NONE, parseSpecialDays(true), '2026-10-07'), null);
});

test('vacation ranges: active inside, inactive on the return day', () => {
    const vac = parseSpecialDays('["2026-07-20/2026-08-06"]');
    assert.ok(activeException(heating, NONE, vac, '2026-08-06'));
    assert.strictEqual(activeException(heating, NONE, vac, '2026-08-07'), null);
});

test('active vacation holds back regular events, keeps only-vacation ones', () => {
    const exc = { kind: 'vacation', value: '16' };
    assert.ok(suppressedByException({ filter: 'all-days' }, exc));
    assert.ok(suppressedByException({ filter: 'blocked' }, exc));
    assert.ok(suppressedByException({ filter: 'only-holidays' }, exc));
    assert.ok(!suppressedByException({ filter: 'only-vacation' }, exc));
    assert.ok(!suppressedByException({ filter: 'all-days' }, null));
});

test('active holiday keeps only-holidays events', () => {
    const exc = { kind: 'holiday', value: '19' };
    assert.ok(!suppressedByException({ filter: 'only-holidays' }, exc));
    assert.ok(suppressedByException({ filter: 'only-vacation' }, exc));
});

test('restore picks the latest regular write of today', () => {
    const now = new Date(2026, 9, 7, 12, 0); // Wed noon
    const last = lastDueWrite(heating, now, NONE, NONE, noAstro);
    assert.strictEqual(last.ev.id, 'morning');
    assert.strictEqual(last.baseValue, '21');
    assert.strictEqual(last.invert, false);
});

test('restore right after midnight falls back to last night', () => {
    const now = new Date(2026, 9, 7, 0, 0, 30);
    const last = lastDueWrite(heating, now, NONE, NONE, noAstro);
    assert.strictEqual(last.ev.id, 'night');
    assert.strictEqual(last.baseValue, '18');
});

test('restore honours weekdays and day filters of the past day', () => {
    const p = {
        ...heating,
        events: [
            ev('weekday', at(6, 0), { value: '21', weekdays: ['mon', 'tue', 'wed', 'thu', 'fri'] }),
            ev('sat', at(9, 0), { value: '22', weekdays: ['sat'] }),
        ],
    };
    // Sunday 2026-10-11 08:00 → Saturday 09:00 is the latest due one
    const last = lastDueWrite(p, new Date(2026, 9, 11, 8, 0), NONE, NONE, noAstro);
    assert.strictEqual(last.ev.id, 'sat');
    // with Saturday a holiday and filter no-special, Friday's write wins instead
    const p2 = { ...p, events: [p.events[0], { ...p.events[1], filter: 'no-special' }] };
    const hol = parseSpecialDays('["2026-10-10"]');
    const last2 = lastDueWrite(p2, new Date(2026, 9, 11, 8, 0), hol, NONE, noAstro);
    assert.strictEqual(last2.ev.id, 'weekday');
});

test('widget value is used when per-event values are not allowed', () => {
    const p = { ...heating, allowEventValue: false };
    const last = lastDueWrite(p, new Date(2026, 9, 7, 12, 0), NONE, NONE, noAstro);
    assert.strictEqual(last.baseValue, '21');
    const night = lastDueWrite(p, new Date(2026, 9, 7, 23, 0), NONE, NONE, noAstro);
    assert.strictEqual(night.ev.id, 'night');
    assert.strictEqual(night.baseValue, '21');
});

test('range end restores inverted, astro events use the resolver', () => {
    const p = {
        ...heating,
        events: [
            ev('range', { kind: 'range', fromIso: '2026-10-07T08:00', toIso: '2026-10-07T10:00' }),
            ev('dusk', { kind: 'astro', event: 'sunset', offsetMin: 0 }, { value: '20' }),
        ],
    };
    const astro = (event, date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 18, 30);
    const r = lastDueWrite(p, new Date(2026, 9, 7, 11, 0), NONE, NONE, astro);
    assert.strictEqual(r.ev.id, 'range');
    assert.strictEqual(r.invert, true);
    const a = lastDueWrite(p, new Date(2026, 9, 7, 19, 0), NONE, NONE, astro);
    assert.strictEqual(a.ev.id, 'dusk');
    assert.strictEqual(a.baseValue, '20');
});

test('disabled, one-shot and stale events are not restored', () => {
    const p = {
        ...heating,
        events: [
            ev('off', at(6, 0), { enabled: false }),
            ev('once', { kind: 'once', iso: '2026-10-07T07:00' }),
            ev('none', at(6, 0), { weekdays: [] }),
        ],
    };
    assert.strictEqual(lastDueWrite(p, new Date(2026, 9, 7, 12, 0), NONE, NONE, noAstro), null);
});

console.log(`timer-exception: ${n} tests passed`);
