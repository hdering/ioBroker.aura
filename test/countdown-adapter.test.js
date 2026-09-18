'use strict';

/**
 * The adapter glue around the countdown engine (#675): main.js receiving the
 * widget's config and cmd states and writing the target datapoint.
 *
 * lib/countdowns.js is covered by countdowns.test.js on its own; this test
 * drives the real onStateChange / onObjectChange / onMessage paths of main.js
 * with @iobroker/adapter-core stubbed out, the way messages.test.js does.
 *
 *   node test/countdown-adapter.test.js
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
const { CountdownEngine } = require('../lib/countdowns');

function makeAdapter() {
    const a = createAdapter({});
    const objects = new Map();
    const states = new Map();
    const foreign = [];
    a.config = {};
    a.getObjectAsync = async (id) => objects.get(id) || null;
    a.setObjectAsync = async (id, obj) => void objects.set(id, obj);
    a.setObjectNotExistsAsync = async (id, obj) => {
        if (!objects.has(id)) {
            objects.set(id, obj);
        }
    };
    a.extendObjectAsync = async (id, patch) => {
        const cur = objects.get(id) || { common: {} };
        objects.set(id, { ...cur, common: { ...cur.common, ...(patch.common || {}) } });
    };
    a.delObjectAsync = async (id) => void objects.delete(id);
    a.getStateAsync = async (id) => (states.has(id) ? states.get(id) : null);
    a.setStateAsync = async (id, val, ack) => {
        if (val && typeof val === 'object' && 'val' in val) {
            states.set(id, { val: val.val, ack: !!val.ack });
        } else {
            states.set(id, { val, ack: !!ack });
        }
    };
    a.setForeignStateAsync = async (id, val, ack) => {
        foreign.push({ id, val, ack });
    };
    a.getChannelsOfAsync = async (ns) =>
        [...objects.entries()]
            .filter(([id, o]) => o.type === 'channel' && id.startsWith(`${ns}.`))
            .map(([id, o]) => ({ _id: `aura.0.${id}`, common: o.common }));
    a._replies = [];
    a.sendTo = (_from, _command, result) => a._replies.push(result);

    // What onReady sets up for the countdowns (the rest of onReady needs a controller).
    a.subscribeStates = () => {};
    a.subscribeObjects = () => {};
    a._countdownObjectsEnsured = new Set();
    a._countdowns = new CountdownEngine({
        log: a.log,
        writeStatus: (key, status) => a._writeCountdownStatus(key, status),
        writeTarget: (dp, raw, why) => a._writeCountdownTarget(dp, raw, why),
    });
    a._objects = objects;
    a._states = states;
    a._foreign = foreign;
    a._val = (id) => (states.has(id) ? states.get(id).val : undefined);
    return a;
}

const write = (a, rel, val, ack = false) => a.onStateChange(`aura.0.${rel}`, { val, ack });

(async () => {
    // ── config arrives, then start / stop through the cmd state ─────────────
    {
        const a = makeAdapter();
        const cfg = { durationSec: 1800, targetDp: 'hue.0.pump.on', valueOnStart: 'true', valueOnEnd: 'false' };
        await write(a, 'countdowns.k1.config', JSON.stringify(cfg));
        assert.strictEqual(a._val('countdowns.k1.state'), 'idle', 'config ingest publishes idle');
        assert.strictEqual(a._val('countdowns.k1.durationMs'), 1_800_000);
        assert.ok(a._objects.has('countdowns.k1'), 'channel object created');
        assert.ok(a._objects.has('countdowns.k1.cmd'), 'cmd object created');

        await write(a, 'countdowns.k1.cmd', 'start');
        assert.strictEqual(a._val('countdowns.k1.state'), 'running');
        assert.ok(a._val('countdowns.k1.endTs') > Date.now(), 'endTs in the future');
        assert.deepStrictEqual(a._states.get('countdowns.k1.cmd'), { val: 'start', ack: true }, 'cmd acked');
        assert.deepStrictEqual(a._foreign, [{ id: 'hue.0.pump.on', val: true, ack: false }], 'start writes true');

        await write(a, 'countdowns.k1.cmd', 'stop');
        assert.strictEqual(a._val('countdowns.k1.state'), 'idle');
        assert.strictEqual(a._val('countdowns.k1.endTs'), 0);
        assert.deepStrictEqual(a._foreign[1], { id: 'hue.0.pump.on', val: false, ack: false }, 'stop switches back');

        // acked cmd echoes (our own ack) are ignored
        await write(a, 'countdowns.k1.cmd', 'start', true);
        assert.strictEqual(a._val('countdowns.k1.state'), 'idle', 'acked cmd is not re-executed');

        // numbers and text are parsed like the Zeitschaltuhr does
        await write(a, 'countdowns.k1.config', JSON.stringify({ ...cfg, valueOnStart: '75', valueOnEnd: 'aus' }));
        await write(a, 'countdowns.k1.cmd', 'start');
        await write(a, 'countdowns.k1.cmd', 'end');
        assert.deepStrictEqual(
            a._foreign.slice(2).map((f) => f.val),
            [75, 'aus'],
        );
        a._countdowns.dispose();
    }

    // ── empty values write nothing — the way "leer = nichts schreiben" promises ──
    {
        const a = makeAdapter();
        await write(
            a,
            'countdowns.k2.config',
            JSON.stringify({ durationSec: 60, targetDp: 'x.y', valueOnStart: '', valueOnEnd: '' }),
        );
        await write(a, 'countdowns.k2.cmd', 'start');
        await write(a, 'countdowns.k2.cmd', 'stop');
        assert.deepStrictEqual(a._foreign, []);
        // no target at all: commands still run, nothing is written
        await write(
            a,
            'countdowns.k2.config',
            JSON.stringify({ durationSec: 60, valueOnStart: 'true', valueOnEnd: 'false' }),
        );
        await write(a, 'countdowns.k2.cmd', 'start');
        assert.strictEqual(a._val('countdowns.k2.state'), 'running');
        assert.deepStrictEqual(a._foreign, []);
        a._countdowns.dispose();
    }

    // ── config object appearing after the fact is ingested (copy of a widget) ──
    {
        const a = makeAdapter();
        a._states.set('countdowns.k3.config', { val: JSON.stringify({ durationSec: 30 }), ack: false });
        await a.onObjectChange('aura.0.countdowns.k3.config', { type: 'state', common: {} });
        assert.strictEqual(a._val('countdowns.k3.durationMs'), 30_000);
        await a.onObjectChange('aura.0.countdowns.k3.config', null);
        assert.strictEqual(a._countdowns.has('k3'), false, 'deleted config forgets the countdown');
    }

    // ── onMessage: list / rename / delete ────────────────────────────────────
    {
        const a = makeAdapter();
        await write(a, 'countdowns.k4.config', JSON.stringify({ durationSec: 10, title: 'Pumpe' }));
        const reply = (msg) => a.onMessage({ ...msg, from: 'test', callback: {} });
        await reply({ command: 'listCountdowns', message: {} });
        assert.deepStrictEqual(a._replies.pop().widgetIds, ['k4']);
        await reply({ command: 'renameCountdown', message: { widgetId: 'k4', title: 'Zirkulation' } });
        assert.strictEqual(a._objects.get('countdowns.k4').common.name, 'Zirkulation');
        await reply({ command: 'deleteCountdown', message: { widgetId: 'k4' } });
        assert.strictEqual(a._objects.has('countdowns.k4'), false);
        assert.strictEqual(a._objects.has('countdowns.k4.cmd'), false);
        assert.strictEqual(a._countdowns.has('k4'), false);
        await reply({ command: 'deleteCountdown', message: { widgetId: '../evil' } });
        assert.strictEqual(a._replies.pop().ok, false, 'invalid key rejected');
    }

    console.log('countdown-adapter.test.js: all assertions passed');
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
