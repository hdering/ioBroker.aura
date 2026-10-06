'use strict';

/**
 * Unit tests for the remembered hints of the Statusübersicht — lib/statusLatch.js.
 *
 * The acceptance list of the feature, one block each:
 *   - LOWBAT true → false stays in the list, marked inactive
 *   - ack closes (one list for every client, so one write closes it everywhere)
 *   - snooze keeps the entry with snoozedUntil
 *   - a fresh report inside the recheck window reopens; a stale old value does not
 *   - 1.2 V → 1.5 V closes automatically (when switched on); ±0.1 V does not
 *   - import by serial number (the old script's Merkliste) and by datapoint id
 *
 *   node test/status-latch.test.js
 */

const assert = require('assert');
const { StatusLatchEngine, parseStatusCommand, levelJumped, ACK_GRACE_MS, DAY_MS } = require('../lib/statusLatch');

const T0 = Date.UTC(2026, 9, 5, 8, 0, 0);
const MIN = 60 * 1000;

function makeEngine() {
    let now = T0;
    const lists = { battery: [], unreach: [], alarm: [] };
    const events = [];
    const sources = {};
    const engine = new StatusLatchEngine({
        now: () => now,
        writeList: (cat, list) => {
            lists[cat] = list;
        },
        writeEvent: (cat, evt) => events.push(evt),
        writeSources: (cat, src) => {
            sources[cat] = JSON.parse(JSON.stringify(src));
        },
    });
    return {
        engine,
        lists,
        events,
        sources,
        advance: (ms) => {
            now += ms;
        },
        now: () => now,
    };
}

const GOLF = 'hm-rpc.1.0020DA499B8F41.0.LOW_BAT';
const GOLF_V = 'hm-rpc.1.0020DA499B8F41.0.OPERATING_VOLTAGE';
const GRIFF = 'hm-rpc.1.0007DBE98D9753.0.LOW_BAT';

function register(engine, settings = {}) {
    return engine.register({
        source: 'w1',
        cat: 'battery',
        settings,
        watch: [
            { id: GOLF, kind: 'bool', name: 'Garage Oeffner Golf', room: 'Garage', levelId: GOLF_V, levelUnit: 'V' },
            { id: GRIFF, kind: 'bool', name: 'Wohnzimmer Drehgriffkontakt rechts', room: 'Wohnzimmer' },
        ],
    });
}

let passed = 0;
function test(name, fn) {
    try {
        fn();
        passed++;
        console.log(`  ok   ${name}`);
    } catch (e) {
        console.log(`  FAIL ${name}`);
        console.log(e.stack);
        process.exitCode = 1;
    }
}

// ── parsing ─────────────────────────────────────────────────────────────────

test('parse text commands', () => {
    assert.deepStrictEqual(parseStatusCommand('ack:hm-rpc.1.X.0.LOW_BAT'), [
        { cmd: 'ack', id: 'hm-rpc.1.X.0.LOW_BAT' },
    ]);
    assert.deepStrictEqual(parseStatusCommand('snooze:abc@3'), [{ cmd: 'snooze', id: 'abc', days: 3 }]);
    assert.deepStrictEqual(parseStatusCommand('add:0020da499b8f41@2025-10-05'), [
        { cmd: 'add', id: '0020da499b8f41', since: '2025-10-05' },
    ]);
    assert.deepStrictEqual(parseStatusCommand('REMOVE: x '), [{ cmd: 'remove', id: 'x' }]);
    assert.deepStrictEqual(parseStatusCommand('nonsense'), []);
    assert.deepStrictEqual(parseStatusCommand(''), []);
});

test('parse JSON commands (single and array)', () => {
    assert.deepStrictEqual(parseStatusCommand('{"cmd":"add","id":"a","since":1}'), [{ cmd: 'add', id: 'a', since: 1 }]);
    const arr = parseStatusCommand('[{"cmd":"ACK","id":"a"},{"cmd":"add"},{"cmd":"remove","id":"b"}]');
    assert.deepStrictEqual(
        arr.map((c) => `${c.cmd}:${c.id}`),
        ['ack:a', 'remove:b'],
    );
});

