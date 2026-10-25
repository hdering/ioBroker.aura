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
const { sanitizeClientId } = createAdapter;

// ── In-memory object store, keyed by adapter-relative id ─────────────────────
function makeAdapter(initialObjects = {}) {
    const a = createAdapter({});
    const objects = new Map(Object.entries(initialObjects));

    a._objects = objects;
    a.getObjectAsync = async (id) => objects.get(id) || null;
    a.setObjectAsync = async (id, obj) => {
        objects.set(id, obj);
    };
    a.extendObjectAsync = async (id, patch) => {
        const obj = objects.get(id);
        if (obj) {
            objects.set(id, { ...obj, ...patch, common: { ...obj.common, ...patch.common } });
        }
    };
    a.setObjectNotExistsAsync = async (id, obj) => {
        if (!objects.has(id)) {
            objects.set(id, obj);
        }
    };
    a.getObjectViewAsync = async (_design, type, params) => {
        const rows = [];
        for (const [id, obj] of objects) {
            const full = `aura.0.${id}`;
            if (obj.type !== type) {
                continue;
            }
            if (full < params.startkey || full > params.endkey) {
                continue;
            }
            rows.push({ id: full, value: obj });
        }
        return { rows };
    };
    a.getStateAsync = async () => null;

    // Relay plumbing: the client relays read/write states and delete objects.
    const states = new Map();
    a._states = states;
    a.setStateAsync = async (id, value) => {
        states.set(id, value && typeof value === 'object' ? value : { val: value, ack: true });
    };
    a.delForeignObjectAsync = async (id) => {
        const rel = id.startsWith('aura.0.') ? id.slice('aura.0.'.length) : id;
        objects.delete(rel);
    };
    a.delForeignStateAsync = async (id) => {
        const rel = id.startsWith('aura.0.') ? id.slice('aura.0.'.length) : id;
        states.delete(rel);
    };
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
        for (const id of FULL_TREE) {
            assert.ok(a._objects.has(id), `missing object: ${id}`);
        }
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
        for (const id of FULL_TREE) {
            assert.ok(a._objects.has(id), `missing object after heal: ${id}`);
        }
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

    // ── #620: client ids are sanitised before they become object-id segments ──
    {
        assert.strictEqual(sanitizeClientId('Wohnzimmer Tablet'), 'wohnzimmer-tablet');
        assert.strictEqual(sanitizeClientId('  Kitchen_TV  '), 'kitchen_tv');
        assert.strictEqual(sanitizeClientId('a1b2c3d4e5f60718'), 'a1b2c3d4e5f60718', 'fingerprints pass through');
        assert.strictEqual(sanitizeClientId('foo.bar'), 'foo-bar', 'dots must never nest the tree');
        assert.strictEqual(sanitizeClientId('../../system.adapter'), 'system-adapter', 'no traversal');
        assert.strictEqual(sanitizeClientId('---'), '', 'nothing but separators is not an id');
        assert.strictEqual(sanitizeClientId(''), '');
        assert.strictEqual(sanitizeClientId(null), '');
        assert.strictEqual(sanitizeClientId('x'.repeat(80)).length, 40, 'ids are capped');
        // The relay states live directly under clients.* and cannot be clients themselves.
        for (const reserved of ['register', 'Resolution', 'deleteRequest']) {
            assert.strictEqual(sanitizeClientId(reserved), '', `${reserved} must be rejected`);
        }
        console.log('✓ client ids are sanitised (#620)');
    }

    // ── #620: the register relay builds the tree under the sanitised id ──────
    {
        const a = makeAdapter();
        await a.onStateChange('aura.0.clients.register', {
            val: JSON.stringify({ clientId: 'Wohnzimmer Tablet', name: 'Wohnzimmer', userAgent: 'UA/1' }),
            ack: false,
        });
        assert.ok(a._objects.has('clients.wohnzimmer-tablet.navigate.url'), 'tree must use the sanitised id');
        assert.ok(!a._objects.has('clients.Wohnzimmer Tablet'), 'raw id must not create objects');
        assert.strictEqual(a._states.get('clients.wohnzimmer-tablet.info.name').val, 'Wohnzimmer');
        assert.strictEqual(a._states.get('clients.wohnzimmer-tablet.info.userAgent').val, 'UA/1');
        assert.strictEqual(a._states.get('clients.register').val, '', 'relay clears itself');
        console.log('✓ register relay uses the sanitised id');
    }

    // ── #620: a reserved id is rejected instead of colliding with the relay ──
    {
        const a = makeAdapter();
        await a.onStateChange('aura.0.clients.register', {
            val: JSON.stringify({ clientId: 'register', name: 'Nope' }),
            ack: false,
        });
        assert.ok(!a._objects.has('clients.register.navigate.url'), 'a reserved id must build nothing');
        assert.strictEqual(a._states.get('clients.register').val, '', 'relay still clears itself');
        console.log('✓ reserved client ids are rejected');
    }

    // ── #620: renaming a device moves the tree — the old one is torn down ────
    {
        const a = makeAdapter();
        await a.onStateChange('aura.0.clients.register', {
            val: JSON.stringify({ clientId: 'a1b2c3d4e5f60718', name: 'Tablet' }),
            ack: false,
        });
        await a.onStateChange('aura.0.clients.register', {
            val: JSON.stringify({ clientId: 'kitchen-tablet', name: 'Tablet' }),
            ack: false,
        });
        await a.onStateChange('aura.0.clients.deleteRequest', { val: 'a1b2c3d4e5f60718', ack: false });

        assert.ok(a._objects.has('clients.kitchen-tablet.navigate.url'), 'the new tree must survive');
        assert.ok(!a._objects.has('clients.a1b2c3d4e5f60718'), 'the old channel must be gone');
        assert.ok(!a._objects.has('clients.a1b2c3d4e5f60718.navigate.url'), 'the old tree must be gone');
        assert.ok(!a._states.has('clients.a1b2c3d4e5f60718.info.name'), 'the old name value must be gone');
        console.log('✓ moving a device to a speaking id leaves no orphan tree');
    }

    // ── #624: the delete relay leaves nothing behind, whatever the tree contains ──
    {
        const a = makeAdapter();
        await a.onStateChange('aura.0.clients.register', {
            val: JSON.stringify({ clientId: 'kitchen-tablet', name: 'Küche' }),
            ack: false,
        });
        assert.ok(a._objects.has('clients.kitchen-tablet.messages.send'), 'precondition: messages DP exists');
        // A datapoint the delete list never knew about — the messages channel was
        // exactly that case, and it kept the client visible in the object tree.
        a._objects.set('clients.kitchen-tablet.custom.deep.value', state('Something added later'));

        await a.onStateChange('aura.0.clients.deleteRequest', { val: 'kitchen-tablet', ack: false });

        const leftovers = [...a._objects.keys()].filter((k) => k.startsWith('clients.kitchen-tablet'));
        assert.deepStrictEqual(leftovers, [], `nothing may survive the delete: ${leftovers.join(', ')}`);
        const leftStates = [...a._states.keys()].filter((k) => k.startsWith('clients.kitchen-tablet'));
        assert.deepStrictEqual(leftStates, [], `no orphan values either: ${leftStates.join(', ')}`);
        assert.strictEqual(a._states.get('clients.deleteRequest').val, '', 'relay clears itself');
        console.log('✓ delete relay removes the whole tree, including unlisted datapoints (#624)');
    }

    // ── #624: a manual write with "ack" ticked deletes just the same ─────────
    {
        const a = makeAdapter();
        await a.onStateChange('aura.0.clients.register', {
            val: JSON.stringify({ clientId: 'a1b2c3d4e5f60718', name: 'Tablet' }),
            ack: false,
        });
        await a.onStateChange('aura.0.clients.deleteRequest', { val: 'a1b2c3d4e5f60718', ack: true });
        assert.ok(!a._objects.has('clients.a1b2c3d4e5f60718'), 'an acknowledged write must delete too');
        // The adapter's own clear must not re-enter the handler.
        await a.onStateChange('aura.0.clients.deleteRequest', { val: '', ack: true });
        console.log('✓ deleteRequest also accepts an acknowledged write (#624)');
    }

    // ── #624: only fingerprint ids get the 8-char short name ─────────────────
    {
        const a = makeAdapter();
        // Resolution relay first (no name in the payload) — this is what truncated
        // speaking ids to "wohnzimm" in the object tree.
        await a.onStateChange('aura.0.clients.resolution', {
            val: JSON.stringify({ clientId: 'wohnzimmer-tablet', width: 1280, height: 800 }),
            ack: false,
        });
        assert.strictEqual(
            a._objects.get('clients.wohnzimmer-tablet').common.name,
            'wohnzimmer-tablet',
            'a speaking id must not be cut after 8 characters',
        );

        const b = makeAdapter();
        await b.onStateChange('aura.0.clients.resolution', {
            val: JSON.stringify({ clientId: 'a1b2c3d4e5f60718', width: 1280, height: 800 }),
            ack: false,
        });
        assert.strictEqual(
            b._objects.get('clients.a1b2c3d4e5f60718').common.name,
            'a1b2c3d4',
            'fingerprints keep their short label',
        );
        console.log('✓ fallback client name keeps speaking ids whole (#624)');
    }

    // ── #624: renaming a client updates the channel name as well ─────────────
    {
        const a = makeAdapter();
        await a.onStateChange('aura.0.clients.resolution', {
            val: JSON.stringify({ clientId: 'kitchen-tablet', width: 1280, height: 800 }),
            ack: false,
        });
        // Registering right after the resolution relay corrects the fallback name.
        await a.onStateChange('aura.0.clients.register', {
            val: JSON.stringify({ clientId: 'kitchen-tablet', name: 'Küche' }),
            ack: false,
        });
        assert.strictEqual(a._objects.get('clients.kitchen-tablet').common.name, 'Küche');
        // A later rename writes info.name — the channel has to follow.
        await a.onStateChange('aura.0.clients.kitchen-tablet.info.name', { val: 'Küche oben', ack: false });
        assert.strictEqual(a._objects.get('clients.kitchen-tablet').common.name, 'Küche oben');
        console.log('✓ a rename is mirrored onto the client channel (#624)');
    }

    // ── #844: the first device token claims the id, later ones never overwrite it ─
    {
        const a = makeAdapter();
        a.getStateAsync = async (id) => a._states.get(id) || null;
        const report = (deviceToken) =>
            a.onStateChange('aura.0.clients.resolution', {
                val: JSON.stringify({ clientId: 'a1b2c3d4e5f60718', width: 800, height: 1280, deviceToken }),
                ack: false,
            });
        await report('tablet-flur');
        assert.ok(a._objects.has('clients.a1b2c3d4e5f60718.info.deviceToken'), 'deviceToken DP is created');
        assert.strictEqual(a._states.get('clients.a1b2c3d4e5f60718.info.deviceToken').val, 'tablet-flur');
        await report('tablet-wohnzimmer');
        assert.strictEqual(
            a._states.get('clients.a1b2c3d4e5f60718.info.deviceToken').val,
            'tablet-flur',
            'a second device must not take over the id',
        );
        console.log('✓ the first device token owns the client id (#844)');
    }

    console.log('\nAll client-tree tests passed.');
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
