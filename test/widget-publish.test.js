'use strict';

/**
 * Widget content as datapoints (#798): lib/widgetPublish.js and its glue in main.js.
 *
 *   - which widgets publish (dashboard, group children, popups, PIN vault — not the
 *     children of a device card)
 *   - static / dynamic list: filter (publishFilter beats valueFilter), presets on
 *     second-line datapoints, sorting inside sections, names, rooms, text
 *   - Statusübersicht: registered candidates, remembered and ignored hints
 *   - written only when the rows change; gone when the widget is
 *   - main.js: start without a browser, registration stored in the channel,
 *     dashboard edit removes the datapoints
 *
 *   node test/widget-publish.test.js
 */

const assert = require('assert');
const { WidgetPublishEngine, collectWidgets } = require('../lib/widgetPublish');

let passed = 0;
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const T0 = 1760799000000;
const st = (val, lc = T0) => ({ val, ts: lc, lc });

/** Engine with every write captured; flushes synchronously. */
function makeEngine(extra = {}) {
    const writes = [];
    const removed = [];
    const engine = new WidgetPublishEngine({
        writeList: (id, data) => writes.push({ id, ...data }),
        removeList: (id) => removed.push(id),
        now: () => T0 + 1000,
        ...extra,
    });
    return { engine, writes, removed, last: (id) => [...writes].reverse().find((w) => w.id === id) };
}

/** Feeds values for everything the engine watches (missing = no state). */
function feed(engine, values) {
    for (const id of engine.watchedIds()) {
        if (id in values) {
            engine.update(id, values[id]);
        }
    }
}

const items = (w) => JSON.parse(w.items);

// ── which widgets publish ───────────────────────────────────────────────────

test('collectWidgets: dashboard, group child, popup and vault — not device-card children', () => {
    const list = (id, extra = {}) => ({
        id,
        type: 'list',
        title: `L ${id}`,
        options: { publishCount: true, entries: [] },
        ...extra,
    });
    const dashboard = JSON.stringify({
        state: {
            layouts: [
                {
                    sections: [
                        {
                            tabs: [
                                {
                                    widgets: [
                                        list('w1'),
                                        { id: 'w2', type: 'list', options: { publishCount: false, entries: [] } },
                                        { id: 'g1', type: 'group', options: { defId: 'defA' } },
                                        { id: 'c1', type: 'devicecard', options: { defId: 'defCard' } },
                                        {
                                            id: 's1',
                                            type: 'statusoverview',
                                            title: 'Status [[x.y]]',
                                            options: { publishCount: true },
                                        },
                                    ],
                                },
                            ],
                        },
                    ],
                },
            ],
        },
    });
    const groupDefs = JSON.stringify({
        state: {
            defs: {
                defA: [list('w3')],
                defCard: [list('w4'), { id: 'g2', type: 'group', options: { defId: 'defNested' } }],
                defNested: [list('w5')],
            },
        },
    });
    const popupConfig = JSON.stringify({ views: [{ widgets: [list('w6')] }] });
    const extra = { 'layout1/sec1': { tabs: [{ widgets: [list('w7')] }] } };
    const map = collectWidgets({ dashboard, groupDefs, popupConfig, extra });
    assert.deepStrictEqual([...map.keys()].sort(), ['s1', 'w1', 'w3', 'w6', 'w7']);
    assert.strictEqual(map.get('s1').title, 'Status', 'tokens stripped from the title');
});

// ── static list ─────────────────────────────────────────────────────────────

const WIN1 = 'hm-rpc.0.A.1.STATE';
const WIN2 = 'hm-rpc.0.B.1.STATE';
const WIN3 = 'hm-rpc.0.C.1.STATE';

function staticList(options = {}) {
    return {
        id: 'w1',
        type: 'list',
        title: 'Fenster',
        options: {
            publishCount: true,
            valueFilter: 'active',
            trueText: 'offen',
            falseText: 'zu',
            entries: [{ id: WIN1, label: 'Fenster Bad' }, { id: WIN2 }, { id: WIN3, label: 'Fenster Flur' }],
            ...options,
        },
    };
}

