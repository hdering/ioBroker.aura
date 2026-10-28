'use strict';

/**
 * The scheduler glue for timer exception values (#757): main.js writes the
 * exception value once when the special-day DP turns on, holds back regular
 * events meanwhile and restores the last regular write when it turns off.
 *
 * lib/timerException.js is covered by timer-exception.test.js; this test drives
 * the real _timerTick of main.js with `@iobroker/adapter-core` stubbed out.
 *
 *   node test/timer-exception-adapter.test.js
 */

const assert = require('assert');

class FakeAdapter {
    constructor(options) {
        this.name = options.name;
        this.namespace = 'aura.0';
        this.log = { info() {}, warn() {}, error() {}, debug() {} };
    }
    on() {}
}
const corePath = require.resolve('@iobroker/adapter-core');
require.cache[corePath] = { id: corePath, filename: corePath, loaded: true, exports: { Adapter: FakeAdapter } };

const createAdapter = require('../main.js');

const ALL = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function makeAdapter(payload) {
    const a = createAdapter({});
    const foreignStates = new Map();
    const writes = [];
    a.config = {};
    a.getForeignStateAsync = async (id) => (foreignStates.has(id) ? { val: foreignStates.get(id) } : null);
    a.setForeignStateAsync = async (id, val) => void writes.push({ id, val });
    a.setStateAsync = async () => {};
    a._timerState = new Map([['w1', { enabled: true, payload }]]);
    a._timerFired = new Set();
    a._timerException = new Map();
    a._timerLastDay = a._currentDayKey();
    a._timerTickMs = 30000;
    return { a, foreignStates, writes };
}

// Midnight events: always due earlier today, never inside the 30 s tick window
// (except in the first 30 s after midnight — the test does not run then).
const payload = {
    targetDp: 'x.0.setpoint',
    value: '21',
    allowEventValue: true,
    vacationDp: 'u.0.vacation',
    vacationValue: '16',
    events: [
        {
            id: 'mid',
            enabled: true,
            weekdays: ALL,
            trigger: { kind: 'time', hour: 0, minute: 0 },
            filter: 'all-days',
            value: '19',
        },
    ],
};

