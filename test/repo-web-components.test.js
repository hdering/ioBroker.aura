'use strict';

/**
 * Web components of adapters that are not installed, from the short forms of
 * `common.webComponents` in the active repositories (@iobroker/web-components 0.8).
 */

const assert = require('assert');
const { repoWebComponents, adminFolderUrl } = require('../lib/repoWebComponents');

const flow = (version, extra = {}) => ({
    version,
    meta: 'https://raw.githubusercontent.com/ioBroker/ioBroker.flow/main/io-package.json',
    webComponents: [
        {
            manifest: 'webcomponents/flow-diagram.json',
            tag: 'iob-flow-diagram',
            name: { en: 'Flow diagram', de: 'Fluss-Diagramm', fr: '' },
            icon: '../flow.svg',
            size: { width: 480, height: 340 },
            ...extra,
        },
    ],
});
const repos = {
    stable: {
        json: {
            flow: flow('0.2.1'),
            // only the path: no short form, nothing to show
            cameras: { version: '3.4.0', meta: 'x', webComponents: ['webcomponents/cameras-rtsp.json'] },
            hue: { version: '3.10.0' },
        },
    },
    beta: {
        json: {
            flow: flow('0.3.0', { name: 'Flow' }),
            sonos: {
                version: '4.7.0',
                meta: 'https://raw.githubusercontent.com/ioBroker/ioBroker.sonos/master/io-package.json',
                webComponents: [
                    'webcomponents/old.json',
                    { manifest: 'webcomponents/sonos-player.json', tag: 'iob-sonos-player', name: 'Player' },
                    { manifest: 'webcomponents/x.json', tag: 'NoHyphen' },
                    {
                        manifest: 'webcomponents/y.json',
                        tag: 'iob-y',
                        icon: 'data:image/png;base64,AA',
                        size: { width: 0 },
                    },
                    null,
                ],
            },
        },
    },
    never: { json: null },
};

// ── Stable: the short form with an absolute icon on the web; paths are left out ──
{
    const r = repoWebComponents({ activeRepo: 'stable', repos });
    assert.deepStrictEqual(r.repos, ['stable']);
    assert.deepStrictEqual(r.components, [
        {
            adapter: 'flow',
            version: '0.2.1',
            tag: 'iob-flow-diagram',
            name: { en: 'Flow diagram', de: 'Fluss-Diagramm' },
            iconUrl: 'https://raw.githubusercontent.com/ioBroker/ioBroker.flow/main/admin/flow.svg',
            size: { width: 480, height: 340 },
        },
    ]);
}

// ── Several repositories: each adapter in its highest version ──
{
    const r = repoWebComponents({ activeRepo: ['stable', 'beta'], repos });
    assert.deepStrictEqual(
        r.components.map((c) => [c.adapter, c.version, c.tag, c.name]),
        [
            ['flow', '0.3.0', 'iob-flow-diagram', 'Flow'],
            ['sonos', '4.7.0', 'iob-sonos-player', 'Player'],
            ['sonos', '4.7.0', 'iob-y', null],
        ],
    );
    const sonos = r.components.find((c) => c.tag === 'iob-sonos-player');
    assert.strictEqual(sonos.iconUrl, undefined, 'no icon');
    assert.strictEqual(sonos.size, undefined, 'no size');
    const y = r.components.find((c) => c.tag === 'iob-y');
    assert.strictEqual(y.iconUrl, undefined, 'a data: icon is not taken');
    assert.strictEqual(y.size, undefined, 'a size of 0 is none');
}

// ── Only the chosen channel: an active repository without data falls back to none ──
{
    assert.strictEqual(repoWebComponents({ activeRepo: 'never', repos }), null, 'no fallback to other channels');
    assert.deepStrictEqual(repoWebComponents({ activeRepo: 'beta', repos }).repos, ['beta']);
    assert.strictEqual(repoWebComponents({ activeRepo: 'stable', repos: {} }), null);
}

// ── The admin folder from the io-package.json URL of the repository entry ──
{
    assert.strictEqual(
        adminFolderUrl('https://raw.githubusercontent.com/a/b/main/io-package.json').href,
        'https://raw.githubusercontent.com/a/b/main/admin/',
    );
    assert.strictEqual(adminFolderUrl('file:///x/io-package.json'), null);
    assert.strictEqual(adminFolderUrl('https://x/package.json'), null);
    assert.strictEqual(adminFolderUrl(undefined), null);
}

console.log('repo-web-components: ok');
