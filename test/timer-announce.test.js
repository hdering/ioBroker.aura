'use strict';

/**
 * Zeitschaltuhr events that speak (#918, phase 3): lib/timerAnnounce.js and the
 * real _timerTick of main.js (adapter-core stubbed, fake clock).
 *
 *   - an event with `announce` speaks on the device that saved it, or everywhere
 *     with announceTarget 'all'; [[id]] values are read when it fires
 *   - only with allowEventAnnounce; the end of a range does not speak
 *   - a timer without target datapoint runs when its events may speak
 *
 *   node test/timer-announce.test.js
 */

const assert = require('assert');
const { timerEventAnnouncement, timerHasWork } = require('../lib/timerAnnounce');

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
let clock = new RealDate(2026, 9, 14, 6, 50, 0).getTime();
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
const at7 = { kind: 'time', hour: 7, minute: 0 };

function makeAdapter(states = {}) {
    const a = createAdapter({});
    const writes = [];
    const said = [];
    a.config = {};
    a.getForeignStateAsync = async (id) => (id in states ? { val: states[id] } : null);
    a.setForeignStateAsync = async (id, val) => void writes.push([id, val]);
    a.setStateAsync = async (id, st) => {
        if (id === 'speech.say') said.push(JSON.parse(st.val));
    };
    a._timerState = new Map();
    a._timerFired = new Set();
    a._timerException = new Map();
    a._timerLastDay = a._currentDayKey();
    a._timerTickMs = 30000;
    return { a, writes, said };
}

async function runUntil(a, h, m) {
    const end = new RealDate(2026, 9, 14, h, m, 0).getTime();
    while (clock < end) {
        clock += 30000;
        await a._timerTick();
    }
}

(async () => {
    // ── pure part ────────────────────────────────────────────────────────────
    {
        const ev = { announce: ' Mülltonne raus ', announceClients: ['kueche', 'BAD', 'kueche'] };
        assert.strictEqual(timerEventAnnouncement({}, ev), null, 'only with allowEventAnnounce');
        assert.deepStrictEqual(timerEventAnnouncement({ allowEventAnnounce: true }, ev), {
            template: 'Mülltonne raus',
            payload: { target: { clients: ['kueche'] } },
        });
        assert.deepStrictEqual(timerEventAnnouncement({ allowEventAnnounce: true, announceTarget: 'all' }, ev), {
            template: 'Mülltonne raus',
            payload: {},
        });
        assert.strictEqual(timerEventAnnouncement({ allowEventAnnounce: true }, { announce: '  ' }), null);
        assert.strictEqual(timerHasWork({}, []), false);
        assert.strictEqual(timerHasWork({ allowEventAnnounce: true }, []), true);
        assert.strictEqual(timerHasWork({}, ['x.0.y']), true);
        console.log('  ok  pure: text, devices, opt-in');
    }

    const test = async (name, fn) => {
        clock = new RealDate(2026, 9, 14, 6, 50, 0).getTime();
        await fn();
        console.log(`  ok  ${name}`);
    };

    await test('announcement-only timer speaks on the saving device, with values', async () => {
        const { a, writes, said } = makeAdapter({ 'weather.0.temp': 4 });
        a._timerState.set('t1', {
            enabled: true,
            payload: {
                allowEventAnnounce: true,
                events: [
                    {
                        id: 'e1',
                        enabled: true,
                        weekdays: ALL,
                        trigger: at7,
                        filter: 'all-days',
                        announce: 'Mülltonne raus, es hat [[weather.0.temp]] Grad',
                        announceClients: ['kueche'],
                    },
                ],
            },
        });
        await runUntil(a, 7, 5);
        assert.deepStrictEqual(writes, [], 'no target datapoint, nothing written');
        assert.deepStrictEqual(said, [{ text: 'Mülltonne raus, es hat 4 Grad', target: { clients: ['kueche'] } }]);
    });

    await test('with a target: writes and speaks; without opt-in only writes', async () => {
        for (const allow of [true, false]) {
            clock = new RealDate(2026, 9, 14, 6, 50, 0).getTime();
            const { a, writes, said } = makeAdapter();
            a._timerState.set('t1', {
                enabled: true,
                payload: {
                    targetDp: 'x.0.light',
                    value: 'true',
                    allowEventAnnounce: allow,
                    announceTarget: 'all',
                    events: [
                        {
                            id: 'e1',
                            enabled: true,
                            weekdays: ALL,
                            trigger: at7,
                            filter: 'all-days',
                            announce: 'Licht an',
                            announceClients: ['kueche'],
                        },
                    ],
                },
            });
            await runUntil(a, 7, 5);
            assert.deepStrictEqual(writes, [['x.0.light', true]]);
            assert.deepStrictEqual(said, allow ? [{ text: 'Licht an' }] : [], `allowEventAnnounce=${allow}`);
        }
    });

    await test('a range speaks at its start, not at its end', async () => {
        const { a, said } = makeAdapter();
        const from = new RealDate(2026, 9, 14, 7, 0, 0).toISOString();
        const to = new RealDate(2026, 9, 14, 8, 0, 0).toISOString();
        a._timerState.set('t1', {
            enabled: true,
            payload: {
                allowEventAnnounce: true,
                events: [
                    {
                        id: 'r1',
                        enabled: true,
                        weekdays: ALL,
                        trigger: { kind: 'range', fromIso: from, toIso: to },
                        filter: 'all-days',
                        announce: 'Besuch kommt',
                    },
                ],
            },
        });
        await runUntil(a, 8, 5);
        assert.deepStrictEqual(said, [{ text: 'Besuch kommt' }]);
    });

    await test('a timer with neither target nor announcements stays idle', async () => {
        const { a, said } = makeAdapter();
        a._timerState.set('t1', {
            enabled: true,
            payload: {
                events: [{ id: 'e1', enabled: true, weekdays: ALL, trigger: at7, filter: 'all-days', announce: 'x' }],
            },
        });
        await runUntil(a, 7, 5);
        assert.deepStrictEqual(said, []);
    });

    console.log('timer-announce: all tests passed');
    process.exit(0);
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
