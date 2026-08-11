'use strict';

/**
 * Unit tests for the per-client object tree (aura.0.clients.<id>.*).
 *
 * Regression guard for #532: a client whose register write never reached the adapter
 * was stuck with half a tree forever — the resolution relay created the channel and the
 * resolution DPs, but navigate.* / popup.* were only ever created by the register relay,
 * and every backfill enumerated clients over `.navigate.url`, i.e. over the very DP the
 * affected clients were missing.
 *
 * main.js is loaded with @iobroker/adapter-core stubbed out, so the adapter class can be
 * instantiated without a running js-controller.
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

// ── In-memory object store, keyed by adapter-relative id ─────────────────────
function makeAdapter(initialObjects = {}) {
    const a = createAdapter({});
    const objects = new Map(Object.entries(initialObjects));

    a._objects = objects;
    a.getObjectAsync = async (id) => objects.get(id) || null;
    a.setObjectAsync = async (id, obj) => {
        objects.set(id, obj);
    };
    a.setObjectNotExistsAsync = async (id, obj) => {
        if (!objects.has(id)) objects.set(id, obj);
    };
    a.getObjectViewAsync = async (_design, type, params) => {
        const rows = [];
        for (const [id, obj] of objects) {
            const full = `aura.0.${id}`;
            if (obj.type !== type) continue;
            if (full < params.startkey || full > params.endkey) continue;
            rows.push({ id: full, value: obj });
        }
        return { rows };
    };
    a.getStateAsync = async () => null;
    return a;
}

const channel = (name) => ({ type: 'channel', common: { name }, native: {} });
const state = (name) => ({ type: 'state', common: { name, type: 'string' }, native: {} });

// The tree a client gets when only the resolution relay ever ran for it.
function halfBuiltClient(cId) {
    return {
        [`clients.${cId}`]: channel(cId.slice(0, 8)),
        [`clients.${cId}.info`]: channel('Info'),
        [`clients.${cId}.info.resolutionWidth`]: state('Screen resolution width'),
        [`clients.${cId}.info.resolutionHeight`]: state('Screen resolution height'),
        [`clients.${cId}.info.userAgent`]: state('User agent'),
    };
}

const FULL_TREE = [
    'clients.c1',
    'clients.c1.info',
    'clients.c1.info.name',
    'clients.c1.info.lastSeen',
    'clients.c1.info.resolutionWidth',
    'clients.c1.info.resolutionHeight',
    'clients.c1.info.userAgent',
    'clients.c1.navigate',
    'clients.c1.navigate.url',
    'clients.c1.navigate.target',
    'clients.c1.popup',
    'clients.c1.popup.open',
];

(async () => {
    // ── A fresh client gets the complete tree ────────────────────────────────
    {
        const a = makeAdapter();
        const created = await a._ensureClientTree('c1', 'PC_Office');
        assert.strictEqual(created, true, 'first call must report the tree as newly built');
        for (const id of FULL_TREE) assert.ok(a._objects.has(id), `missing object: ${id}`);
        assert.strictEqual(a._objects.get('clients.c1').common.name, 'PC_Office');
        console.log('✓ register path creates the full client tree');
    }

    // ── Idempotent: a complete tree is left alone ────────────────────────────
    {
        const a = makeAdapter();
        await a._ensureClientTree('c1', 'PC_Office');
        const before = a._objects.size;
        const created = await a._ensureClientTree('c1', 'Someone else');
        assert.strictEqual(created, false, 'second call must report nothing to do');
        assert.strictEqual(a._objects.size, before, 'no objects may be added twice');
        assert.strictEqual(a._objects.get('clients.c1').common.name, 'PC_Office', 'name must not be overwritten');
        console.log('✓ a complete tree is left untouched');
    }

    // ── #532: a half-built client is completed, not skipped ──────────────────
    {
        const a = makeAdapter(halfBuiltClient('c1'));
        const created = await a._ensureClientTree('c1');
        assert.strictEqual(created, true, 'a half-built tree must be reported as incomplete');
        for (const id of FULL_TREE) assert.ok(a._objects.has(id), `missing object after heal: ${id}`);
        console.log('✓ half-built client (resolution relay only) is completed');
    }

    // ── #532: clients are enumerated over their channel, not over navigate.url ─
    {
        const a = makeAdapter({ ...halfBuiltClient('tablet'), 'clients.pc': channel('pc') });
        await a._ensureClientTree('pc', 'PC');
        const ids = await a._listClientIds();
        assert.deepStrictEqual(ids.sort(), ['pc', 'tablet'], 'both clients must be listed');
        console.log('✓ client enumeration finds clients without navigate.url');
    }

    // ── The startup sync heals every client and fills the selector ───────────
    {
        const a = makeAdapter(halfBuiltClient('tablet'));
        a.getStateAsync = async () => ({
            val: JSON.stringify({
                state: {
                    layouts: [
                        {
                            slug: 'home',
                            name: 'Home',
                            sections: [{ slug: 'main', name: 'Main', tabs: [{ slug: 'living', name: 'Living' }] }],
                        },
                    ],
                },
            }),
        });
        // The global selector exists on every instance; the client one must be created.
        a._objects.set('navigate.target', { type: 'state', common: { role: 'text' }, native: {} });

        await a._syncNavigateTargets();

        const target = a._objects.get('clients.tablet.navigate.target');
        assert.ok(target, 'client navigate.target must exist after sync');
        assert.deepStrictEqual(target.common.states, { 'home/living': 'Home / Living' });
        assert.ok(a._objects.has('clients.tablet.popup.open'), 'sync must also backfill popup.open');
        console.log('✓ startup sync heals half-built clients and fills the selector');
    }

    console.log('\nAll client-tree tests passed.');
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
