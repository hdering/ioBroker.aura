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

/** Objects from the forum report: classic HM contacts (value.window), a HM group, a Shelly. */
function forumObjects() {
    const s = (id, common) => obj(id, 'state', common);
    const views = {
        state: [
            // HM-Sec-SCo via hm-rega: number 0/1, CLOSED/OPEN, role value.window.
            s('hm-rpc.0.00109A498FCE8F.1.STATE', {
                name: 'EG_Küche_Fenster:1.STATE',
                role: 'value.window',
                type: 'number',
                states: { 0: 'CLOSED', 1: 'OPEN' },
            }),
            s('hm-rpc.0.00109A498FCE90.1.STATE', {
                name: 'EG_Küche_Fenster2:1.STATE',
                role: 'value.window',
                type: 'number',
                states: { 0: 'CLOSED', 1: 'OPEN' },
            }),
            // HmIP heating group of the same room: only mirrors the contacts.
            s('hm-rpc.1.INT0000001.1.WINDOW_STATE', {
                name: 'Küche Gruppe',
                role: 'sensor.window',
                type: 'number',
                states: { 0: 'CLOSED', 1: 'OPEN' },
            }),
            // Group in a room without its own contact: the only hint there is.
            s('hm-rpc.1.INT0000002.1.WINDOW_STATE', {
                name: 'Bad Gruppe',
                role: 'sensor.window',
                type: 'number',
                states: { 0: 'CLOSED', 1: 'OPEN' },
            }),
            // Shelly flood sensor: generic channel name, real name on the device.
            s('shelly.0.SHWT-1#abc#1.Sensor.flood', { name: 'Flood', role: 'sensor.alarm.flood', type: 'boolean' }),
        ],
        channel: [
            obj('hm-rpc.0.00109A498FCE8F.1', 'channel', { name: 'EG_Küche_Fenster:1' }),
            obj('hm-rpc.0.00109A498FCE90.1', 'channel', { name: 'EG_Küche_Fenster2:1' }),
            obj('shelly.0.SHWT-1#abc#1.Sensor', 'channel', { name: 'Channel sensor' }),
        ],
        device: [obj('shelly.0.SHWT-1#abc#1', 'device', { name: 'Wassermelder Keller' })],
        enum: [
            obj('enum.rooms.kitchen', 'enum', {
                name: 'Küche',
                members: ['hm-rpc.0.00109A498FCE8F', 'hm-rpc.0.00109A498FCE90', 'hm-rpc.1.INT0000001'],
            }),
            obj('enum.rooms.bath', 'enum', { name: 'Bad', members: ['hm-rpc.1.INT0000002'] }),
        ],
        instance: [],
    };
    return {
        getObjectView: async (type, startkey) =>
            type === 'state' && startkey === 'alias.' ? { rows: [] } : { rows: views[type] ?? [] },
    };
}

test('value.window contacts are found, one row per window', async () => {
    const d = createStatusDiscovery(forumObjects());
    const m = byId(await d.discover({}, {}));
    assert.strictEqual(m.get('hm-rpc.0.00109A498FCE8F.1.STATE')?.cat, 'window');
    assert.strictEqual(m.get('hm-rpc.0.00109A498FCE90.1.STATE')?.cat, 'window');
    d.stop();
});

test('a group window state gives way to the contacts of its room', async () => {
    const d = createStatusDiscovery(forumObjects());
    const m = byId(await d.discover({}, {}));
    assert.ok(!m.has('hm-rpc.1.INT0000001.1.WINDOW_STATE'), 'kitchen group duplicates its contacts');
    assert.strictEqual(m.get('hm-rpc.1.INT0000002.1.WINDOW_STATE')?.cat, 'window', 'bath has no contact');
    d.stop();
});

