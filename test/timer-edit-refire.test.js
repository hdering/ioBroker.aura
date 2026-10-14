'use strict';

/**
 * An edited timer event keeps its id (#778): moving an already fired event to
 * a later time on the same day must fire again, a plain re-tick must not.
 * Drives the real _timerTick of main.js with `@iobroker/adapter-core` stubbed
 * out and a fake clock.
 *
 *   node test/timer-edit-refire.test.js
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

const RealDate = Date;
let clock = new RealDate(2026, 9, 14, 10, 0, 0).getTime();
global.Date = class extends RealDate {
    constructor(...args) {
        super(...(args.length ? args : [clock]));
    }
    static now() {
        return clock;
    }
};

const createAdapter = require('../main.js');

const ALL = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const config = (trigger) => ({
    targetDp: 'x.0.setpoint',
    value: '21',
    events: [{ id: 'e1', enabled: true, weekdays: ALL, trigger }],
});

function makeAdapter() {
    const a = createAdapter({});
    const writes = [];
    a.config = {};
    a.getForeignStateAsync = async () => null;
    a.setForeignStateAsync = async (id, val) => void writes.push(new RealDate(clock).toTimeString().slice(0, 5));
    a.setStateAsync = async () => {};
    a._timerState = new Map();
    a._timerFired = new Set();
    a._timerException = new Map();
    a._timerLastDay = a._currentDayKey();
    a._timerTickMs = 30000;
    return { a, writes };
}

async function runUntil(a, h, m) {
    const end = new RealDate(2026, 9, 14, h, m, 0).getTime();
    while (clock < end) {
        clock += 30000;
        await a._timerTick();
    }
}

(async () => {
    let n = 0;
    const test = async (name, fn) => {
        clock = new RealDate(2026, 9, 14, 10, 0, 0).getTime();
        await fn();
        n++;
        console.log(`  ok  ${name}`);
    };

    await test('time event moved later the same day fires again', async () => {
        const { a, writes } = makeAdapter();
        a._ingestTimerState('aura.0.timers.w1.config', JSON.stringify(config({ kind: 'time', hour: 10, minute: 2 })));
        await runUntil(a, 10, 4);
        assert.deepStrictEqual(writes, ['10:02']);
        a._ingestTimerState('aura.0.timers.w1.config', JSON.stringify(config({ kind: 'time', hour: 10, minute: 6 })));
        await runUntil(a, 10, 10);
        assert.deepStrictEqual(writes, ['10:02', '10:06']);
    });

    await test('unchanged config republished → no second write', async () => {
        const { a, writes } = makeAdapter();
        const cfg = JSON.stringify(config({ kind: 'time', hour: 10, minute: 2 }));
        a._ingestTimerState('aura.0.timers.w1.config', cfg);
        await runUntil(a, 10, 2);
        a._ingestTimerState('aura.0.timers.w1.config', cfg);
        await runUntil(a, 10, 5);
        assert.deepStrictEqual(writes, ['10:02']);
    });

    await test('once event moved to a new date fires again', async () => {
        const { a, writes } = makeAdapter();
        const at = (m) => ({ kind: 'once', iso: new RealDate(2026, 9, 14, 10, m, 0).toISOString() });
        a._ingestTimerState('aura.0.timers.w1.config', JSON.stringify(config(at(1))));
        await runUntil(a, 10, 3);
        assert.deepStrictEqual(writes, ['10:01']);
        a._ingestTimerState('aura.0.timers.w1.config', JSON.stringify(config(at(5))));
        await runUntil(a, 10, 7);
        assert.deepStrictEqual(writes, ['10:01', '10:05']);
    });

    console.log(`timer-edit-refire: ${n} tests passed`);
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