test('levelJumped thresholds', () => {
    assert.strictEqual(levelJumped('V', 1.2, 1.5), true, '1.2 → 1.5 V');
    assert.strictEqual(levelJumped('V', 1.2, 1.3), false, '+0.1 V');
    assert.strictEqual(levelJumped('V', 2.4, 2.7), false, '+0.3 V but only 12.5 %');
    assert.strictEqual(levelJumped('V', 2.2, 3.0), true, '2.2 → 3.0 V');
    assert.strictEqual(levelJumped('%', 10, 45), true);
    assert.strictEqual(levelJumped('%', 10, 35), false, 'below 40 %');
    assert.strictEqual(levelJumped('%', 20, 45), false, 'only +25 points');
});

// ── latch ───────────────────────────────────────────────────────────────────

test('LOWBAT true → false stays in the list, inactive', () => {
    const { engine, lists, events, advance } = makeEngine();
    register(engine);
    engine.update(GOLF, { val: true, ts: T0, lc: T0 });
    assert.strictEqual(lists.battery.length, 1);
    assert.strictEqual(lists.battery[0].active, true);
    assert.strictEqual(lists.battery[0].count, 1);
    assert.strictEqual(lists.battery[0].name, 'Garage Oeffner Golf');
    assert.strictEqual(events.at(-1).type, 'new');

    advance(DAY_MS);
    engine.update(GOLF, { val: false, ts: T0 + DAY_MS, lc: T0 + DAY_MS });
    assert.strictEqual(lists.battery.length, 1, 'still listed');
    assert.strictEqual(lists.battery[0].active, false, 'marked inactive');
    assert.strictEqual(events.length, 1, 'no event for going quiet');

    advance(DAY_MS);
    engine.update(GOLF, { val: true, ts: T0 + 2 * DAY_MS, lc: T0 + 2 * DAY_MS });
    assert.strictEqual(lists.battery[0].active, true);
    assert.strictEqual(lists.battery[0].count, 2, 'reported twice');
    assert.strictEqual(lists.battery[0].since, T0, 'since = first report');
});

test('a repeated "true" (periodic update) does not count again', () => {
    const { engine, lists } = makeEngine();
    register(engine);
    engine.update(GOLF, { val: true, ts: T0, lc: T0 });
    engine.update(GOLF, { val: true, ts: T0 + 5 * MIN, lc: T0 });
    assert.strictEqual(lists.battery[0].count, 1);
});

test('ack closes the entry; ack of an unknown live hint creates a closed one', () => {
    const { engine, lists, events } = makeEngine();
    register(engine);
    engine.update(GOLF, { val: true, ts: T0, lc: T0 });
    const r = engine.command('battery', `ack:${GOLF}`);
    assert.ok(r.ok);
    assert.strictEqual(lists.battery[0].ackedAt, T0);
    assert.strictEqual(lists.battery[0].closedBy, 'ack');
    assert.deepStrictEqual([events.at(-1).type, events.at(-1).reason], ['closed', 'ack']);
    const r2 = engine.command('battery', `ack:${GRIFF}`);
    assert.ok(r2.ok);
    assert.ok(lists.battery.find((e) => e.id === GRIFF).ackedAt);
});

test('snooze keeps the entry with snoozedUntil (default 2 days, @days override)', () => {
    const { engine, lists } = makeEngine();
    register(engine);
    engine.update(GOLF, { val: true, ts: T0, lc: T0 });
    engine.command('battery', `snooze:${GOLF}`);
    assert.strictEqual(lists.battery[0].snoozedUntil, T0 + 2 * DAY_MS);
    assert.strictEqual(lists.battery[0].ackedAt, null);
    engine.command('battery', `snooze:${GOLF}@5`);
    assert.strictEqual(lists.battery[0].snoozedUntil, T0 + 5 * DAY_MS);
    engine.command('battery', `unsnooze:${GOLF}`);
    assert.strictEqual(lists.battery[0].snoozedUntil, null);
});

test('recheck: a stale old value does not reopen, a fresh report does', () => {
    const { engine, lists, events, advance, now } = makeEngine();
    register(engine, { recheckDays: 7 });
    engine.update(GOLF, { val: true, ts: T0, lc: T0 });
    advance(MIN);
    engine.command('battery', `ack:${GOLF}`);
    const ackedAt = now();

    // The device has not sent anything since the change: same old state, and a
    // report 5 minutes after the ack still counts as the old one.
    engine.update(GOLF, { val: true, ts: T0, lc: T0 });
    engine.update(GOLF, { val: true, ts: ackedAt + 5 * MIN, lc: T0 });
    assert.ok(lists.battery[0].ackedAt, 'still closed');

    advance(2 * DAY_MS);
    engine.update(GOLF, { val: true, ts: now(), lc: now() });
    const e = lists.battery[0];
    assert.strictEqual(e.ackedAt, null, 'reopened');
    assert.strictEqual(e.reopenedAfter, ackedAt, 'remembers the change ("trotz Wechsel am …")');
    assert.strictEqual(events.at(-1).type, 'reopened');
    assert.strictEqual(events.at(-1).ackedAt, ackedAt);
    assert.ok(ACK_GRACE_MS === 10 * MIN);
});

