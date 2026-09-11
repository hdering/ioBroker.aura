'use strict';

/**
 * Unit tests for the idle-return control datapoints (issue #638).
 *
 * The frontend's auto-return can be paused and re-timed from ioBroker:
 *   <ns>.idleReturn.snoozeMinutes / .delay                 — every client
 *   <ns>.clients.<id>.idleReturn.snoozeMinutes / .delay    — one client
 *
 * The pause is a countdown owned by the ADAPTER, not a switch: it has to expire
 * on its own, or a wall tablet that was "paused for a moment" stays parked on a
 * secondary tab for days.
 *
 * main.js is loaded with @iobroker/adapter-core stubbed out, so the adapter class
 * can be instantiated without a running js-controller.
 */

const assert = require('assert');

// ── Stub @iobroker/adapter-core before main.js pulls it in ────────────────────
class FakeAdapter {
    constructor(options) {
        this.name = options.name;
        this.namespace = 'aura.0';
        this.log = { info() {}, warn() {}, error() {}, debug() {} };
    }
    on() {}
}
const corePath = require.resolve('@iobroker/adapter-core');
require.cache[corePath] = {
    id: corePath,
    filename: corePath,
    loaded: true,
    exports: { Adapter: FakeAdapter },
};

const createAdapter = require('../main.js');

function makeAdapter() {
    const a = createAdapter({});
    const objects = new Map();
    const states = new Map(); // full id → { val, ack }

    a._objects = objects;
    a._states = states;
    const rel = (id) => (id.startsWith('aura.0.') ? id.slice('aura.0.'.length) : id);
    const full = (id) => (id.startsWith('aura.0.') ? id : `aura.0.${id}`);

    a.getObjectAsync = async (id) => objects.get(rel(id)) || null;
    a.setObjectNotExistsAsync = async (id, obj) => {
        if (!objects.has(rel(id))) objects.set(rel(id), obj);
    };
    a.getForeignStateAsync = async (id) => states.get(full(id)) || null;
    a.setForeignStateAsync = async (id, value) => {
        states.set(full(id), value && typeof value === 'object' ? value : { val: value, ack: true });
    };
    a.setStateAsync = async (id, value) => a.setForeignStateAsync(full(id), value);
    a.getStatesAsync = async (pattern) => {
        const re = new RegExp(`^${pattern.replace(/[.]/g, '\\.').replace(/\*/g, '[^.]+')}$`);
        const out = {};
        for (const [id, st] of states) if (re.test(id)) out[id] = st;
        return out;
    };
    return a;
}

const CLIENT_DPS = [
    'clients.tablet.idleReturn',
    'clients.tablet.idleReturn.snoozeMinutes',
    'clients.tablet.idleReturn.delay',
];