test('names: repeated channel prefix dropped, generic channel gives way to the device', async () => {
    const d = createStatusDiscovery(forumObjects());
    const m = byId(await d.discover({}, {}));
    assert.strictEqual(m.get('hm-rpc.0.00109A498FCE8F.1.STATE')?.dp.name, 'EG_Küche_Fenster:1 › STATE');
    assert.strictEqual(m.get('shelly.0.SHWT-1#abc#1.Sensor.flood')?.dp.name, 'Wassermelder Keller › Flood');
    d.stop();
});

/** Real dumps from the forum (#424): HmIP heating group device, Shelly Flood battery and name state. */
function forumDumpObjects() {
    const s = (id, common) => obj(id, 'state', common);
    const views = {
        state: [
            s('hm-rpc.1.INT0000002.1.WINDOW_STATE', {
                name: 'EG_Heizung_WZ INT0000002:1.WINDOW_STATE',
                role: 'sensor.window',
                type: 'number',
                states: { 0: 'CLOSED', 1: 'OPEN' },
            }),
            s('hm-rpc.0.00109A498FCE8F.1.STATE', {
                name: 'EG_WZ_Fenster:1.STATE',
                role: 'value.window',
                type: 'number',
                states: { 0: 'CLOSED', 1: 'OPEN' },
            }),
            s('shelly.0.SHWT-1#C8AA63#1.sensor.battery', {
                name: 'Battery capacity',
                role: 'value.battery',
                type: 'number',
                unit: '%',
                min: 0,
                max: 100,
            }),
            s('shelly.0.SHWT-1#C8AA63#1.name', {
                name: 'Channel name',
                role: 'info.name',
                type: 'string',
                write: true,
            }),
        ],
        channel: [obj('hm-rpc.0.00109A498FCE8F.1', 'channel', { name: 'EG_WZ_Fenster:1' })],
        device: [
            obj('hm-rpc.1.INT0000002', 'device', { name: 'EG_Heizung_WZ INT0000002' }),
            obj('shelly.0.SHWT-1#C8AA63#1', 'device', {
                name: 'Flood Heizraum',
                desc: 'Gen 1',
                statusStates: { onlineId: 'shelly.0.SHWT-1#C8AA63#1.online' },
            }),
        ],
        enum: [
            obj('enum.rooms.living', 'enum', {
                name: 'Wohnzimmer',
                members: ['hm-rpc.1.INT0000002', 'hm-rpc.0.00109A498FCE8F'],
            }),
        ],
        instance: [],
    };
    return {
        getObjectView: async (type, startkey) =>
            type === 'state' && startkey === 'alias.' ? { rows: [] } : { rows: views[type] ?? [] },
    };
}

test('forum dumps: HmIP heating group yields to the contact, Shelly battery named after the device', async () => {
    const d = createStatusDiscovery(forumDumpObjects());
    const m = byId(await d.discover({}, {}));
    assert.ok(!m.has('hm-rpc.1.INT0000002.1.WINDOW_STATE'), 'group duplicates the room contact');
    assert.strictEqual(m.get('hm-rpc.0.00109A498FCE8F.1.STATE')?.cat, 'window');
    const bat = m.get('shelly.0.SHWT-1#C8AA63#1.sensor.battery');
    assert.strictEqual(bat?.cat, 'battery');
    assert.strictEqual(bat?.dp.name, 'Flood Heizraum › Battery capacity');
    assert.ok(!m.has('shelly.0.SHWT-1#C8AA63#1.name'), 'info.name is no status');
    d.stop();
});