test('static list: stored valueFilter, names from label / object, rooms from enum, text', () => {
    const { engine, writes, last } = makeEngine();
    engine.setWidgets(new Map([['w1', staticList()]]));
    engine.setMeta(WIN2, { common: { name: { de: 'Fenster Küche', en: 'Kitchen window' } } });
    engine.setRooms(
        new Map([
            ['hm-rpc.0.A', ['Bad']],
            ['hm-rpc.0.B.1', ['Küche']],
        ]),
    );
    feed(engine, { [WIN1]: st(true), [WIN2]: st(true, T0 + 5), [WIN3]: st(false) });
    engine.flush();
    const w = last('w1');
    assert.strictEqual(w.count, 2);
    assert.strictEqual(w.title, 'Fenster');
    assert.deepStrictEqual(items(w), [
        { id: WIN1, name: 'Fenster Bad', val: true, room: 'Bad', text: 'offen', lc: T0 },
        { id: WIN2, name: 'Fenster Küche', val: true, room: 'Küche', text: 'offen', lc: T0 + 5 },
    ]);
    assert.strictEqual(w.text, 'Bad: Fenster Bad (offen)\nKüche: Fenster Küche (offen)');
    assert.strictEqual(w.ts, T0 + 1000);
    const n = writes.length;
    engine.update(WIN3, st(false, T0 + 9)); // a hidden row changes — nothing to write
    engine.flush();
    assert.strictEqual(writes.length, n, 'unchanged rows are not written again');
    engine.update(WIN1, st(false, T0 + 10));
    engine.flush();
    assert.strictEqual(last('w1').count, 1);
});

test('static list: publishFilter beats valueFilter; deleted preset falls back to all', () => {
    const { engine, last } = makeEngine();
    engine.setWidgets(new Map([['w1', staticList({ publishFilter: 'inactive' })]]));
    feed(engine, { [WIN1]: st(true), [WIN2]: st(true), [WIN3]: st(false) });
    engine.flush();
    assert.deepStrictEqual(
        items(last('w1')).map((i) => i.id),
        [WIN3],
    );
    engine.setWidgets(new Map([['w1', staticList({ publishFilter: 'gone' })]]));
    engine.flush();
    assert.strictEqual(last('w1').count, 3);
});

test('static list: sorted inside sections, dividers not published', () => {
    const { engine, last } = makeEngine();
    const w = staticList({
        valueFilter: 'all',
        sortBy: 'label',
        entries: [
            { id: WIN3, label: 'Z oben' },
            { id: WIN1, label: 'A oben' },
            { divider: true, dividerLabel: 'Unten' },
            { id: WIN2, label: 'M unten' },
        ],
    });
    engine.setWidgets(new Map([['w1', w]]));
    feed(engine, { [WIN1]: st(true), [WIN2]: st(true), [WIN3]: st(true) });
    engine.flush();
    assert.deepStrictEqual(
        items(last('w1')).map((i) => i.name),
        ['A oben', 'Z oben', 'M unten'],
    );
});

test('static list: JSON path ref and a [[dp]] token in the name pattern', () => {
    const { engine, last } = makeEngine();
    const JSONDP = '0_userdata.0.devices';
    const w = staticList({
        valueFilter: 'all',
        namePattern: '[[{{parent}}.DeviceName]]',
        entries: [{ id: `${JSONDP}?bad.open` }, { id: WIN1 }],
    });
    engine.setWidgets(new Map([['w1', w]]));
    engine.refresh();
    assert.ok(engine.watchedIds().includes(JSONDP), 'the bare state of a path ref is watched');
    assert.ok(engine.watchedIds().includes('hm-rpc.0.A.1.DeviceName'), 'a token in the pattern is watched');
    feed(engine, {
        [JSONDP]: st(JSON.stringify({ bad: { open: true } })),
        [WIN1]: st(false),
        'hm-rpc.0.A.1.DeviceName': st('Fenster Gäste'),
    });
    engine.flush();
    const rows = items(last('w1'));
    assert.strictEqual(rows[0].val, true);
    assert.strictEqual(rows[1].name, 'Fenster Gäste');
});

