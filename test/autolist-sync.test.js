'use strict';

/**
 * Dynamische Liste: the periodic sync in the adapter (#893), lib/autoListSync.js.
 *
 *   - a due list gets the new hits written into config.dashboard, once
 *   - not due (interval not over) → no object read, no write
 *   - syncRemove takes vanished sync-only entries out; own settings stay
 *   - lists in group-defs and popup-config are found and written there
 *   - nothing changed → nothing written
 *   - request(): managed for a saved list with filter, not for unknown / filterless ones;
 *     with `now` it syncs at once regardless of the interval
 *
 *   node test/autolist-sync.test.js
 */

const assert = require('assert');
const { createAutoListSync } = require('../lib/autoListSync');

let passed = 0;
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const obj = (id, type, common) => ({ id, value: { _id: id, type, common } });

const OBJECTS = {
    state: [
        obj('zigbee.0.a.state', 'state', { name: 'A', role: 'switch', type: 'boolean', write: true }),
        obj('zigbee.0.b.state', 'state', { name: 'B', role: 'switch', type: 'boolean', write: true }),
        obj('zigbee.0.c.temp', 'state', { name: 'T', role: 'value.temperature', type: 'number', unit: '°C' }),
    ],
    alias: [obj('alias.0.flur.licht', 'state', { name: 'Flurlicht', role: 'switch', type: 'boolean' })],
    channel: [],
    device: [obj('zigbee.0.a', 'device', { name: 'Lampe A' })],
    enum: [obj('enum.rooms.flur', 'enum', { name: 'Flur', members: ['zigbee.0.a'] })],
};

const autolist = (id, options) => ({ id, type: 'autolist', options: { filterRoles: 'switch', ...options } });
const dashboard = (widgets) => JSON.stringify({ version: 1, state: { layouts: [{ id: 'l', tabs: [{ widgets }] }] } });

function setup(config, { now = 0 } = {}) {
    const store = { dashboard: null, groupDefs: null, popupConfig: null, ...config };
    const writes = [];
    let reads = 0;
    const clock = { t: now };
    const sync = createAutoListSync({
        now: () => clock.t,
        getObjectView: async (type, startkey) => {
            reads++;
            if (startkey === 'alias.') {
                return { rows: type === 'state' ? OBJECTS.alias : [] };
            }
            return { rows: OBJECTS[type] || [] };
        },
        readConfig: async () => ({ ...store }),
        writeConfig: async (key, raw) => {
            writes.push(key);
            store[key] = raw;
        },
    });
    const widget = (key, id) => {
        let found = null;
        const walk = (n) => {
            if (!n || typeof n !== 'object') return;
            if (n.id === id && n.type === 'autolist') found = n;
            Object.values(n).forEach(walk);
        };
        walk(JSON.parse(store[key]));
        return found;
    };
    return { sync, store, writes, clock, widget, reads: () => reads };
}

test('a due list gets the hits, written once', async () => {
    const s = setup({ dashboard: dashboard([autolist('w1')]) });
    s.clock.t = 10 * 60 * 1000;
    await s.sync.tick();
    const ids = s.widget('dashboard', 'w1').options.entries.map((e) => e.id);
    assert.deepStrictEqual(ids.sort(), ['alias.0.flur.licht', 'zigbee.0.a.state', 'zigbee.0.b.state']);
    assert.deepStrictEqual(s.writes, ['dashboard']);
    const a = s.widget('dashboard', 'w1').options.entries.find((e) => e.id === 'zigbee.0.a.state');
    assert.deepStrictEqual(a.rooms, ['Flur']);
});

test('not due → no object read, no write', async () => {
    const s = setup({ dashboard: dashboard([autolist('w1', { syncIntervalMin: 10 })]) });
    s.clock.t = 20 * 60 * 1000;
    await s.sync.tick();
    const reads = s.reads();
    s.clock.t += 5 * 60 * 1000;
    await s.sync.tick();
    assert.strictEqual(s.reads(), reads);
    assert.strictEqual(s.writes.length, 1);
});

test('nothing changed → nothing written', async () => {
    const s = setup({ dashboard: dashboard([autolist('w1')]) });
    s.clock.t = 10 * 60 * 1000;
    await s.sync.tick();
    s.clock.t += 10 * 60 * 1000;
    await s.sync.tick();
    assert.deepStrictEqual(s.writes, ['dashboard']);
});

test('syncRemove drops vanished sync-only entries, keeps own settings', async () => {
    const entries = [
        { id: 'zigbee.0.gone', rooms: [], role: 'switch' },
        { id: 'zigbee.0.mine', label: 'Meins' },
    ];
    const s = setup({ dashboard: dashboard([autolist('w1', { syncRemove: true, entries })]) });
    s.clock.t = 10 * 60 * 1000;
    await s.sync.tick();
    const ids = s.widget('dashboard', 'w1').options.entries.map((e) => e.id);
    assert.ok(!ids.includes('zigbee.0.gone'));
    assert.ok(ids.includes('zigbee.0.mine'));
});

test('lists in group-defs and popup-config are written there', async () => {
    const groupDefs = JSON.stringify({
        state: { defs: { g1: [autolist('gw', { filterRoles: 'value.temperature' })] } },
    });
    const popupConfig = JSON.stringify({ state: { views: [{ id: 'v', widgets: [autolist('pw')] }] } });
    const s = setup({ dashboard: dashboard([]), groupDefs, popupConfig });
    s.clock.t = 10 * 60 * 1000;
    await s.sync.tick();
    assert.deepStrictEqual(s.writes.sort(), ['groupDefs', 'popupConfig']);
    assert.deepStrictEqual(
        s.widget('groupDefs', 'gw').options.entries.map((e) => e.id),
        ['zigbee.0.c.temp'],
    );
    assert.strictEqual(s.widget('popupConfig', 'pw').options.entries.length, 3);
});

test('request: managed only for saved lists with a filter', async () => {
    const s = setup({
        dashboard: dashboard([autolist('w1'), { id: 'w2', type: 'autolist', options: {} }]),
    });
    assert.deepStrictEqual(await s.sync.request('w1', false), { ok: true, managed: true });
    assert.deepStrictEqual(await s.sync.request('w2', false), { ok: true, managed: false });
    assert.deepStrictEqual(await s.sync.request('nope', false), { ok: true, managed: false });
    assert.strictEqual(s.reads(), 0);
});

test('request with now syncs at once, regardless of the interval', async () => {
    const s = setup({ dashboard: dashboard([autolist('w1', { syncIntervalMin: 60 })]) });
    s.clock.t = 1;
    const r = await s.sync.request('w1', true);
    assert.strictEqual(r.managed, true);
    assert.strictEqual(r.changed, true);
    assert.strictEqual(r.added, 3);
    assert.strictEqual(s.widget('dashboard', 'w1').options.entries.length, 3);
});

test('an unreadable dashboard is left alone', async () => {
    const s = setup({ dashboard: '{broken' });
    s.clock.t = 10 * 60 * 1000;
    await s.sync.tick();
    assert.deepStrictEqual(s.writes, []);
    assert.strictEqual(s.reads(), 0);
});

(async () => {
    for (const { name, fn } of tests) {
        try {
            await fn();
            passed++;
            console.log(`  ok   ${name}`);
        } catch (e) {
            console.log(`  FAIL ${name}\n       ${e.message}`);
            process.exitCode = 1;
        }
    }
    console.log(`\n${passed}/${tests.length} passed`);
})();