/** Battery voltages (#1000): HmIP OPERATING_VOLTAGE + LOWBAT, Zigbee mV + %, a 230 V plug. */
function voltageObjects() {
    const s = (id, common) => obj(id, 'state', common);
    const views = {
        state: [
            s('hm-rpc.1.HMIP01.0.LOW_BAT', { name: 'LOW_BAT', role: 'indicator.lowbat', type: 'boolean' }),
            s('hm-rpc.1.HMIP01.0.OPERATING_VOLTAGE', {
                name: 'OPERATING_VOLTAGE',
                role: 'value.voltage',
                type: 'number',
                unit: 'V',
            }),
            s('zigbee.0.00158d01.voltage', {
                name: 'Battery voltage',
                role: 'battery.voltage',
                type: 'number',
                unit: 'mV',
            }),
            s('zigbee.0.00158d02.voltage', {
                name: 'Battery voltage',
                role: 'battery.voltage',
                type: 'number',
                unit: 'mV',
            }),
            s('zigbee.0.00158d02.battery', { name: 'Battery', role: 'value.battery', type: 'number', unit: '%' }),
            s('shelly.0.PLUG01.Relay0.Voltage', { name: 'Voltage', role: 'value.voltage', type: 'number', unit: 'V' }),
        ],
        channel: [],
        device: [
            obj('hm-rpc.1.HMIP01', 'device', { name: 'Fensterkontakt Bad' }),
            obj('zigbee.0.00158d01', 'device', { name: 'Taster Flur' }),
            obj('zigbee.0.00158d02', 'device', { name: 'Klima Küche' }),
        ],
        enum: [],
        instance: [],
    };
    return {
        getObjectView: async (type, startkey) =>
            type === 'state' && startkey === 'alias.' ? { rows: [] } : { rows: views[type] ?? [] },
    };
}

test('battery kinds: voltages only when chosen, one row per device, mains voltage stays out', async () => {
    const d = createStatusDiscovery(voltageObjects());
    const def = byId(await d.discover({}, {}));
    assert.ok(def.has('hm-rpc.1.HMIP01.0.LOW_BAT'), 'default keeps LOWBAT');
    assert.ok(!def.has('hm-rpc.1.HMIP01.0.OPERATING_VOLTAGE'), 'default leaves voltages out');
    assert.ok(!def.has('zigbee.0.00158d01.voltage'));

    const all = byId(await d.discover({ batteryKinds: ['bool', 'percent', 'volt', 'millivolt'] }, {}));
    assert.ok(all.has('hm-rpc.1.HMIP01.0.OPERATING_VOLTAGE'), 'voltage row');
    assert.ok(!all.has('hm-rpc.1.HMIP01.0.LOW_BAT'), 'voltage replaces the flag of the same device');
    assert.ok(all.has('zigbee.0.00158d01.voltage'), 'mV of a device without %');
    assert.ok(all.has('zigbee.0.00158d02.battery'), 'percent stays');
    assert.ok(!all.has('zigbee.0.00158d02.voltage'), 'percent wins over the voltage');
    assert.ok(!all.has('shelly.0.PLUG01.Relay0.Voltage'), 'mains voltage is no battery');

    const voltOnly = byId(await d.discover({ batteryKinds: ['volt'] }, {}));
    assert.deepStrictEqual([...voltOnly.keys()].sort(), ['hm-rpc.1.HMIP01.0.OPERATING_VOLTAGE']);
    d.stop();
});

test('battery kinds: voltage rows are judged against the volt threshold', () => {
    const shared = require('../lib/shared/auraShared');
    const dp = (id, unit) => ({ id, name: 'x', type: 'number', unit, role: 'value.voltage', rooms: [], funcs: [] });
    const v = dp('hm-rpc.1.A.0.OPERATING_VOLTAGE', 'V');
    const mv = { ...dp('zigbee.0.b.voltage', 'mV'), role: 'battery.voltage' };
    assert.strictEqual(shared.evaluateItem(v, 2.9, 'battery', {}, 0, true).severity, 'ok');
    assert.strictEqual(shared.evaluateItem(v, 2.9, 'battery', {}, 0, true).label, '2,9 V');
    assert.strictEqual(shared.evaluateItem(v, 2.3, 'battery', {}).severity, 'warn');
    assert.strictEqual(shared.evaluateItem(v, 2.3, 'battery', { batteryVoltThreshold: 2.2 }), null);
    assert.strictEqual(shared.evaluateItem(mv, 2950, 'battery', {}, 0, true).label, '2,95 V');
    assert.strictEqual(shared.evaluateItem(mv, 2300, 'battery', {}).severity, 'warn');
    assert.strictEqual(shared.evaluateItem(v, 0, 'battery', {}), null, '0 V measures nothing');
    assert.strictEqual(shared.evaluateItem(v, 0, 'battery', {}, 0, true), null, '0 V: no row even when listing all');
    assert.strictEqual(shared.evaluateItem(mv, 0, 'battery', {}, 0, true), null, '0 mV: no row either');
});