(async () => {
    let n = 0;
    const test = async (name, fn) => {
        await fn();
        n++;
        console.log(`  ok  ${name}`);
    };

    await test('vacation on → value written once, not again on the next tick', async () => {
        const { a, foreignStates, writes } = makeAdapter(payload);
        foreignStates.set('u.0.vacation', false);
        await a._timerTick();
        assert.deepStrictEqual(writes, []);
        foreignStates.set('u.0.vacation', true);
        await a._timerTick();
        await a._timerTick();
        assert.deepStrictEqual(writes, [{ id: 'x.0.setpoint', val: 16 }]);
    });

    await test('vacation off → last regular value restored', async () => {
        const { a, foreignStates, writes } = makeAdapter(payload);
        foreignStates.set('u.0.vacation', true);
        await a._timerTick();
        foreignStates.set('u.0.vacation', false);
        await a._timerTick();
        assert.deepStrictEqual(writes, [
            { id: 'x.0.setpoint', val: 16 },
            { id: 'x.0.setpoint', val: 19 },
        ]);
    });

    await test('changing the exception value while active rewrites it', async () => {
        const { a, foreignStates, writes } = makeAdapter({ ...payload });
        foreignStates.set('u.0.vacation', true);
        await a._timerTick();
        a._timerState.get('w1').payload = { ...payload, vacationValue: '15' };
        await a._timerTick();
        assert.deepStrictEqual(
            writes.map((w) => w.val),
            [16, 15],
        );
    });

    await test('removing the exception value while active restores the schedule', async () => {
        const { a, foreignStates, writes } = makeAdapter({ ...payload });
        foreignStates.set('u.0.vacation', true);
        await a._timerTick();
        a._timerState.get('w1').payload = { ...payload, vacationValue: undefined };
        await a._timerTick();
        assert.deepStrictEqual(
            writes.map((w) => w.val),
            [16, 19],
        );
    });

    await test('without an exception value nothing changes (old behaviour)', async () => {
        const { a, foreignStates, writes } = makeAdapter({ ...payload, vacationValue: '' });
        foreignStates.set('u.0.vacation', true);
        await a._timerTick();
        foreignStates.set('u.0.vacation', false);
        await a._timerTick();
        assert.deepStrictEqual(writes, []);
    });

    await test('master switch off → no exception write', async () => {
        const { a, foreignStates, writes } = makeAdapter(payload);
        a._timerState.get('w1').enabled = false;
        foreignStates.set('u.0.vacation', true);
        await a._timerTick();
        assert.deepStrictEqual(writes, []);
    });

    await test('regular event due now is held back during vacation', async () => {
        const now = new Date();
        const due = {
            ...payload,
            events: [
                {
                    id: 'now',
                    enabled: true,
                    weekdays: ALL,
                    trigger: { kind: 'time', hour: now.getHours(), minute: now.getMinutes() },
                    filter: 'all-days',
                    value: '22',
                },
                {
                    id: 'vac',
                    enabled: true,
                    weekdays: ALL,
                    trigger: { kind: 'time', hour: now.getHours(), minute: now.getMinutes() },
                    filter: 'only-vacation',
                    value: '17',
                },
            ],
        };
        const { a, foreignStates, writes } = makeAdapter(due);
        a._timerTickMs = 120000; // hh:mm:00 must fall inside the window whatever the current second
        foreignStates.set('u.0.vacation', true);
        await a._timerTick();
        assert.deepStrictEqual(
            writes.map((w) => w.val),
            [16, 17],
        );
    });

    await test('extra target DPs get the same value, duplicates and blanks skipped (#774)', async () => {
        const now = new Date();
        const multi = {
            targetDp: 'x.0.setpoint',
            extraTargetDps: ['y.0.setpoint', ' ', 'x.0.setpoint', ' z.0.setpoint '],
            value: '21',
            events: [
                {
                    id: 'now',
                    enabled: true,
                    weekdays: ALL,
                    trigger: { kind: 'time', hour: now.getHours(), minute: now.getMinutes() },
                    filter: 'all-days',
                },
            ],
        };
        const { a, writes } = makeAdapter(multi);
        a._timerTickMs = 120000;
        await a._timerTick();
        assert.deepStrictEqual(writes, [
            { id: 'x.0.setpoint', val: 21 },
            { id: 'y.0.setpoint', val: 21 },
            { id: 'z.0.setpoint', val: 21 },
        ]);
    });

    await test('extra target DPs alone are enough to fire', async () => {
        const now = new Date();
        const extraOnly = {
            extraTargetDps: ['y.0.on'],
            events: [
                {
                    id: 'now',
                    enabled: true,
                    weekdays: ALL,
                    trigger: { kind: 'time', hour: now.getHours(), minute: now.getMinutes() },
                    filter: 'all-days',
                },
            ],
        };
        const { a, writes } = makeAdapter(extraOnly);
        a._timerTickMs = 120000;
        await a._timerTick();
        assert.deepStrictEqual(writes, [{ id: 'y.0.on', val: true }]);
    });

    await test('reapply DP writes the last regular value (#872)', async () => {
        const { a, foreignStates, writes } = makeAdapter(payload);
        foreignStates.set('u.0.vacation', false);
        await a.onStateChange('aura.0.timers.w1.reapply', { val: true, ack: false });
        assert.deepStrictEqual(writes, [{ id: 'x.0.setpoint', val: 19 }]);
    });

    await test('reapply during an exception writes the exception value, the tick not again (#872)', async () => {
        const { a, foreignStates, writes } = makeAdapter(payload);
        foreignStates.set('u.0.vacation', true);
        await a.onStateChange('aura.0.timers.w1.reapply', { val: true, ack: false });
        await a._timerTick();
        assert.deepStrictEqual(writes, [{ id: 'x.0.setpoint', val: 16 }]);
    });

    await test('reapply: range end wins over an earlier start → inverted value (#872)', async () => {
        const h = 3600000;
        const range = {
            targetDp: 'x.0.on',
            value: 'true',
            events: [
                {
                    id: 'r',
                    enabled: true,
                    weekdays: ALL,
                    trigger: {
                        kind: 'range',
                        fromIso: new Date(Date.now() - 2 * h).toISOString(),
                        toIso: new Date(Date.now() - h).toISOString(),
                    },
                    filter: 'all-days',
                },
            ],
        };
        const { a, writes } = makeAdapter(range);
        await a._timerReapply('w1', 'test');
        assert.deepStrictEqual(writes, [{ id: 'x.0.on', val: false }]);
    });

    await test('reapply ignores ack writes, false and a switched-off timer (#872)', async () => {
        const { a, writes } = makeAdapter(payload);
        await a.onStateChange('aura.0.timers.w1.reapply', { val: true, ack: true });
        await a.onStateChange('aura.0.timers.w1.reapply', { val: false, ack: false });
        a._timerState.get('w1').enabled = false;
        await a.onStateChange('aura.0.timers.w1.reapply', { val: true, ack: false });
        assert.deepStrictEqual(writes, []);
    });

    console.log(`timer-exception-adapter: ${n} tests passed`);
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