(async () => {
    // ── The per-client controls are created with sane definitions ────────────
    {
        const a = makeAdapter();
        await a._ensureIdleReturnDps('tablet');
        for (const id of CLIENT_DPS) assert.ok(a._objects.has(id), `missing object: ${id}`);

        const snooze = a._objects.get('clients.tablet.idleReturn.snoozeMinutes').common;
        assert.strictEqual(snooze.type, 'number');
        assert.strictEqual(snooze.write, true, 'a script must be able to write the pause');
        assert.strictEqual(snooze.def, 0, 'no pause by default');
        assert.strictEqual(snooze.unit, 'min');

        const delay = a._objects.get('clients.tablet.idleReturn.delay').common;
        // -1, not 0: 0 is a real setting here (auto-return off for this device).
        assert.strictEqual(delay.def, -1, 'an unset delay must follow the dashboard setting');
        assert.strictEqual(delay.unit, 's');
        console.log('✓ per-client idle-return datapoints are created');
    }

    // ── Idempotent, and it never clobbers a running pause ────────────────────
    {
        const a = makeAdapter();
        await a._ensureIdleReturnDps('tablet');
        await a.setStateAsync('clients.tablet.idleReturn.snoozeMinutes', { val: 12, ack: true });
        const before = a._objects.size;
        await a._ensureIdleReturnDps('tablet');
        assert.strictEqual(a._objects.size, before, 'no object may be created twice');
        assert.strictEqual(a._states.get('aura.0.clients.tablet.idleReturn.snoozeMinutes').val, 12);
        console.log('✓ a second call leaves an existing pause alone');
    }

    // ── The tree backfill reaches clients that predate the feature ───────────
    {
        const a = makeAdapter();
        // A complete pre-#638 tree: _ensureClientTree short-circuits on it, so the
        // controls can only arrive through their own backfill.
        a._objects.set('clients.old.navigate.url', { type: 'state', common: {}, native: {} });
        const created = await a._ensureClientTree('old');
        assert.strictEqual(created, false, 'an existing tree is left alone');
        assert.ok(!a._objects.has('clients.old.idleReturn.delay'), 'nothing is created from there');
        await a._ensureIdleReturnDps('old');
        assert.ok(a._objects.has('clients.old.idleReturn.delay'), 'the backfill must reach it');
        console.log('✓ existing clients are backfilled');
    }

    // ── Writes are clamped and acked ─────────────────────────────────────────
    {
        const a = makeAdapter();
        const id = 'aura.0.clients.tablet.idleReturn.snoozeMinutes';
        await a.onStateChange(id, { val: 15, ack: false });
        assert.deepStrictEqual(a._states.get(id), { val: 15, ack: true }, 'a plain write is acked');

        await a.onStateChange(id, { val: -5, ack: false });
        assert.strictEqual(a._states.get(id).val, 0, 'a negative pause is no pause');

        await a.onStateChange(id, { val: 99999, ack: false });
        assert.strictEqual(a._states.get(id).val, 1440, 'a pause is capped at a day');

        await a.onStateChange(id, { val: 'soon', ack: false });
        assert.strictEqual(a._states.get(id).val, 0, 'nonsense is no pause');

        const delayId = 'aura.0.idleReturn.delay';
        await a.onStateChange(delayId, { val: 45, ack: false });
        assert.deepStrictEqual(a._states.get(delayId), { val: 45, ack: true });
        await a.onStateChange(delayId, { val: -9, ack: false });
        assert.strictEqual(a._states.get(delayId).val, -1, 'anything below 0 means "use the setting"');
        await a.onStateChange(delayId, { val: 0, ack: false });
        assert.strictEqual(a._states.get(delayId).val, 0, 'an explicit 0 survives — it switches it off');
        console.log('✓ control writes are normalised and acknowledged');
    }

    // ── An acknowledged write is not re-processed ────────────────────────────
    {
        const a = makeAdapter();
        const id = 'aura.0.clients.tablet.idleReturn.snoozeMinutes';
        a._states.set(id, { val: 7, ack: true });
        await a.onStateChange(id, { val: 7, ack: true });
        assert.deepStrictEqual(a._states.get(id), { val: 7, ack: true }, 'the adapter own ack must not loop');
        console.log('✓ acknowledged values are left alone');
    }

    // ── The countdown expires every pause, on both scopes ────────────────────
    {
        const a = makeAdapter();
        const globalId = 'aura.0.idleReturn.snoozeMinutes';
        const clientId = 'aura.0.clients.tablet.idleReturn.snoozeMinutes';
        const otherId = 'aura.0.clients.kitchen.idleReturn.snoozeMinutes';
        a._states.set(globalId, { val: 2, ack: true });
        a._states.set(clientId, { val: 3, ack: true });
        a._states.set(otherId, { val: 0, ack: true });

        await a._idleReturnTick();
        assert.strictEqual(a._states.get(globalId).val, 1, 'the global pause counts down');
        assert.strictEqual(a._states.get(clientId).val, 2, 'every client pause counts down');
        assert.strictEqual(a._states.get(otherId).val, 0, 'an idle client stays at 0');

        await a._idleReturnTick();
        await a._idleReturnTick();
        assert.strictEqual(a._states.get(globalId).val, 0, 'the pause reaches 0');
        assert.strictEqual(a._states.get(clientId).val, 0);

        await a._idleReturnTick();
        assert.strictEqual(a._states.get(globalId).val, 0, 'and never goes negative');
        assert.strictEqual(a._states.get(globalId).ack, true, 'the countdown writes acknowledged values');
        console.log('✓ a pause always expires by itself');
    }

    // ── A tick with nothing to do is harmless ────────────────────────────────
    {
        const a = makeAdapter();
        await a._idleReturnTick();
        assert.strictEqual(a._states.size, 0, 'a fresh instance has nothing to count down');
        console.log('✓ the countdown copes with a fresh instance');
    }

    console.log('\nAll idle-return tests passed.');
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
