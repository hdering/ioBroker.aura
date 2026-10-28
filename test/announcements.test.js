'use strict';

/**
 * Announcement rules (issue #834, phase 4): lib/announcements.js on top of the
 * shared rule logic (src-vis/utils/announcements.ts via lib/shared/auraShared.js).
 *
 *   - speaks on the edge only, never on load or when a rule is saved
 *   - mode update speaks on every new trigger value (debounced)
 *   - `changed` re-fires on every change
 *   - time window (also across midnight), weekdays, cooldown, once per day
 *   - {{value}}, {{name}}, [[id]] in the text; target, volume in the payload
 *   - subscriptions follow the rules
 */

const assert = require('assert');
const { createAnnouncements } = require('../lib/announcements');
const shared = require('../lib/shared/auraShared');

function setup(states, opts = {}) {
    const said = [];
    const subs = new Set();
    let saved = null;
    let clock = opts.at ?? new Date(2026, 9, 28, 12, 0, 0).getTime();
    const adapter = {
        log: { info() {}, warn() {}, error() {}, debug() {} },
        getForeignStateAsync: async (id) => (id in states ? { val: states[id] } : null),
    };
    const engine = createAnnouncements(adapter, {
        announce: (p) => said.push(p),
        subscribe: async (id) => subs.add(id),
        unsubscribe: async (id) => subs.delete(id),
        lastFired: opts.lastFired,
        saveLastFired: (log) => {
            saved = log;
        },
        now: () => clock,
    });
    return {
        engine,
        said,
        subs,
        saved: () => saved,
        tick: (ms) => {
            clock += ms;
        },
        setClock: (t) => {
            clock = t;
        },
    };
}

const rule = (over = {}) => ({
    id: 'r1',
    name: 'Klingel',
    enabled: true,
    clause: { datapoint: 'hm.0.bell', operator: 'true', value: '' },
    text: 'Es hat geklingelt',
    ...over,
});

const cfg = (...rules) => JSON.stringify({ rules });

// Feed a value and wait until the engine processed it.
async function feed(env, id, val, rules) {
    env.engine.onStateChange(id, { val });
    // load() chains on the same queue, so awaiting it awaits the value as well.
    await env.engine.load(rules);
}