test('recheck window over → closed entry is dropped (tick and lazily)', () => {
    const { engine, lists, advance } = makeEngine();
    register(engine, { recheckDays: 7 });
    engine.update(GOLF, { val: true, ts: T0, lc: T0 });
    engine.command('battery', `ack:${GOLF}`);
    advance(8 * DAY_MS);
    engine.tick();
    assert.strictEqual(lists.battery.length, 0);
});

test('auto-close: 1.2 V → 1.5 V closes, ±0.1 V does not', () => {
    const { engine, lists, events } = makeEngine();
    register(engine, { autoClose: true });
    engine.update(GOLF_V, { val: 1.2, ts: T0 });
    engine.update(GOLF, { val: true, ts: T0, lc: T0 });
    assert.strictEqual(lists.battery[0].minLevel, 1.2);
    assert.strictEqual(lists.battery[0].unit, 'V');

    engine.update(GOLF_V, { val: 1.3, ts: T0 + MIN });
    engine.update(GOLF_V, { val: 1.1, ts: T0 + 2 * MIN });
    engine.update(GOLF_V, { val: 1.2, ts: T0 + 3 * MIN });
    assert.strictEqual(lists.battery[0].ackedAt, null, 'wobble does not close');
    assert.strictEqual(lists.battery[0].minLevel, 1.1, 'minimum follows the lowest value');

    engine.update(GOLF_V, { val: 1.5, ts: T0 + 4 * MIN });
    assert.ok(lists.battery[0].ackedAt, 'closed');
    assert.strictEqual(lists.battery[0].closedBy, 'auto');
    assert.deepStrictEqual([events.at(-1).type, events.at(-1).reason], ['closed', 'auto']);
});

test('auto-close is off unless switched on', () => {
    const { engine, lists } = makeEngine();
    register(engine);
    engine.update(GOLF_V, { val: 1.2, ts: T0 });
    engine.update(GOLF, { val: true, ts: T0, lc: T0 });
    engine.update(GOLF_V, { val: 1.6, ts: T0 + MIN });
    assert.strictEqual(lists.battery[0].ackedAt, null);
});

test('percent battery: threshold, level and auto-close', () => {
    const { engine, lists } = makeEngine();
    const PCT = 'zigbee.0.abc.battery';
    engine.register({
        source: 'w1',
        cat: 'battery',
        settings: { autoClose: true },
        watch: [{ id: PCT, kind: 'pct', threshold: 20 }],
    });
    engine.update(PCT, { val: 50, ts: T0 });
    assert.strictEqual(lists.battery.length, 0);
    engine.update(PCT, { val: 15, ts: T0 + MIN });
    assert.strictEqual(lists.battery.length, 1);
    assert.strictEqual(lists.battery[0].unit, '%');
    engine.update(PCT, { val: 30, ts: T0 + 2 * MIN });
    assert.strictEqual(lists.battery[0].ackedAt, null, '+15 points is no change');
    assert.strictEqual(lists.battery[0].active, false);
    engine.update(PCT, { val: 100, ts: T0 + 3 * MIN });
    assert.strictEqual(lists.battery[0].closedBy, 'auto');
});

test('unreach with reachable semantics (boolInv)', () => {
    const { engine, lists } = makeEngine();
    engine.register({ source: 'w1', cat: 'unreach', watch: [{ id: 'x.0.dev.available', kind: 'boolInv' }] });
    engine.update('x.0.dev.available', { val: true, ts: T0 });
    assert.strictEqual(lists.unreach.length, 0);
    engine.update('x.0.dev.available', { val: false, ts: T0 + MIN });
    assert.strictEqual(lists.unreach.length, 1);
});

