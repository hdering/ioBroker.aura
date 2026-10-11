'use strict';

/**
 * The adapter glue around the remembered hints (lib/statusLatch.js): main.js
 * receiving register/cmd writes, the stored dashboard and the watched datapoints.
 * Production case of 2026-10-10: two empty evcc wallboxes reporting vehicleSoc 0 %.
 *
 *   - two commands written within milliseconds both run, each acknowledged,
 *     with a cmdResult
 *   - ignore holds while the datapoint keeps reporting, and after a restart
 *   - excludeIdPatterns saved in the dashboard applies without any browser
 *   - a bare datapoint name ("vehicleSoc") is replaced by the title above it
 *
 * `@iobroker/adapter-core` is stubbed out, as in countdown-adapter.test.js.
 *
 *   node test/status-latch-adapter.test.js
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

const SOC3 = 'evcc.0.loadpoint.3.status.vehicleSoc';
const SOC4 = 'evcc.0.loadpoint.4.status.vehicleSoc';

function makeAdapter(seed = {}) {
    const a = createAdapter({});
    const objects = new Map();
    const states = new Map(Object.entries(seed.states || {}));
    const foreignStates = new Map(Object.entries(seed.foreign || {}));
    const foreignObjects = new Map(Object.entries(seed.foreignObjects || {}));
    const writes = [];
    const timers = [];
    a.config = {};
    a.setObjectNotExistsAsync = async (id, obj) => {
        if (!objects.has(id)) {
            objects.set(id, obj);
        }
    };
    a.getStateAsync = async (id) => (states.has(id) ? states.get(id) : null);
    a.setStateAsync = async (id, val, ack) => {
        // A real state write takes a moment — that is where commands could interleave.
        await new Promise((r) => setImmediate(r));
        const st =
            val && typeof val === 'object' && 'val' in val ? { val: val.val, ack: !!val.ack } : { val, ack: !!ack };
        states.set(id, st);
        writes.push({ id, ...st });
    };
    a.getForeignStateAsync = async (id) => foreignStates.get(id) || null;
    a.getForeignObjectAsync = async (id) => foreignObjects.get(id) || null;
    a.subscribeStates = () => {};
    a.subscribeForeignStatesAsync = async () => {};
    a.unsubscribeForeignStatesAsync = async () => {};
    a.setInterval = () => 1;
    a.clearInterval = () => {};
    a.setTimeout = (fn) => {
        timers.push(fn);
        return timers.length;
    };
    a.clearTimeout = () => {};
    const flushTimers = async () => {
        while (timers.length) {
            timers.shift()();
        }
        await a._statusOpChain;
        await a._statusWriteChain;
    };
    const json = (id) => {
        const st = states.get(id.replace(/^aura\.0\./, ''));
        return st && st.val ? JSON.parse(st.val) : null;
    };
    const settle = async () => {
        await a._statusOpChain;
        await a._statusWriteChain;
    };
    return { a, states, foreignStates, writes, json, settle, flushTimers };
}

const registration = (source = 'w-bat-liste') =>
    JSON.stringify({
        source,
        cat: 'battery',
        settings: {},
        watch: [
            { id: SOC3, kind: 'pct', threshold: 20, name: 'vehicleSoc' },
            { id: SOC4, kind: 'pct', threshold: 20, name: 'vehicleSoc' },
        ],
    });

const evccSeed = () => ({
    foreign: {
        [SOC3]: { val: 0, ts: Date.now(), lc: 1772197165650 },
        [SOC4]: { val: 0, ts: Date.now(), lc: 1772197165650 },
        'evcc.0.loadpoint.3.status.title': { val: 'Garage links' },
    },
    foreignObjects: {
        'evcc.0.loadpoint.4': { type: 'channel', common: { name: 'Carport' } },
    },
});

async function started(seed) {
    const env = makeAdapter(seed);
    await env.a._initStatusLatch();
    await env.a.onStateChange('aura.0.status.register', { val: registration(), ack: false });
    await env.settle();
    return env;
}

let passed = 0;
async function test(name, fn) {
    try {
        await fn();
        passed++;
        console.log(`  ok   ${name}`);
    } catch (e) {
        console.log(`  FAIL ${name}`);
        console.log(e.stack);
        process.exitCode = 1;
    }
}

(async () => {
    await test('names: title state beside it, else the parent channel', async () => {
        const { json } = await started(evccSeed());
        const list = json('aura.0.status.battery.list');
        const names = Object.fromEntries(list.map((e) => [e.id, e.name]));
        assert.deepStrictEqual(names, { [SOC3]: 'Garage links', [SOC4]: 'Carport' });
    });

    await test('two commands within milliseconds: both run, both acknowledged, cmdResult', async () => {
        const { a, json, writes, settle } = await started(evccSeed());
        assert.strictEqual(json('aura.0.status.battery.list').length, 2);
        // Not awaited one by one — the second arrives while the first is still writing.
        await Promise.all([
            a.onStateChange('aura.0.status.battery.cmd', { val: `remove:${SOC3}`, ack: false }),
            a.onStateChange('aura.0.status.battery.cmd', { val: `remove:${SOC4}`, ack: false }),
        ]);
        await settle();
        assert.deepStrictEqual(json('aura.0.status.battery.list'), []);
        const acks = writes.filter((w) => w.id === 'status.battery.cmd' && w.ack).map((w) => w.val);
        assert.deepStrictEqual(acks, [`remove:${SOC3}`, `remove:${SOC4}`]);
        const results = writes.filter((w) => w.id === 'status.battery.cmdResult').map((w) => JSON.parse(w.val));
        assert.deepStrictEqual(
            results.map((r) => [r.cmd, r.ok, r.done]),
            [
                [`remove:${SOC3}`, true, 1],
                [`remove:${SOC4}`, true, 1],
            ],
        );
        // An error lands in cmdResult too.
        await a.onStateChange('aura.0.status.battery.cmd', { val: 'remove:nope.0.x', ack: false });
        await settle();
        const last = json('aura.0.status.battery.cmdResult');
        assert.strictEqual(last.ok, false);
        assert.ok(/nope/.test(last.errors[0]));
        await a.onStateChange('aura.0.status.battery.cmd', { val: 'gibberish', ack: false });
        await settle();
        assert.ok(/not a command/.test(json('aura.0.status.battery.cmdResult').errors[0]));
    });

    await test('ignore holds while evcc keeps writing, and after a restart', async () => {
        const { a, json, states, settle } = await started(evccSeed());
        await a.onStateChange('aura.0.status.battery.cmd', { val: `ignore:${SOC3}`, ack: false });
        await settle();
        assert.deepStrictEqual(
            json('aura.0.status.battery.list').map((e) => e.id),
            [SOC4],
        );
        const evt = json('aura.0.status.battery.event');
        assert.deepStrictEqual([evt.type, evt.reason, evt.id], ['closed', 'ignored', SOC3]);
        for (let i = 0; i < 5; i++) {
            await a.onStateChange(SOC3, { val: 0, ts: Date.now() + i * 30000, lc: 1772197165650, ack: true });
        }
        await settle();
        assert.ok(!json('aura.0.status.battery.list').some((e) => e.id === SOC3), 'not back');
        assert.deepStrictEqual(json('aura.0.status.battery.history') || [], [], 'no history entry');
        const ignored = json('aura.0.status.battery.ignored');
        assert.deepStrictEqual(
            ignored.map((g) => [g.id, g.name]),
            [[SOC3, 'Garage links']],
        );

        // Restart: a fresh adapter on the same states.
        const seed = evccSeed();
        seed.states = Object.fromEntries(states);
        const b = makeAdapter(seed);
        await b.a._initStatusLatch();
        await b.settle();
        assert.ok(!b.json('aura.0.status.battery.list').some((e) => e.id === SOC3), 'still ignored after restart');
        await b.a.onStateChange('aura.0.status.battery.cmd', { val: `unignore:${SOC3}`, ack: false });
        await b.settle();
        assert.ok(
            b.json('aura.0.status.battery.list').some((e) => e.id === SOC3),
            'back after unignore',
        );
        assert.deepStrictEqual(b.json('aura.0.status.battery.ignored'), []);
    });

    await test('excludeIdPatterns saved in the dashboard applies without a browser', async () => {
        const { a, json, states, settle, flushTimers } = await started(evccSeed());
        const dashboard = {
            version: 1,
            state: {
                layouts: [
                    {
                        id: 'l1',
                        sections: [
                            {
                                tabs: [
                                    {
                                        widgets: [
                                            {
                                                id: 'w-bat-liste',
                                                type: 'statusoverview',
                                                options: { latchBattery: true, excludeIdPatterns: 'evcc.0' },
                                            },
                                        ],
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
        };
        states.set('config.dashboard', { val: JSON.stringify(dashboard), ack: true });
        await a.onStateChange('aura.0.config.dashboard', { val: JSON.stringify(dashboard), ack: true });
        await flushTimers();
        assert.ok(!a._statusLatch.watchedIds().includes(SOC3), 'no longer watched');
        await a.onStateChange('aura.0.status.battery.cmd', { val: `remove:${SOC3},${SOC4}`, ack: false });
        await settle();
        // evcc writes again — the stale registration no longer brings it back.
        await a.onStateChange(SOC3, { val: 0, ts: Date.now(), lc: 1772197165650, ack: true });
        await settle();
        assert.deepStrictEqual(json('aura.0.status.battery.list'), []);
    });

    console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
})();
