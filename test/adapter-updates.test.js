'use strict';

/**
 * Adapter-status update list (issue #962): updates are measured against the
 * active repositories, so switching Beta → Stable drops the Beta offers at once
 * instead of waiting for admin to rewrite info.updatesJson.
 */

const assert = require('assert');
const { computeAdapterUpdates, compareVersions, isIgnored } = require('../lib/adapterUpdates');

const repos = {
    stable: { json: { hue: { version: '3.10.0' }, shelly: { version: '9.0.0' }, admin: { version: '7.4.10' } } },
    beta: { json: { hue: { version: '3.12.1' }, shelly: { version: '10.1.0' }, admin: { version: '7.6.3' } } },
    never: { json: null },
};
const adapters = [
    { name: 'hue', version: '3.10.0' },
    { name: 'shelly', version: '10.1.0' }, // installed from Beta
    { name: 'admin', version: '7.4.10' },
];

// ── Beta active: every Beta offer above the installed version ─────────────
{
    const r = computeAdapterUpdates({ activeRepo: 'beta', repos, adapters });
    assert.deepStrictEqual(Object.keys(r.updates).sort(), ['admin', 'hue']);
    assert.strictEqual(r.updates.hue.availableVersion, '3.12.1');
    assert.strictEqual(r.updates.hue.repo, 'beta');
}

// ── Switched back to Stable: Beta offers vanish, the Beta install is no
//    "update" to the older Stable either ──────────────────────────────────
{
    const r = computeAdapterUpdates({ activeRepo: 'stable', repos, adapters });
    assert.deepStrictEqual(r.updates, {});
    assert.deepStrictEqual(r.repos, ['stable']);
}

// ── Several active repositories (array): the highest offer wins ─────────
{
    const r = computeAdapterUpdates({ activeRepo: ['stable', 'beta'], repos, adapters });
    assert.strictEqual(r.updates.admin.availableVersion, '7.6.3');
}

// ── Active repository never fetched → unknown, caller keeps its fallback ─
{
    assert.strictEqual(computeAdapterUpdates({ activeRepo: 'never', repos, adapters }), null);
    assert.strictEqual(computeAdapterUpdates({ activeRepo: undefined, repos, adapters }), null);
}

// ── ignoreVersion (admin "ignore this update") ───────────────────────────
{
    const r = computeAdapterUpdates({
        activeRepo: 'beta',
        repos,
        adapters: [
            { name: 'hue', version: '3.10.0', ignoreVersion: '3.12.1' },
            { name: 'admin', version: '7.4.10', ignoreVersion: '7.5.0' },
        ],
    });
    assert.deepStrictEqual(Object.keys(r.updates), ['admin']);
    assert.strictEqual(isIgnored('<=7.6.3', '7.6.3'), true);
    assert.strictEqual(isIgnored('<7.6.3', '7.6.3'), false);
    assert.strictEqual(isIgnored('', '1.0.0'), false);
}

// ── Version ordering still sane after the move out of main.js ───────────
{
    assert.strictEqual(compareVersions('1.0.0-beta.1', '1.0.0'), -1);
    assert.strictEqual(compareVersions('1.0.0-beta.10', '1.0.0-beta.2'), 1);
    assert.strictEqual(compareVersions('2.0.0', '2.0.0'), 0);
    assert.strictEqual(compareVersions('x', '1.0.0'), null);
}

console.log('adapter-updates: ok');