test('batteryExtraPatterns: MQTT datapoints without a battery role come in', async () => {
    const views = {
        state: [
            // Shelly Flood mirrored over MQTT: role "variable", type mixed, value as text.
            obj('mqtt.0.shelly.1.SHWT-1_08F9E0444075_1.sensor.battery', 'state', {
                name: 'battery',
                role: 'variable',
                type: 'mixed',
            }),
            obj('mqtt.0.shelly.1.SHWT-1_08F9E0444075_1.sensor.flood', 'state', {
                name: 'flood',
                role: 'variable',
                type: 'mixed',
            }),
            // A home storage battery - must stay out unless a pattern names it.
            obj('modbus.0.storage.battery', 'state', { name: 'SoC', role: 'value', type: 'number', unit: '%' }),
            obj('mqtt.0.other.lowbat', 'state', { name: 'lowbat', role: 'variable', type: 'boolean' }),
        ],
    };
    const d = createStatusDiscovery({
        getObjectView: async (type, startkey) =>
            type === 'state' && startkey === 'alias.' ? { rows: [] } : { rows: views[type] ?? [] },
    });
    const none = byId(await d.discover({}, {}));
    assert.ok(!none.has('mqtt.0.shelly.1.SHWT-1_08F9E0444075_1.sensor.battery'), 'no pattern, no row');

    const m = byId(
        await d.discover({ batteryExtraPatterns: '/^mqtt\\.0\\.shelly\\..*\\.battery$/, mqtt.0.other.lowbat' }, {}),
    );
    assert.strictEqual(m.get('mqtt.0.shelly.1.SHWT-1_08F9E0444075_1.sensor.battery')?.cat, 'battery');
    assert.strictEqual(m.get('mqtt.0.other.lowbat')?.cat, 'battery');
    assert.ok(!m.has('mqtt.0.shelly.1.SHWT-1_08F9E0444075_1.sensor.flood'));
    assert.ok(!m.has('modbus.0.storage.battery'), 'storage battery stays out');

    const off = byId(await d.discover({ batteryExtraPatterns: 'mqtt.0.', catBattery: false }, {}));
    assert.ok(!off.has('mqtt.0.other.lowbat'), 'category off wins');
    d.stop();
});

test('batteryExtraPatterns: text level in %, boolean as LOWBAT', () => {
    const shared = require('../lib/shared/auraShared');
    const opts = { batteryExtraPatterns: 'mqtt.0.' };
    const mixed = { id: 'mqtt.0.a.battery', name: 'x', type: 'mixed', role: 'variable', rooms: [], funcs: [] };
    const flag = { ...mixed, id: 'mqtt.0.b.lowbat', type: 'boolean' };
    assert.strictEqual(shared.evaluateItem(mixed, '85', 'battery', opts, 0, true).label, '85 %');
    assert.strictEqual(shared.evaluateItem(mixed, '12', 'battery', opts).severity, 'warn');
    assert.strictEqual(shared.evaluateItem(mixed, 12, 'battery', opts).label, '12 %');
    assert.strictEqual(shared.evaluateItem(mixed, true, 'battery', opts).label, 'schwach', 'mixed carrying a flag');
    assert.strictEqual(shared.evaluateItem(mixed, false, 'battery', opts), null);
    assert.strictEqual(shared.evaluateItem(flag, true, 'battery', opts).label, 'schwach');
    assert.strictEqual(shared.evaluateItem(flag, false, 'battery', opts), null);
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
