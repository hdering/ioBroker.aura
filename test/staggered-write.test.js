'use strict';

/**
 * Staggered writes (#974): lib/staggeredWrite.js and its two users in main.js —
 * timer targets with a delay (extraTargetDelays) and the sendTo 'staggeredWrite'
 * the group action uses. Fake timers, adapter-core stubbed.
 *
 *   - delay 0 is written at once, the rest after its delay
 *   - a new run / cancel of the same key drops what is still pending
 *   - switching the timer off drops pending writes
 *   - sendTo only writes real, writable states
 *
 *   node test/staggered-write.test.js
 */

const assert = require('assert');
const { StaggeredWriter, clampDelay, MAX_DELAY_MS } = require('../lib/staggeredWrite');

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

/** Manual clock: timers fire only on advance(ms). */
function fakeTimers() {
    let now = 0;
    let seq = 0;
    const timers = new Map();
    return {
        setTimeout: (fn, ms) => {
            const h = ++seq;
            timers.set(h, { at: now + ms, fn });
            return h;
        },
        clearTimeout: (h) => void timers.delete(h),
        async advance(ms) {
            const end = now + ms;
            for (;;) {
                const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at);
                if (due.length === 0) break;
                const [h, t] = due[0];
                timers.delete(h);
                now = t.at;
                t.fn();
                await new Promise((r) => setImmediate(r));
            }
            now = end;
        },
        get size() {
            return timers.size;
        },
    };
}

const ALL = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function makeAdapter(payload, objects = {}) {
    const a = createAdapter({});
    const writes = [];
    const ft = fakeTimers();
    a.config = {};
    a.setTimeout = ft.setTimeout;
    a.clearTimeout = ft.clearTimeout;
    a.getForeignStateAsync = async () => null;
    a.getForeignObjectAsync = async (id) => objects[id] ?? null;
    a.setForeignStateAsync = async (id, val) => void writes.push({ id, val });
    a.setStateAsync = async () => {};
    a.sendTo = (_from, _cmd, result, cb) => cb?.(result);
    a._timerState = new Map([['w1', { enabled: true, payload }]]);
    a._timerFired = new Set();
    a._timerException = new Map();
    a._timerLastDay = a._currentDayKey();
    a._timerTickMs = 120000;
    return { a, writes, ft };
}

function nowEvent(extra = {}) {
    const now = new Date();
    return {
        id: 'now',
        enabled: true,
        weekdays: ALL,
        trigger: { kind: 'time', hour: now.getHours(), minute: now.getMinutes() },
        filter: 'all-days',
        ...extra,
    };
}

function send(a, command, message) {
    return new Promise((resolve) => {
        void a.onMessage({ command, message, from: 'system.adapter.web.0', callback: resolve });
    });
}