// ── dynamic list ────────────────────────────────────────────────────────────

test('dynamic list: preset on a template datapoint of the second line, stored rooms', () => {
    const { engine, last } = makeEngine();
    const T1 = 'zigbee.0.a.temperature';
    const T2 = 'zigbee.0.b.temperature';
    const w = {
        id: 'w2',
        type: 'autolist',
        title: 'Schwache Batterien',
        options: {
            publishCount: true,
            valueFilter: 'all',
            publishFilter: 'lowbat',
            filterPresets: [
                {
                    id: 'lowbat',
                    label: 'Batterie',
                    rules: [{ source: 'sub', subKey: 'battery', operator: '<', value: '20' }],
                },
            ],
            subDpTemplate: [{ id: '{{parent}}.battery', label: 'Batterie' }],
            sortRules: [{ source: 'sub', subKey: 'battery', mode: 'number' }],
            decimals: 1,
            entries: [
                { id: T1, label: 'Bad', rooms: ['Bad'], unit: '°C' },
                { id: T2, label: 'Flur', rooms: ['Flur'], unit: '°C' },
            ],
        },
    };
    engine.setWidgets(new Map([['w2', w]]));
    feed(engine, {
        [T1]: st(21.456),
        [T2]: st(19),
        'zigbee.0.a.battery': st(15),
        'zigbee.0.b.battery': st(8),
    });
    engine.flush();
    const rows = items(last('w2'));
    assert.deepStrictEqual(
        rows.map((r) => r.name),
        ['Flur', 'Bad'],
        'sorted by battery, both below 20',
    );
    assert.strictEqual(rows[1].text, '21.5 °C');
    assert.strictEqual(rows[1].room, 'Bad');
    engine.update('zigbee.0.a.battery', st(80));
    engine.flush();
    assert.deepStrictEqual(
        items(last('w2')).map((r) => r.name),
        ['Flur'],
    );
});

test('option off or widget gone → datapoints removed', () => {
    const { engine, removed } = makeEngine();
    engine.setWidgets(new Map([['w1', staticList()]]));
    engine.flush();
    engine.setWidgets(new Map());
    assert.deepStrictEqual(removed, ['w1']);
    assert.deepStrictEqual(engine.watchedIds(), []);
});

test('seeded content: a restart does not rewrite unchanged rows', () => {
    const { engine, writes } = makeEngine();
    const seed = JSON.stringify([{ id: WIN1, name: 'Fenster Bad', val: true, text: 'offen', lc: T0 }]);
    engine.seedPublished('w1', seed);
    engine.setWidgets(new Map([['w1', staticList({ entries: [{ id: WIN1, label: 'Fenster Bad' }] })]]));
    feed(engine, { [WIN1]: st(true) });
    engine.flush();
    assert.strictEqual(writes.length, 0);
});

// ── Statusübersicht ─────────────────────────────────────────────────────────

