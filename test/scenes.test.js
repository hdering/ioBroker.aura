'use strict';

/**
 * Unit tests for the scenes widget backend (issue #825): id rules, member checks,
 * value coercion, instance detection and learning — against a fake adapter.
 */

const assert = require('assert');
const {
    slugify,
    uniqueSceneId,
    isOwnSceneId,
    memberProblem,
    coerceValue,
    mergeMembers,
    validateSave,
    createSceneService,
} = require('../lib/scenes');

let n = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

function fakeAdapter({ objects = {}, states = {} } = {}) {
    const objs = { ...objects };
    const log = { info() {}, warn() {} };
    return {
        objs,
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

const LAMP = 'hm.0.lamp.LEVEL';
const TV = 'hm.0.tv.STATE';
const BASE = {
    'system.adapter.scenes.0': { type: 'instance', common: {} },
    [LAMP]: { type: 'state', common: { name: 'Lampe', type: 'number', unit: '%', min: 0, max: 100 } },
    [TV]: { type: 'state', common: { name: { en: 'TV', de: 'Fernseher' }, type: 'boolean' } },
    'hm.0.temp.ACTUAL': { type: 'state', common: { name: 'Temp', type: 'number', write: false } },
    'scene.0.Kino': {
        type: 'state',
        common: { name: 'Kino', role: 'scene.state' },
        native: { members: [{ id: 'x.y', setIfTrue: 1 }] },
    },
};

// ── pure helpers ───────────────────────────────────────────────────────────

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

test('member rules: writable states only, never system.* or scene.*', () => {
    const st = { type: 'state', common: {} };
    assert.equal(memberProblem('a.b', st), null);
    assert.equal(memberProblem('a.*', st), 'invalid');
    assert.equal(memberProblem('system.adapter.x.0.alive', st), 'forbidden');
    assert.equal(memberProblem('scene.0.Kino', st), 'forbidden');
    assert.equal(memberProblem('a.b', null), 'missing');
    assert.equal(memberProblem('a.b', { type: 'channel', common: {} }), 'no state');
    assert.equal(memberProblem('a.b', { type: 'state', common: { write: false } }), 'read-only');
});

test('values are coerced to the state type', () => {
    assert.equal(coerceValue('42,5', 'number'), 42.5);
    assert.equal(coerceValue('abc', 'number'), undefined);
    assert.equal(coerceValue('', 'number'), undefined);
    assert.equal(coerceValue('an', 'boolean'), true);
    assert.equal(coerceValue(0, 'boolean'), false);
    assert.equal(coerceValue('vielleicht', 'boolean'), undefined);
    assert.equal(coerceValue(5, 'string'), '5');
    assert.equal(coerceValue(7, 'mixed'), 7);
    assert.equal(coerceValue({ a: 1 }, 'mixed'), undefined);
});

test('merge keeps stored members, appends new ones, drops removed', () => {
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

test('save validation: name, members, duplicates', () => {
    assert.equal(validateSave({ name: ' ', members: ['a'] }).error, 'name missing');
    assert.equal(validateSave({ name: 'x', members: [] }).error, 'no devices');
    assert.equal(validateSave({ name: 'x', members: [{ value: 1 }] }).error, 'invalid member');
    assert.deepEqual(validateSave({ name: ' x ', members: ['a', { id: 'b', value: 3 }, 'a'] }), {
        name: 'x',
        members: [
            { id: 'a', value: undefined },
            { id: 'b', value: 3 },
        ],
    });
});

// ── service ───────────────────────────────────────────────────────────────

test('sceneStatus finds the running scenes instance by itself', async () => {
    const a = fakeAdapter({
        objects: { ...BASE, 'system.adapter.scenes.1': { type: 'instance', common: {} } },
        states: { 'system.adapter.scenes.1.alive': true },
    });
    const r = await createSceneService(a).handle('sceneStatus', {});
    assert.deepEqual(r, { ok: true, instance: 'scenes.1', installed: true, running: true });
});

test('sceneStatus: installed but stopped, and not installed', async () => {
    const r = await createSceneService(fakeAdapter({ objects: BASE })).handle('sceneStatus', {});
    assert.deepEqual([r.instance, r.installed, r.running], ['scenes.0', true, false]);
    const none = await createSceneService(fakeAdapter()).handle('sceneStatus', {});
    assert.equal(none.installed, false);
});

test('sceneDevices: names, types, current values and problems', async () => {
    const a = fakeAdapter({ objects: BASE, states: { [LAMP]: 60 } });
    const r = await createSceneService(a).handle('sceneDevices', {
        ids: [LAMP, TV, 'hm.0.temp.ACTUAL', 'gone.0.x', LAMP],
    });
    assert.deepEqual(
        r.devices.map((d) => [d.id, d.name, d.type, d.value, d.problem]),
        [
            [LAMP, 'Lampe', 'number', 60, null],
            [TV, 'Fernseher', 'boolean', undefined, null],
            ['hm.0.temp.ACTUAL', 'Temp', 'number', undefined, 'read-only'],
            ['gone.0.x', 'gone.0.x', '', undefined, 'missing'],
        ],
    );
    assert.equal(r.devices[0].max, 100);
});

test('save takes given values, learns the rest, uses the detected engine', async () => {
    const a = fakeAdapter({
        objects: { ...BASE, 'system.adapter.scenes.2': { type: 'instance', common: {} } },
        states: { [LAMP]: 60, 'system.adapter.scenes.2.alive': true },
    });
    const s = createSceneService(a);
    const r = await s.handle('saveScene', {
        name: 'Abend Licht',
        members: [{ id: LAMP }, { id: TV, value: 'true' }],
    });
    assert.deepEqual(r, { ok: true, id: 'scene.0.aura.Abend_Licht', missing: [] });
    const o = a.objs['scene.0.aura.Abend_Licht'];
    assert.equal(o.common.engine, 'system.adapter.scenes.2');
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

test('save rejects read-only, missing, system and scene members', async () => {
    const a = fakeAdapter({ objects: BASE });
    const s = createSceneService(a);
    for (const bad of ['hm.0.temp.ACTUAL', 'hm.0.door.OPEN', 'system.adapter.scenes.0.alive', 'scene.0.Kino']) {
        const r = await s.handle('saveScene', { name: 'x', members: [TV, bad] });
        assert.equal(r.ok, false, bad);
    }
    assert.ok(!Object.keys(a.objs).some((id) => id.startsWith('scene.0.aura.')));
});

test('save without the scenes adapter fails', async () => {
    const a = fakeAdapter({ objects: { [TV]: BASE[TV] } });
    const r = await createSceneService(a).handle('saveScene', { name: 'x', members: [{ id: TV, value: true }] });
    assert.equal(r.ok, false);
});

test('update keeps stored values unless a new one is given; missing values reported', async () => {
    const states = { [LAMP]: 60 };
    const a = fakeAdapter({ objects: BASE, states });
    const s = createSceneService(a);
    const { id } = await s.handle('saveScene', { name: 'A', members: [LAMP] });
    states[LAMP] = 10;
    const r = await s.handle('saveScene', { id, name: 'B', members: [LAMP, TV] });
    assert.deepEqual(r.missing, [TV]);
    assert.equal(a.objs[id].common.name, 'B');
    assert.equal(a.objs[id].native.members[0].setIfTrue, 60, 'old value kept');

    await s.handle('saveScene', { id, name: 'B', members: [{ id: LAMP, value: 35 }] });
    assert.equal(a.objs[id].native.members[0].setIfTrue, 35, 'explicit value wins');
    assert.equal(a.objs[id].native.members.length, 1, 'removed member dropped');
});

test('foreign scenes cannot be changed or deleted', async () => {
    const a = fakeAdapter({ objects: BASE });
    const s = createSceneService(a);
    assert.equal((await s.handle('deleteScene', { id: 'scene.0.Kino' })).ok, false);
    const r = await s.handle('saveScene', { id: 'scene.0.Kino', name: 'x', members: [{ id: TV, value: true }] });
    assert.equal(r.ok, false);
    assert.ok(a.objs['scene.0.Kino']);
});

test('delete removes an own scene', async () => {
    const a = fakeAdapter({ objects: BASE });
    const s = createSceneService(a);
    const { id } = await s.handle('saveScene', { name: 'Weg', members: [{ id: TV, value: false }] });
    assert.deepEqual(await s.handle('deleteScene', { id }), { ok: true });
    assert.equal(a.objs[id], undefined);
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
