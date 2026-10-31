'use strict';

/**
 * Statusübersicht discovery in the adapter (#882): lib/statusDiscovery.js.
 *
 *   - finds the same categories as the widget (window, unreach, battery, rooms, names)
 *   - HomeMatic LOWBAT: a mains actuator stays out, a library-known battery device
 *     without voltage comes in, a manual battery type brings one in
 *   - aliases are found, options scope the result (catWindow off, excludeIds)
 *   - answers with the device/channel models above the hits only
 *   - one object read for several requests; read again once the TTL dropped it
 *
 *   node test/status-discovery.test.js
 */

const assert = require('assert');
const { createStatusDiscovery } = require('../lib/statusDiscovery');

let passed = 0;
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const obj = (id, type, common, native = {}) => ({ id, value: { _id: id, type, common, native } });

const OBJECTS = {
    state: [
        // Window contact in the living room.
        obj('zigbee.0.aaa.contact', 'state', { name: 'Kontakt', role: 'sensor.window', type: 'boolean' }),
        // Battery-powered HomeMatic thermostat: no voltage, known by model (HM-CC-RT-DN).
        obj('hm-rpc.0.RT0001.0.LOWBAT', 'state', { name: 'LOWBAT', role: 'indicator.lowbat', type: 'boolean' }),
        obj('hm-rpc.0.RT0001.0.UNREACH', 'state', { name: 'UNREACH', role: 'indicator.unreach', type: 'boolean' }),
        // HomeMatic mains actuator: LOWBAT flag, but not a battery device.
        obj('hm-rpc.0.SW0001.0.LOWBAT', 'state', { name: 'LOWBAT', role: 'indicator.lowbat', type: 'boolean' }),
        // Something no category wants.
        obj('0_userdata.0.temp', 'state', { name: 'Temperatur', role: 'value.temperature', type: 'number' }),
    ],
    alias: [obj('alias.0.flur.fenster', 'state', { name: 'Flurfenster', role: 'sensor.window', type: 'boolean' })],
    channel: [obj('zigbee.0.aaa', 'channel', { name: 'Fenster Wohnzimmer' })],
    device: [
        obj('hm-rpc.0.RT0001', 'device', { name: 'Heizung Bad' }, { TYPE: 'HM-CC-RT-DN' }),
        obj('hm-rpc.0.SW0001', 'device', { name: 'Steckdose' }, { TYPE: 'HM-LC-Sw1-Pl' }),
        obj('hm-rpc.0.UNUSED', 'device', { name: 'Unbeteiligt' }, { TYPE: 'HM-CC-RT-DN' }),
    ],
    enum: [obj('enum.rooms.living', 'enum', { name: { de: 'Wohnzimmer', en: 'Living' }, members: ['zigbee.0.aaa'] })],
    instance: [obj('system.adapter.zigbee.0', 'instance', { enabled: true })],
};

function fakeObjects() {
    const calls = [];
    const getObjectView = async (type, startkey) => {
        calls.push(`${type}:${startkey}`);
        if (type === 'state') {
            return { rows: startkey === 'alias.' ? OBJECTS.alias : OBJECTS.state };
        }
        return { rows: OBJECTS[type] ?? [] };
    };
    return { getObjectView, calls };
}

const byId = (res) => new Map(res.candidates.map((c) => [c.dp.id, c]));

test('finds window, unreach and battery rows with names and rooms', async () => {
    const d = createStatusDiscovery(fakeObjects());
    const res = await d.discover({}, {});
    assert.strictEqual(res.ok, true);
    const m = byId(res);
    assert.strictEqual(m.get('zigbee.0.aaa.contact')?.cat, 'window');
    assert.strictEqual(m.get('zigbee.0.aaa.contact')?.dp.name, 'Fenster Wohnzimmer › Kontakt');
    assert.deepStrictEqual(m.get('zigbee.0.aaa.contact')?.dp.rooms, ['Wohnzimmer']);
    assert.strictEqual(m.get('hm-rpc.0.RT0001.0.UNREACH')?.cat, 'unreach');
    assert.ok(!m.has('0_userdata.0.temp'));
    d.stop();
});