test('status: registered candidates evaluated, remembered and ignored hints', () => {
    const latchEntries = { battery: [{ id: 'hm.0.bat2', since: T0 - 86400000, count: 2 }] };
    const ignored = new Set(['hm.0.win3']);
    const { engine, last, writes } = makeEngine({
        latch: { entries: (cat) => latchEntries[cat] || [], isIgnored: (cat, id) => ignored.has(id) },
    });
    const w = {
        id: 's1',
        type: 'statusoverview',
        title: 'Status',
        options: { publishCount: true, latchBattery: true, batteryThreshold: 20 },
    };
    engine.setWidgets(new Map([['s1', w]]));
    engine.flush();
    assert.strictEqual(writes.length, 0, 'nothing before the widget registered');
    engine.registerStatus('s1', [
        { id: 'hm.0.win1', cat: 'window', name: 'Fenster Bad', room: 'Bad', role: 'sensor.window' },
        {
            id: 'hm.0.win2',
            cat: 'window',
            name: 'Fenster Flur',
            room: 'Flur',
            role: 'state',
            states: { 0: 'CLOSED', 1: 'TILTED', 2: 'OPEN' },
        },
        { id: 'hm.0.win3', cat: 'window', name: 'Fenster Keller', role: 'sensor.window' },
        { id: 'hm.0.bat1', cat: 'battery', name: 'Thermostat', role: 'value.battery', type: 'number' },
        { id: 'hm.0.bat2', cat: 'battery', name: 'Rauchmelder', role: 'indicator.lowbat', type: 'boolean' },
        { id: 'hm.0.gone', cat: 'window', name: 'Nicht da', role: 'sensor.window' },
    ]);
    feed(engine, {
        'hm.0.win1': st(true),
        'hm.0.win2': st(1),
        'hm.0.win3': st(true),
        'hm.0.bat1': st(55),
        'hm.0.bat2': st(false),
        'hm.0.gone': null,
    });
    engine.flush();
    const rows = items(last('s1'));
    assert.deepStrictEqual(
        rows.map((r) => [r.name, r.category, r.severity, r.text, r.latched]),
        [
            ['Fenster Bad', 'window', 'crit', 'Geöffnet', false],
            ['Fenster Flur', 'window', 'warn', 'Gekippt', false],
            ['Rauchmelder', 'battery', 'warn', 'schwach', true],
        ],
    );
    assert.strictEqual(rows[2].since, T0 - 86400000);
    assert.ok(!rows.some((r) => r.id === 'hm.0.win3'), 'ignored datapoint left out');
    // The hint closes in the adapter → the row goes.
    latchEntries.battery = [];
    engine.latchChanged();
    engine.flush();
    assert.strictEqual(last('s1').count, 2);
});

// ── main.js glue ────────────────────────────────────────────────────────────

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

function makeAdapter(seed) {
    const a = createAdapter({});
    const objects = new Map(Object.entries(seed.objects || {}));
    const states = new Map(Object.entries(seed.states || {}));
    const foreign = new Map(Object.entries(seed.foreign || {}));
    const timers = [];
    const subscribed = new Set();
    a.config = {};
    a.extendObjectAsync = async (id, obj) => {
        const prev = objects.get(`aura.0.${id}`) || {};
        objects.set(`aura.0.${id}`, {
            ...prev,
            ...obj,
            common: { ...(prev.common || {}), ...(obj.common || {}) },
            native: { ...(prev.native || {}), ...(obj.native || {}) },
        });
    };
    a.delObjectAsync = async (id, opts) => {
        for (const k of [...objects.keys()]) {
            if (k === `aura.0.${id}` || (opts && opts.recursive && k.startsWith(`aura.0.${id}.`))) {
                objects.delete(k);
            }
        }
    };
    a.getForeignObjectsAsync = async (pattern, type) => {
        const re = new RegExp(`^${pattern.replace(/[.]/g, '\\.').replace(/\*/g, '.*')}$`);
        const out = {};
        for (const [k, v] of objects) {
            if (re.test(k) && (!type || v.type === type)) {
                out[k] = v;
            }
        }
        return out;
    };
    a.getForeignObjectAsync = async (id) => objects.get(id) || null;
    a.getStateAsync = async (id) => (states.has(id) ? states.get(id) : null);
    a.setStateAsync = async (id, val, ack) => {
        states.set(id, { val, ack: !!ack });
    };
    a.getForeignStateAsync = async (id) => foreign.get(id) || null;
    a.subscribeForeignStatesAsync = async (id) => subscribed.add(id);
    a.unsubscribeForeignStatesAsync = async (id) => subscribed.delete(id);
    a.setObjectNotExistsAsync = async (id, obj) => {
        if (!objects.has(`aura.0.${id}`)) {
            objects.set(`aura.0.${id}`, obj);
        }
    };
    a.subscribeStates = () => {};
    a.setInterval = () => 1;
    a.clearInterval = () => {};
    a.setTimeout = (fn) => {
        timers.push(fn);
        return timers.length;
    };
    a.clearTimeout = () => {};
    const settle = async () => {
        for (let i = 0; i < 10; i++) {
            await a._statusOpChain;
            await a._publishOpChain;
            await a._publishWriteChain;
            while (timers.length) {
                timers.shift()();
            }
            await new Promise((r) => setImmediate(r));
        }
    };
    return { a, objects, states, foreign, subscribed, settle };
}