(async () => {
    // ── shared logic ─────────────────────────────────────────────────────────
    {
        const parsed = shared.parseAnnouncementConfig(
            cfg(rule({ timeFrom: '6:00', timeTo: '9:00', days: [1, 2, 9], volume: 140 }), { id: '' }, rule()),
        );
        assert.strictEqual(parsed.rules.length, 1, 'id-less and duplicate rules are dropped');
        assert.strictEqual(parsed.rules[0].timeFrom, '06:00');
        assert.deepStrictEqual(parsed.rules[0].days, [1, 2]);
        assert.strictEqual(parsed.rules[0].volume, 100);
        assert.deepStrictEqual(shared.parseAnnouncementConfig('{broken').rules, []);

        const r = shared.parseAnnouncementConfig(cfg(rule({ timeFrom: '22:00', timeTo: '06:00' }))).rules[0];
        assert.ok(shared.announcementInWindow(r, new Date(2026, 9, 28, 23, 30)));
        assert.ok(shared.announcementInWindow(r, new Date(2026, 9, 28, 6, 0, 59)));
        assert.ok(!shared.announcementInWindow(r, new Date(2026, 9, 28, 12, 0)));

        const day = shared.parseAnnouncementConfig(cfg(rule({ oncePerDay: true }))).rules[0];
        const t0 = new Date(2026, 9, 28, 8, 0).getTime();
        assert.ok(!shared.announcementLockAllows(day, t0, new Date(2026, 9, 28, 23, 59).getTime()));
        assert.ok(shared.announcementLockAllows(day, t0, new Date(2026, 9, 29, 0, 1).getTime()));
        const cool = shared.parseAnnouncementConfig(cfg(rule({ cooldownMin: 10 }))).rules[0];
        assert.ok(!shared.announcementLockAllows(cool, t0, t0 + 9 * 60_000));
        assert.ok(shared.announcementLockAllows(cool, t0, t0 + 10 * 60_000));

        const text = shared.parseAnnouncementConfig(
            cfg(
                rule({
                    clause: { datapoint: 'hm.0.dev.TEMP', operator: '>', value: '25' },
                    text: '{{name}} ist {{value}} Grad, draußen [[weather.0.temp]] Grad, [[gibt.es.nicht]]',
                }),
            ),
        ).rules[0];
        const tpl = shared.announcementTextTemplate(text);
        assert.deepStrictEqual(shared.announcementTextDps(tpl), ['hm.0.dev.TEMP', 'weather.0.temp', 'gibt.es.nicht']);
        assert.strictEqual(
            shared.renderAnnouncementText(
                tpl,
                new Map([
                    ['hm.0.dev.TEMP', 26.5],
                    ['weather.0.temp', 12],
                ]),
            ),
            'TEMP ist 26.5 Grad, draußen 12 Grad,',
        );
        assert.deepStrictEqual(shared.announcementPayload({ ...text, clientIds: ['a'], volume: 40 }, 'x'), {
            text: 'x',
            volume: 40,
            target: { clients: ['a'] },
        });
    }

    // ── edge: nothing on load, speaks on the rising edge only ────────────────
    {
        const states = { 'hm.0.bell': true };
        const env = setup(states);
        const rules = cfg(rule());
        await env.engine.load(rules);
        assert.deepStrictEqual([...env.subs], ['hm.0.bell']);
        assert.strictEqual(env.said.length, 0, 'a value present at load is the baseline');
        await feed(env, 'hm.0.bell', true, rules);
        assert.strictEqual(env.said.length, 0, 'still true = no edge');
        await feed(env, 'hm.0.bell', false, rules);
        await feed(env, 'hm.0.bell', true, rules);
        assert.strictEqual(env.said.length, 1);
        assert.deepStrictEqual(env.said[0], { text: 'Es hat geklingelt' });
        assert.ok(env.saved().r1, 'the firing is persisted for the lock');

        // Unknown ids are not the engine's.
        assert.strictEqual(env.engine.onStateChange('other.0.x', { val: 1 }), false);

        // A changed rule takes a new baseline instead of speaking.
        const changed = cfg(rule({ text: 'Klingel!' }));
        await env.engine.load(changed);
        assert.strictEqual(env.said.length, 1);

        // Removing the rule drops the subscription.
        await env.engine.load(cfg());
        assert.deepStrictEqual([...env.subs], []);
    }

    // ── mode update: every press, debounced ───────────────────────────────────
    {
        const env = setup({ 'hm.0.bell': true });
        const rules = cfg(rule({ mode: 'update' }));
        await env.engine.load(rules);
        await feed(env, 'hm.0.bell', true, rules);
        await feed(env, 'hm.0.bell', true, rules);
        assert.strictEqual(env.said.length, 1, 'the ack confirmation of the same press is swallowed');
        env.tick(3000);
        await feed(env, 'hm.0.bell', true, rules);
        assert.strictEqual(env.said.length, 2);
    }

    // ── changed: every change is a new edge ──────────────────────────────────
    {
        const env = setup({ 'x.0.mode': 'a' });
        const rules = cfg(
            rule({ clause: { datapoint: 'x.0.mode', operator: 'changed', value: '' }, text: '{{value}}' }),
        );
        await env.engine.load(rules);
        await feed(env, 'x.0.mode', 'b', rules);
        await feed(env, 'x.0.mode', 'c', rules);
        assert.deepStrictEqual(
            env.said.map((p) => p.text),
            ['b', 'c'],
        );
    }

    // ── window and once per day ──────────────────────────────────────────────
    {
        const env = setup({ 'hm.0.motion': false }, { at: new Date(2026, 9, 28, 5, 30).getTime() });
        const rules = cfg(
            rule({
                clause: { datapoint: 'hm.0.motion', operator: 'true', value: '' },
                text: 'Guten Morgen',
                timeFrom: '06:00',
                timeTo: '09:00',
                oncePerDay: true,
                clientIds: ['kitchen'],
            }),
        );
        await env.engine.load(rules);
        const pulse = async () => {
            await feed(env, 'hm.0.motion', true, rules);
            await feed(env, 'hm.0.motion', false, rules);
        };
        await pulse();
        assert.strictEqual(env.said.length, 0, 'before the window');
        env.setClock(new Date(2026, 9, 28, 7, 0).getTime());
        await pulse();
        await pulse();
        assert.strictEqual(env.said.length, 1, 'once per day');
        assert.deepStrictEqual(env.said[0].target, { clients: ['kitchen'] });
        env.setClock(new Date(2026, 9, 29, 7, 0).getTime());
        await pulse();
        assert.strictEqual(env.said.length, 2, 'next day again');
    }

    // ── the lock survives a restart through lastFired ────────────────────────
    {
        const at = new Date(2026, 9, 28, 7, 0).getTime();
        const env = setup({ 'hm.0.bell': false }, { at: at + 60_000, lastFired: { r1: at } });
        const rules = cfg(rule({ oncePerDay: true }));
        await env.engine.load(rules);
        await feed(env, 'hm.0.bell', true, rules);
        assert.strictEqual(env.said.length, 0);
    }

    // ── test button: speaks regardless of condition and lock ─────────────────
    {
        const env = setup({ 'hm.0.dev.TEMP': 21 });
        const text = await env.engine.test(
            rule({
                clause: { datapoint: 'hm.0.dev.TEMP', operator: '>', value: '50' },
                text: 'Es sind {{value}} Grad',
            }),
        );
        assert.strictEqual(text, 'Es sind 21 Grad');
        assert.strictEqual(env.said.length, 1);
        assert.strictEqual(env.saved(), null, 'a test does not count for the lock');
    }

    console.log('announcements: all tests passed');
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