test('alarm: a smoke detector that went off stays listed after it is quiet again', () => {
    const { engine, lists, events } = makeEngine();
    const SMOKE = 'hm-rpc.1.00123.1.SMOKE_DETECTOR_ALARM_STATUS';
    engine.register({ source: 'w1', cat: 'alarm', watch: [{ id: SMOKE, kind: 'bool', name: 'Rauchmelder Keller' }] });
    engine.update(SMOKE, { val: false, ts: T0 });
    assert.strictEqual(lists.alarm.length, 0);
    engine.update(SMOKE, { val: true, ts: T0 + MIN, lc: T0 + MIN });
    engine.update(SMOKE, { val: false, ts: T0 + 2 * MIN, lc: T0 + 2 * MIN });
    assert.strictEqual(lists.alarm.length, 1);
    assert.strictEqual(lists.alarm[0].active, false);
    assert.deepStrictEqual([events.at(-1).type, events.at(-1).cat], ['new', 'alarm']);
    engine.command('alarm', `ack:${SMOKE}`);
    assert.ok(lists.alarm[0].ackedAt);
});

test('import by serial number before and after the widget registered', () => {
    const { engine, lists, events } = makeEngine();
    // Script runs before any widget registered: kept as unresolved.
    const since = Date.UTC(2026, 8, 20);
    engine.command('battery', JSON.stringify([{ cmd: 'add', id: '0020da499b8f41', since, count: 3 }]));
    assert.strictEqual(lists.battery[0].unresolved, true);
    register(engine);
    const e = lists.battery.find((x) => x.id === GOLF);
    assert.ok(e, 'resolved to the LOW_BAT datapoint');
    assert.strictEqual(e.since, since);
    assert.strictEqual(e.count, 3);
    assert.strictEqual(e.name, 'Garage Oeffner Golf');
    assert.strictEqual(e.unresolved, undefined);
    assert.strictEqual(events.length, 0, 'an import sends no notification');

    // After registration: serial resolves immediately.
    engine.command('battery', 'add:0007dbe98d9753@2026-09-30');
    assert.ok(lists.battery.find((x) => x.id === GRIFF));
    // ack by serial.
    engine.command('battery', 'ack:0007DBE98D9753');
    assert.ok(lists.battery.find((x) => x.id === GRIFF).ackedAt);
});

test('imported entry becomes active with the live value, inactive stays quiet', () => {
    const { engine, lists } = makeEngine();
    register(engine);
    engine.command('battery', `add:${GOLF}`);
    assert.strictEqual(lists.battery[0].active, false);
    engine.update(GOLF, { val: true, ts: T0 + MIN, lc: T0 + MIN });
    assert.strictEqual(lists.battery[0].active, true);
    assert.strictEqual(lists.battery[0].count, 2);
});

test('remove drops without recheck; unknown ids report an error', () => {
    const { engine, lists, events } = makeEngine();
    register(engine);
    engine.update(GOLF, { val: true, ts: T0, lc: T0 });
    const r = engine.command('battery', `remove:${GOLF}`);
    assert.ok(r.ok);
    assert.strictEqual(lists.battery.length, 0);
    assert.strictEqual(events.at(-1).reason, 'remove');
    const bad = engine.command('battery', 'ack:does.not.exist');
    assert.strictEqual(bad.ok, false);
});

test('registration: empty watch removes the source; stale sources age out', () => {
    const { engine, sources, advance } = makeEngine();
    register(engine);
    assert.ok(engine.watchedIds().includes(GOLF_V), 'level datapoint is subscribed too');
    engine.register({ source: 'w1', cat: 'battery', watch: [] });
    assert.deepStrictEqual(sources.battery, {});
    assert.strictEqual(engine.watchedIds().length, 0);

    register(engine);
    advance(31 * DAY_MS);
    assert.strictEqual(engine.tick(), true);
    assert.strictEqual(engine.watchedIds().length, 0);
});

test('restore from persisted JSON', () => {
    const a = makeEngine();
    register(a.engine);
    a.engine.update(GOLF, { val: true, ts: T0, lc: T0 });
    const b = makeEngine();
    b.engine.restore('battery', {
        list: JSON.stringify(a.lists.battery),
        sources: JSON.stringify(a.sources.battery),
    });
    assert.deepStrictEqual(b.engine.entries('battery'), a.lists.battery);
    assert.ok(b.engine.watchedIds().includes(GOLF));
    // After a restart the adapter reads the current value once — must not count again.
    b.engine.update(GOLF, { val: true, ts: T0, lc: T0 });
    assert.strictEqual(b.engine.entries('battery')[0].count, 1);
});

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