const dashboardWith = (widgets) => JSON.stringify({ state: { layouts: [{ sections: [{ tabs: [{ widgets }] }] }] } });

test('main.js: start without a browser, status registration kept, orphan and removed widget cleaned', async () => {
    const list = staticList();
    const status = { id: 's1', type: 'statusoverview', title: 'Status', options: { publishCount: true } };
    const { a, objects, states, foreign, subscribed, settle } = makeAdapter({
        objects: {
            // count from the old browser-written version: writable, role level
            'aura.0.lists.w1': { type: 'channel', common: { name: 'Fenster' }, native: {} },
            'aura.0.lists.w1.count': { type: 'state', common: { role: 'level', write: true } },
            'aura.0.lists.old': { type: 'channel', common: { name: 'Gelöscht' }, native: {} },
            [WIN2]: { type: 'state', common: { name: 'Fenster Küche' } },
        },
        states: { 'config.dashboard': { val: dashboardWith([list, status]) } },
        foreign: { [WIN1]: st(true), [WIN2]: st(false), [WIN3]: st(true) },
    });
    await a._initStatusLatch();
    await a._initWidgetPublish();
    await settle();
    assert.ok(!objects.has('aura.0.lists.old'), 'channel without a widget removed at start');
    assert.ok(subscribed.has(WIN1) && subscribed.has(WIN3));
    assert.strictEqual(states.get('lists.w1.count').val, 2);
    assert.strictEqual(states.get('lists.w1.count').ack, true);
    assert.strictEqual(objects.get('aura.0.lists.w1.count').common.write, false, 'old count made read-only');
    assert.strictEqual(objects.get('aura.0.lists.w1.count').common.role, 'value');
    assert.ok(!states.has('lists.s1.count'), 'status widget waits for its registration');

    // A value changes with no browser open.
    await a.onStateChange(WIN1, st(false, T0 + 50));
    await settle();
    assert.strictEqual(states.get('lists.w1.count').val, 1);

    // The Statusübersicht registers through status.register.
    foreign.set('hm.0.win1', st(true));
    await a.onStateChange('aura.0.status.register', {
        val: JSON.stringify({
            source: 's1',
            publish: true,
            items: [{ id: 'hm.0.win1', cat: 'window', name: 'Fenster Bad', role: 'sensor.window' }],
        }),
        ack: false,
    });
    await settle();
    assert.strictEqual(states.get('lists.s1.count').val, 1);
    assert.deepStrictEqual(
        objects.get('aura.0.lists.s1').native.statusItems.map((i) => i.id),
        ['hm.0.win1'],
    );

    // Restart: the registration comes back from the channel.
    const again = makeAdapter({
        objects: Object.fromEntries(objects),
        states: Object.fromEntries(states),
        foreign: { 'hm.0.win1': st(true), [WIN1]: st(false), [WIN3]: st(true) },
    });
    await again.a._initStatusLatch();
    await again.a._initWidgetPublish();
    await again.settle();
    assert.ok(again.subscribed.has('hm.0.win1'), 'registration restored without a browser');

    // The list is deleted from the dashboard.
    states.set('config.dashboard', { val: dashboardWith([status]) });
    await a.onStateChange('aura.0.config.dashboard', { val: dashboardWith([status]), ack: true });
    await settle();
    assert.ok(!objects.has('aura.0.lists.w1') && !objects.has('aura.0.lists.w1.count'), 'removed with the widget');
    assert.ok(!subscribed.has(WIN1));
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