test('HomeMatic LOWBAT: library device in, mains actuator out', async () => {
    const d = createStatusDiscovery(fakeObjects());
    const m = byId(await d.discover({}, {}));
    assert.strictEqual(m.get('hm-rpc.0.RT0001.0.LOWBAT')?.cat, 'battery');
    assert.ok(!m.has('hm-rpc.0.SW0001.0.LOWBAT'), 'mains actuator must stay out');
    d.stop();
});

test('a manual battery type brings a device in', async () => {
    const d = createStatusDiscovery(fakeObjects());
    const m = byId(await d.discover({}, { 'hm-rpc.0.SW0001': { type: 'CR2032' } }));
    assert.strictEqual(m.get('hm-rpc.0.SW0001.0.LOWBAT')?.cat, 'battery');
    d.stop();
});

test('aliases are found', async () => {
    const d = createStatusDiscovery(fakeObjects());
    const m = byId(await d.discover({}, {}));
    assert.strictEqual(m.get('alias.0.flur.fenster')?.cat, 'window');
    d.stop();
});

test('options scope the result', async () => {
    const d = createStatusDiscovery(fakeObjects());
    const m = byId(await d.discover({ catWindow: false, excludeIds: 'hm-rpc.0.RT0001.0.UNREACH' }, {}));
    assert.ok(!m.has('zigbee.0.aaa.contact'));
    assert.ok(!m.has('alias.0.flur.fenster'));
    assert.ok(!m.has('hm-rpc.0.RT0001.0.UNREACH'));
    assert.ok(m.has('hm-rpc.0.RT0001.0.LOWBAT'));
    d.stop();
});

test('device models: only those above the hits', async () => {
    const d = createStatusDiscovery(fakeObjects());
    const res = await d.discover({}, {});
    const ids = res.devices.map((x) => x.id).sort();
    assert.deepStrictEqual(ids, ['hm-rpc.0.RT0001', 'zigbee.0.aaa']);
    const rt = res.devices.find((x) => x.id === 'hm-rpc.0.RT0001');
    assert.strictEqual(rt.kind, 'device');
    assert.strictEqual(rt.model, 'HM-CC-RT-DN');
    assert.strictEqual(rt.name, 'Heizung Bad');
    d.stop();
});

test('one object read for several requests, again after the TTL', async () => {
    const f = fakeObjects();
    const d = createStatusDiscovery({ ...f, ttlMs: 30 });
    await Promise.all([d.discover({}, {}), d.discover({ catLight: false }, {})]);
    await d.discover({}, {});
    assert.strictEqual(f.calls.length, 6, `six views once, got ${f.calls.join(', ')}`);
    await new Promise((r) => setTimeout(r, 60));
    await d.discover({}, {});
    assert.strictEqual(f.calls.length, 12);
    d.stop();
});

test('answer survives the trip through sendTo (JSON)', async () => {
    const d = createStatusDiscovery(fakeObjects());
    const res = JSON.parse(JSON.stringify(await d.discover({ latchBattery: true }, {})));
    const m = byId(res);
    assert.deepStrictEqual(m.get('zigbee.0.aaa.contact')?.dp.rooms, ['Wohnzimmer']);
    assert.ok(Array.isArray(res.devices));
    d.stop();
});

(async () => {
    for (const t of tests) {
        try {
            await t.fn();
            passed++;
            console.log(`  ok   ${t.name}`);
        } catch (e) {
            console.log(`  FAIL ${t.name}\n${e.stack}`);
            process.exitCode = 1;
        }
    }
    console.log(`\n${passed} passed`);
    process.exit(process.exitCode || 0);
})();
