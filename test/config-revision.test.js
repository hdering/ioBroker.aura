'use strict';

/**
 * info.configRevision (#882): the frontend polls this instead of the config states.
 *
 *   - start: the ts of every synced config state, nothing else
 *   - a config change moves only its own entry; same ts or a foreign key writes nothing
 *
 * `@iobroker/adapter-core` is stubbed out, as in status-latch-adapter.test.js.
 *
 *   node test/config-revision.test.js
 */

const assert = require('assert');

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

function makeAdapter(states) {
    const a = createAdapter({});
    const map = new Map(Object.entries(states));
    const writes = [];
    a.setObjectNotExistsAsync = async () => {};
    a.getStateAsync = async (id) => map.get(id) ?? null;
    a.setStateAsync = async (id, st) => writes.push({ id, val: st.val });
    a.setState = (id, st) => writes.push({ id, val: st.val });
    return { a, writes, last: () => JSON.parse(writes[writes.length - 1].val) };
}

let passed = 0;
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('start: ts of each config state', async () => {
    const { a, last } = makeAdapter({
        'config.dashboard': { val: '{}', ts: 100 },
        'config.theme': { val: '{}', ts: 200 },
        'config.messageDefaults': { val: '{}', ts: 300 },
    });
    await a._initConfigRevision();
    assert.deepStrictEqual(last(), { 'config.dashboard': 100, 'config.theme': 200 });
});

test('a change moves only its own entry', async () => {
    const { a, writes, last } = makeAdapter({ 'config.dashboard': { val: '{}', ts: 100 } });
    await a._initConfigRevision();
    a._bumpConfigRevision('config.theme', 500);
    assert.deepStrictEqual(last(), { 'config.dashboard': 100, 'config.theme': 500 });
    const n = writes.length;
    a._bumpConfigRevision('config.theme', 500);
    a._bumpConfigRevision('config.announcements', 600);
    assert.strictEqual(writes.length, n, 'same ts or a key outside the sync writes nothing');
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
