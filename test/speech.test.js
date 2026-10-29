'use strict';

/**
 * Adapter side of the speech output (issue #834).
 *
 *   - clients.<id>.speech.* is created with the tree and backfilled for old clients
 *   - the SayIt bridge relays tts.<ext> writes of "browser" instances to speech.say
 *   - messages carry `speak` from the payload or the per-severity admin default
 *   - /webfs/<instance>/<file>.mp3 is served from the file storage, audio only
 *
 * main.js is loaded with @iobroker/adapter-core stubbed out (see idle-return.test.js).
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
require.cache[corePath] = {
    id: corePath,
    filename: corePath,
    loaded: true,
    exports: { Adapter: FakeAdapter },
};

const createAdapter = require('../main.js');
const { parseStorageAudioPath } = createAdapter;
const { createSayitBridge, relaysInstance } = require('../lib/sayitBridge');

function makeAdapter() {
    const a = createAdapter({});
    const objects = new Map();
    const states = new Map();
    a._objects = objects;
    a._states = states;
    const rel = (id) => (id.startsWith('aura.0.') ? id.slice('aura.0.'.length) : id);
    a.getObjectAsync = async (id) => objects.get(rel(id)) || null;
    a.setObjectNotExistsAsync = async (id, obj) => {
        if (!objects.has(rel(id))) objects.set(rel(id), obj);
    };
    a.extendObjectAsync = async (id, patch) => {
        const cur = objects.get(rel(id)) || { common: {}, native: {} };
        objects.set(rel(id), { ...cur, common: { ...cur.common, ...patch.common } });
    };
    a.setStateAsync = async (id, value) => {
        states.set(rel(id), value);
    };
    return a;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
    // ── Per-client datapoints ────────────────────────────────────────────────
    {
        const a = makeAdapter();
        await a._ensureSpeechDps('tablet');
        for (const dp of ['say', 'playing', 'lastResult', 'muted', 'volume']) {
            assert.ok(a._objects.has(`clients.tablet.speech.${dp}`), `missing speech.${dp}`);
        }
        const vol = a._objects.get('clients.tablet.speech.volume').common;
        assert.strictEqual(vol.def, 100);
        assert.strictEqual(vol.min, 0);
        assert.strictEqual(vol.max, 100);
        const res = a._objects.get('clients.tablet.speech.lastResult').common.states;
        for (const r of ['played', 'blocked', 'muted', 'skipped', 'interrupted', 'unsupported', 'error']) {
            assert.ok(res[r], `lastResult offers ${r}`);
        }
        console.log('✓ clients.<id>.speech.* is created with sane definitions');
    }

    {
        // lastResult of an older version lacks `unsupported` (Fully without a voice).
        const a = makeAdapter();
        a._objects.set('clients.old.speech.lastResult', {
            type: 'state',
            common: { type: 'string', states: { played: 'played', error: 'error' } },
            native: {},
        });
        await a._ensureSpeechDps('old');
        assert.ok(a._objects.get('clients.old.speech.lastResult').common.states.unsupported);
        console.log('✓ an old lastResult object learns the unsupported result');
    }

    {
        // A client from before #834 has its tree (sentinel navigate.url) but no speech
        // channel — the sync pass must add it.
        const a = makeAdapter();
        a._objects.set('clients.old.navigate.url', { type: 'state', common: {}, native: {} });
        a.getStateAsync = async () => null;
        a._setTargetStates = async () => {};
        a._syncLayoutMessageDps = async () => {};
        a._listClientIds = async () => ['old'];
        await a._syncNavigateTargets();
        assert.ok(a._objects.has('clients.old.speech.say'), 'backfill must add speech.say');
        console.log('✓ existing clients get the speech datapoints on the next sync');
    }

    // ── Message `speak` ──────────────────────────────────────────────────────
    {
        const a = makeAdapter();
        assert.strictEqual(a._normalizeMessage('Hallo').speak, undefined, 'off by default');
        assert.strictEqual(a._normalizeMessage('{"text":"x","speak":true}').speak, true);
        a._messageDefaultsCache = { speakSeverities: ['warning', 'error', 'bogus'] };
        assert.deepStrictEqual(a._messageDefaults().speakSeverities, ['warning', 'error']);
        assert.strictEqual(a._normalizeMessage('{"text":"x","severity":"error"}').speak, true, 'severity default');
        assert.strictEqual(a._normalizeMessage('{"text":"x","severity":"info"}').speak, undefined);
        assert.strictEqual(
            a._normalizeMessage('{"text":"x","severity":"error","speak":false}').speak,
            undefined,
            'explicit false beats the default',
        );
        console.log('✓ messages carry speak from the payload or the severity default');
    }

    // ── SayIt bridge ─────────────────────────────────────────────────────────
    {
        assert.ok(relaysInstance({ type: 'instance', common: { enabled: true }, native: { type: 'browser' } }));
        assert.ok(!relaysInstance({ type: 'instance', common: {}, native: { type: 'sonos' } }), 'not a browser output');
        assert.ok(
            !relaysInstance({ type: 'instance', common: { enabled: false }, native: { type: 'browser' } }),
            'disabled instance',
        );
        assert.ok(
            !relaysInstance({ type: 'instance', common: {}, native: { type: 'browser', browserVis: 'aura' } }),
            'a SayIt that addresses Aura itself is not relayed twice',
        );
        assert.ok(relaysInstance({ type: 'instance', common: {}, native: { type: 'browser', browserVis: '2' } }));

        const announced = [];
        const subs = [];
        const objs = {
            'system.adapter.sayit.0': { type: 'instance', common: { enabled: true }, native: { type: 'browser' } },
            'system.adapter.sayit.1': { type: 'instance', common: { enabled: true }, native: { type: 'sonos' } },
        };
        const fake = {
            log: { info() {}, debug() {}, warn() {} },
            getForeignObjectsAsync: async () => objs,
            subscribeForeignFiles: async (id, pattern) => subs.push(`+${id}/${pattern}`),
            unsubscribeForeignFiles: async (id, pattern) => subs.push(`-${id}/${pattern}`),
        };
        const bridge = createSayitBridge(fake, { announce: (p) => announced.push(p) });
        await bridge.scan();
        assert.deepStrictEqual(subs, ['+sayit.0/tts.*'], 'only the browser instance is watched');

        bridge.onFileChange('sayit.0', 'tts.mp3', 12345);
        bridge.onFileChange('sayit.0', '/tts.mp3', 12345); // double event → one announcement
        bridge.onFileChange('sayit.1', 'tts.mp3', 1); // not watched
        bridge.onFileChange('sayit.0', 'tts.userfiles/gong.mp3', 1); // not the generated file
        bridge.onFileChange('sayit.0', 'tts.mp3', null); // deleted
        await sleep(400);
        assert.strictEqual(announced.length, 1, `one announcement, got ${JSON.stringify(announced)}`);
        assert.match(announced[0].file, /^\/sayit\.0\/tts\.mp3\?ts=\d+$/);
        assert.strictEqual(announced[0].source, 'sayit.0');

        // Switching the instance away from "browser" stops the relay.
        objs['system.adapter.sayit.0'].native.type = 'sonos';
        await bridge.scan();
        assert.deepStrictEqual(subs, ['+sayit.0/tts.*', '-sayit.0/tts.*']);
        bridge.onFileChange('sayit.0', 'tts.mp3', 1);
        await sleep(400);
        assert.strictEqual(announced.length, 1, 'no relay after the switch');
        assert.strictEqual(bridge.onObjectChange('system.adapter.sayit.0'), true);
        assert.strictEqual(bridge.onObjectChange('aura.0.timers.x'), false);
        bridge.stop();
        console.log('✓ the SayIt bridge relays tts files of browser instances only, once each');
    }

    {
        const a = makeAdapter();
        await a._announce({ file: '/sayit.0/tts.mp3?ts=1' });
        const st = a._states.get('speech.say');
        assert.deepStrictEqual(JSON.parse(st.val), { file: '/sayit.0/tts.mp3?ts=1' });
        assert.strictEqual(st.ack, true);
        console.log('✓ an announcement lands on speech.say');
    }

    // ── /webfs audio from the file storage ───────────────────────────────────
    {
        assert.deepStrictEqual(parseStorageAudioPath('/sayit.0/tts.mp3'), { meta: 'sayit.0', file: 'tts.mp3' });
        assert.deepStrictEqual(parseStorageAudioPath('/0_userdata.0/sounds/Gong%201.ogg'), {
            meta: '0_userdata.0',
            file: 'sounds/Gong 1.ogg',
        });
        assert.strictEqual(parseStorageAudioPath('/aura.0/security.json'), null, 'audio only');
        assert.strictEqual(parseStorageAudioPath('/sayit.0/../aura.0/x.mp3'), null, 'no traversal');
        assert.strictEqual(parseStorageAudioPath('/sayit/tts.mp3'), null, 'an instance, not an adapter');
        assert.strictEqual(parseStorageAudioPath('/adapter/x/y.mp3'), null);

        const a = makeAdapter();
        a.readFileAsync = async (meta, file) => {
            if (meta === 'sayit.0' && file === 'tts.mp3')
                return { file: Buffer.from('ID3fake'), mimeType: 'audio/mpeg' };
            throw new Error('Not exists');
        };
        const res = {
            head: null,
            body: null,
            writeHead(code, h) {
                this.head = { code, h };
            },
            end(b) {
                this.body = b;
            },
        };
        assert.strictEqual(await a.serveStorageFile('sayit.0', 'tts.mp3', res), true);
        assert.strictEqual(res.head.code, 200);
        assert.strictEqual(res.head.h['Content-Type'], 'audio/mpeg');
        assert.strictEqual(String(res.body), 'ID3fake');
        assert.strictEqual(await a.serveStorageFile('sayit.0', 'missing.mp3', res), false, 'falls back to the proxy');
        console.log('✓ /webfs serves instance audio files from the file storage');
    }

    console.log('\nspeech tests passed');
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
