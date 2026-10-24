'use strict';

/**
 * Unit tests for the scenes widget backend (issue #825): id rules, device
 * whitelist, member merge, learning and the PIN gate — against a fake adapter.
 */

const assert = require('assert');
const {
    normalizeInstance,
    normalizeDevices,
    slugify,
    uniqueSceneId,
    isOwnSceneId,
    mergeMembers,
    validateSave,
    createPinGuard,
    createSceneService,
} = require('../lib/scenes');

let n = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

function fakeAdapter({ objects = {}, states = {}, config = {} } = {}) {
    const objs = { ...objects };
    const log = { info() {}, warn() {} };
    return {
        objs,
        config,
        log,
        async getForeignObjectAsync(id) {
            return objs[id] ? JSON.parse(JSON.stringify(objs[id])) : null;
        },
        async getForeignObjectsAsync(pattern, type) {
            const re = new RegExp(`^${pattern.replace(/\./g, '\\.').replace(/\*/g, '.*')}$`);
            const out = {};
            for (const [id, o] of Object.entries(objs)) {
                if (re.test(id) && (!type || o.type === type)) {
                    out[id] = JSON.parse(JSON.stringify(o));
                }
            }
            return out;
        },
        async setForeignObjectAsync(id, obj) {
            objs[id] = JSON.parse(JSON.stringify({ ...obj, _id: id }));
        },
        async delForeignObjectAsync(id) {
            delete objs[id];
        },
        async getForeignStateAsync(id) {
            return id in states ? { val: states[id], ack: true } : null;
        },
    };
}

const DEVICES = [
    { id: 'hm.0.lamp.LEVEL', label: 'Stehlampe' },
    { id: 'hm.0.tv.STATE', label: '' },
];
const BASE = {
    'system.adapter.scenes.0': { type: 'instance', common: {} },
    'hm.0.lamp.LEVEL': { type: 'state', common: { name: 'Lampe', type: 'number', unit: '%' } },
    'hm.0.tv.STATE': { type: 'state', common: { name: { en: 'TV', de: 'Fernseher' }, type: 'boolean' } },
    'scene.0.Kino': {
        type: 'state',
        common: { name: 'Kino', role: 'scene.state' },
        native: { members: [{ id: 'x.y', setIfTrue: 1 }] },
    },
};

// ── pure helpers ───────────────────────────────────────────────────────────

test('instance is normalized and defaults to scenes.0', () => {
    assert.equal(normalizeInstance('system.adapter.scenes.2'), 'scenes.2');
    assert.equal(normalizeInstance('scenes.1'), 'scenes.1');
    assert.equal(normalizeInstance(''), 'scenes.0');
    assert.equal(normalizeInstance('javascript.0'), 'scenes.0');
});

test('device rows: empty, wildcard and duplicate ids dropped', () => {
    const d = normalizeDevices([{ id: 'a.b' }, { id: '' }, { id: 'a.*' }, { id: 'a.b', label: 'x' }, null]);
    assert.deepEqual(d, [{ id: 'a.b', label: '' }]);
    assert.deepEqual(normalizeDevices(undefined), []);
});

test('slug keeps letters/digits, transliterates umlauts', () => {
    assert.equal(slugify('Abend Licht'), 'Abend_Licht');
    assert.equal(slugify('Gemütlich & warm!'), 'Gemuetlich_warm');
    assert.equal(slugify('Café'), 'Cafe');
    assert.equal(slugify('...'), 'szene');
});

test('ids collide → numeric suffix', () => {
    const taken = ['scene.0.aura.Kino', 'scene.0.aura.Kino_2'];
    assert.equal(uniqueSceneId('Kino', taken), 'scene.0.aura.Kino_3');
    assert.equal(uniqueSceneId('Neu', taken), 'scene.0.aura.Neu');
});

