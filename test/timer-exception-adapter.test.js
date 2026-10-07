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

    console.log(`timer-exception-adapter: ${n} tests passed`);
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