(async () => {
    let n = 0;
    const test = async (name, fn) => {
        await fn();
        n++;
        console.log(`  ok  ${name}`);
    };

    await test('clampDelay: junk → 0, capped at 10 min', async () => {
        assert.strictEqual(clampDelay(undefined), 0);
        assert.strictEqual(clampDelay('abc'), 0);
        assert.strictEqual(clampDelay(-5), 0);
        assert.strictEqual(clampDelay('1500.4'), 1500);
        assert.strictEqual(clampDelay(1e9), MAX_DELAY_MS);
    });

    await test('engine: immediate first, delayed in order of their delay', async () => {
        const ft = fakeTimers();
        const out = [];
        const w = new StaggeredWriter({ write: async (id) => void out.push(id), ...ft });
        const later = await w.run('k', [
            { id: 'c', val: 1, delayMs: 4000 },
            { id: 'a', val: 1, delayMs: 0 },
            { id: 'b', val: 1, delayMs: 2000 },
        ]);
        assert.strictEqual(later, 2);
        assert.deepStrictEqual(out, ['a']);
        await ft.advance(2000);
        assert.deepStrictEqual(out, ['a', 'b']);
        await ft.advance(2000);
        assert.deepStrictEqual(out, ['a', 'b', 'c']);
        assert.strictEqual(w.pendingCount('k'), 0);
    });

    await test('engine: a new run of the same key drops the pending writes', async () => {
        const ft = fakeTimers();
        const out = [];
        const w = new StaggeredWriter({ write: async (id, val) => void out.push(`${id}=${val}`), ...ft });
        await w.run('k', [
            { id: 'a', val: 'down', delayMs: 0 },
            { id: 'b', val: 'down', delayMs: 3000 },
        ]);
        await ft.advance(1000);
        await w.run('k', [
            { id: 'a', val: 'up', delayMs: 0 },
            { id: 'b', val: 'up', delayMs: 3000 },
        ]);
        await ft.advance(10000);
        assert.deepStrictEqual(out, ['a=down', 'a=up', 'b=up']);
    });

    await test('engine: other keys are not touched, cancel and dispose clear', async () => {
        const ft = fakeTimers();
        const out = [];
        const w = new StaggeredWriter({ write: async (id) => void out.push(id), ...ft });
        await w.run('k1', [{ id: 'a', val: 1, delayMs: 1000 }]);
        await w.run('k2', [{ id: 'b', val: 1, delayMs: 1000 }]);
        assert.strictEqual(w.cancel('k1'), 1);
        await ft.advance(2000);
        assert.deepStrictEqual(out, ['b']);
        await w.run('k3', [{ id: 'c', val: 1, delayMs: 1000 }]);
        w.dispose();
        assert.strictEqual(ft.size, 0);
    });

    await test('engine: a failing write does not stop the rest', async () => {
        const ft = fakeTimers();
        const out = [];
        const w = new StaggeredWriter({
            write: async (id) => {
                if (id === 'a') throw new Error('nope');
                out.push(id);
            },
            ...ft,
        });
        await w.run('k', [
            { id: 'a', val: 1 },
            { id: 'b', val: 1 },
            { id: 'c', val: 1, delayMs: 500 },
        ]);
        await ft.advance(500);
        assert.deepStrictEqual(out, ['b', 'c']);
    });

    const staggered = {
        targetDp: 'shutter.1.level',
        extraTargetDps: ['shutter.2.level', 'shutter.3.level', 'shutter.4.level'],
        extraTargetDelays: [0, 3000, 3000],
        value: '0',
        events: [nowEvent()],
    };

    await test('timer: extraTargetDelays stagger the targets (#974)', async () => {
        const { a, writes, ft } = makeAdapter(staggered);
        await a._timerTick();
        assert.deepStrictEqual(
            writes.map((w) => w.id),
            ['shutter.1.level', 'shutter.2.level'],
        );
        await ft.advance(3000);
        assert.deepStrictEqual(
            writes.map((w) => w.id),
            ['shutter.1.level', 'shutter.2.level', 'shutter.3.level', 'shutter.4.level'],
        );
        assert.ok(writes.every((w) => w.val === 0));
    });

    await test('timer: without delays everything is written in the tick (old behaviour)', async () => {
        const { a, writes, ft } = makeAdapter({ ...staggered, extraTargetDelays: undefined });
        await a._timerTick();
        assert.strictEqual(writes.length, 4);
        assert.strictEqual(ft.size, 0);
    });

    await test('timer: switching it off drops the pending writes', async () => {
        const { a, writes, ft } = makeAdapter(staggered);
        await a._timerTick();
        a._ingestTimerState('aura.0.timers.w1.enabled', false);
        await ft.advance(5000);
        assert.strictEqual(writes.length, 2);
    });

    await test('timer: a reapply drops the older pending writes', async () => {
        const { a, writes, ft } = makeAdapter(staggered);
        await a._timerTick();
        a._timerState.get('w1').payload = { ...staggered, value: '100' };
        await a._timerReapply('w1', 'test');
        await ft.advance(5000);
        assert.deepStrictEqual(
            writes.map((w) => `${w.id}=${w.val}`),
            [
                'shutter.1.level=0',
                'shutter.2.level=0',
                'shutter.1.level=100',
                'shutter.2.level=100',
                'shutter.3.level=100',
                'shutter.4.level=100',
            ],
        );
    });

    const objects = {
        'hm.0.a.LEVEL': { type: 'state', common: { write: true } },
        'hm.0.b.LEVEL': { type: 'state', common: {} },
        'hm.0.ro': { type: 'state', common: { write: false } },
        'hm.0.chan': { type: 'channel', common: {} },
    };

    await test('sendTo staggeredWrite: runs the sequence, skips non-writable ids', async () => {
        const { a, writes, ft } = makeAdapter(null, objects);
        const res = await send(a, 'staggeredWrite', {
            key: 'grp1',
            items: [
                { id: 'hm.0.a.LEVEL', val: 0, delayMs: 0 },
                { id: 'hm.0.ro', val: 0, delayMs: 0 },
                { id: 'hm.0.chan', val: 0, delayMs: 0 },
                { id: 'hm.0.missing', val: 0, delayMs: 0 },
                { id: 'hm.0.b.LEVEL', val: 0, delayMs: 2000 },
            ],
        });
        assert.deepStrictEqual(res, { ok: true, scheduled: 1 });
        assert.deepStrictEqual(
            writes.map((w) => w.id),
            ['hm.0.a.LEVEL'],
        );
        await ft.advance(2000);
        assert.deepStrictEqual(
            writes.map((w) => w.id),
            ['hm.0.a.LEVEL', 'hm.0.b.LEVEL'],
        );
    });

    await test('sendTo staggeredWrite: cancel drops pending, bad key refused', async () => {
        const { a, writes, ft } = makeAdapter(null, objects);
        await send(a, 'staggeredWrite', {
            key: 'grp1',
            items: [
                { id: 'hm.0.a.LEVEL', val: 0, delayMs: 1000 },
                { id: 'hm.0.b.LEVEL', val: 0, delayMs: 2000 },
            ],
        });
        await ft.advance(1000);
        const res = await send(a, 'staggeredWrite', { key: 'grp1', cancel: true });
        assert.deepStrictEqual(res, { ok: true, cancelled: 1 });
        await ft.advance(5000);
        assert.deepStrictEqual(
            writes.map((w) => w.id),
            ['hm.0.a.LEVEL'],
        );
        const bad = await send(a, 'staggeredWrite', { key: 'no spaces allowed', items: [] });
        assert.strictEqual(bad.ok, false);
    });

    console.log(`staggered-write: ${n} tests passed`);
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