test('only scene.0.aura.<slug> counts as own', () => {
    assert.ok(isOwnSceneId('scene.0.aura.Kino'));
    assert.ok(!isOwnSceneId('scene.0.Kino'));
    assert.ok(!isOwnSceneId('scene.0.aura.sub.Kino'));
    assert.ok(!isOwnSceneId('scene.0.aura'));
    assert.ok(!isOwnSceneId(null));
});

test('merge keeps stored values, appends new members, drops removed', () => {
    const old = [
        { id: 'a', setIfTrue: 5, delay: 100 },
        { id: 'b', setIfTrue: true },
    ];
    const m = mergeMembers(old, ['b', 'c']);
    assert.deepEqual(
        m.map((x) => x.id),
        ['b', 'c'],
    );
    assert.equal(m[0].setIfTrue, true);
    assert.equal(m[1].setIfTrue, null);
    assert.equal(m[1].stopAllDelays, true);
});

test('save validation: name, whitelist, duplicates', () => {
    const allowed = new Set(['a', 'b']);
    assert.equal(validateSave({ name: ' ', members: ['a'] }, allowed).error, 'name missing');
    assert.equal(validateSave({ name: 'x', members: [] }, allowed).error, 'no devices');
    assert.match(validateSave({ name: 'x', members: ['a', 'evil'] }, allowed).error, /not allowed: evil/);
    assert.deepEqual(validateSave({ name: ' x ', members: ['a', { id: 'b' }, 'a'] }, allowed), {
        name: 'x',
        ids: ['a', 'b'],
    });
});

test('pin guard: wrong pins lock out after five tries', () => {
    let t = 0;
    const g = createPinGuard(() => t);
    assert.ok(g.check('', '').ok, 'no pin configured → open');
    assert.ok(g.check('1234', '1234').ok);
    for (let i = 0; i < 4; i++) {
        assert.equal(g.check('0', '1234').error, 'pin');
    }
    assert.equal(g.check('0', '1234').error, 'pin'); // fifth fail starts the lock
    const locked = g.check('1234', '1234');
    assert.equal(locked.error, 'locked');
    assert.equal(locked.retryAfter, 30);
    t += 31000;
    assert.ok(g.check('1234', '1234').ok, 'right pin after the lock');
});

// ── service ───────────────────────────────────────────────────────────────

test('sceneStatus lists the configured devices with names and types', async () => {
    const a = fakeAdapter({
        objects: BASE,
        states: { 'system.adapter.scenes.0.alive': true },
        config: { sceneDevices: DEVICES, scenesPin: '42' },
    });
    const r = await createSceneService(a).handle('sceneStatus', {});
    assert.equal(r.ok, true);
    assert.equal(r.installed, true);
    assert.equal(r.running, true);
    assert.equal(r.pinRequired, true);
    assert.deepEqual(
        r.devices.map((d) => [d.name, d.type]),
        [
            ['Stehlampe', 'number'],
            ['Fernseher', 'boolean'],
        ],
    );
});

test('sceneStatus without the scenes adapter', async () => {
    const r = await createSceneService(fakeAdapter({ config: {} })).handle('sceneStatus', {});
    assert.equal(r.installed, false);
    assert.equal(r.running, false);
});

test('save creates the scene with learned values and the right engine', async () => {
    const a = fakeAdapter({
        objects: BASE,
        states: { 'hm.0.lamp.LEVEL': 60, 'hm.0.tv.STATE': true },
        config: { sceneDevices: DEVICES, scenesInstance: 'system.adapter.scenes.0' },
    });
    const s = createSceneService(a);
    const r = await s.handle('saveScene', { name: 'Abend Licht', members: ['hm.0.lamp.LEVEL', 'hm.0.tv.STATE'] });
    assert.deepEqual(r, { ok: true, id: 'scene.0.aura.Abend_Licht', missing: [] });
    const o = a.objs['scene.0.aura.Abend_Licht'];
    assert.equal(o.common.engine, 'system.adapter.scenes.0');
    assert.equal(o.common.role, 'scene.state');
    assert.deepEqual(
        o.native.members.map((m) => m.setIfTrue),
        [60, true],
    );

    const list = await s.handle('listScenes', {});
    assert.deepEqual(
        list.scenes.map((x) => [x.name, x.own]),
        [
            ['Abend Licht', true],
            ['Kino', false],
        ],
    );
    assert.equal(list.scenes[1].members, undefined, 'foreign scenes expose no members');
});

test('save rejects devices outside the whitelist', async () => {
    const a = fakeAdapter({ objects: BASE, config: { sceneDevices: DEVICES } });
    const r = await createSceneService(a).handle('saveScene', { name: 'x', members: ['hm.0.door.OPEN'] });
    assert.equal(r.ok, false);
    assert.ok(!Object.keys(a.objs).some((id) => id.startsWith('scene.0.aura.')));
});

test('update keeps learned values, learns only new members; missing values reported', async () => {
    const a = fakeAdapter({
        objects: BASE,
        states: { 'hm.0.lamp.LEVEL': 60 },
        config: { sceneDevices: DEVICES },
    });
    const s = createSceneService(a);
    const { id } = await s.handle('saveScene', { name: 'A', members: ['hm.0.lamp.LEVEL'] });
    // the device value changes after the first learn:
    const states = { 'hm.0.lamp.LEVEL': 10 };
    a.getForeignStateAsync = async (sid) => (sid in states ? { val: states[sid] } : null);
    const r = await s.handle('saveScene', { id, name: 'B', members: ['hm.0.lamp.LEVEL', 'hm.0.tv.STATE'] });
    assert.deepEqual(r.missing, ['hm.0.tv.STATE']);
    assert.equal(a.objs[id].common.name, 'B');
    assert.equal(a.objs[id].native.members[0].setIfTrue, 60, 'old value kept');

    const l = await s.handle('learnScene', { id });
    assert.equal(l.ok, true);
    assert.equal(a.objs[id].native.members[0].setIfTrue, 10, 'learn re-reads all');
});

test('foreign scenes cannot be changed, learned or deleted', async () => {
    const a = fakeAdapter({ objects: BASE, config: { sceneDevices: DEVICES } });
    const s = createSceneService(a);
    for (const cmd of ['learnScene', 'deleteScene']) {
        const r = await s.handle(cmd, { id: 'scene.0.Kino' });
        assert.equal(r.ok, false, cmd);
    }
    const r = await s.handle('saveScene', { id: 'scene.0.Kino', name: 'x', members: ['hm.0.tv.STATE'] });
    assert.equal(r.ok, false);
    assert.ok(a.objs['scene.0.Kino']);
});

test('delete removes an own scene', async () => {
    const a = fakeAdapter({ objects: BASE, config: { sceneDevices: DEVICES } });
    const s = createSceneService(a);
    const { id } = await s.handle('saveScene', { name: 'Weg', members: ['hm.0.tv.STATE'] });
    assert.deepEqual(await s.handle('deleteScene', { id }), { ok: true });
    assert.equal(a.objs[id], undefined);
});

test('writes need the pin when one is configured; reads do not', async () => {
    const a = fakeAdapter({ objects: BASE, config: { sceneDevices: DEVICES, scenesPin: '1234' } });
    const s = createSceneService(a);
    assert.equal((await s.handle('saveScene', { name: 'x', members: ['hm.0.tv.STATE'] })).error, 'pin');
    assert.equal((await s.handle('listScenes', {})).ok, true);
    const ok = await s.handle('saveScene', { name: 'x', members: ['hm.0.tv.STATE'], pin: '1234' });
    assert.equal(ok.ok, true);
});

(async () => {
    for (const [name, fn] of tests) {
        await fn();
        n++;
        console.log(`  ok  ${name}`);
    }
    console.log(`scenes: ${n} tests passed`);
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
