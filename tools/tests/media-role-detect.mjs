// Verifies the Mediaplayer's generic, role-based device detection (issue #593).
//
// The fixture is the real object dump of a Yamaha RX-V481 posted in the issue: an
// adapter that follows the ioBroker role convention exactly, exposes seven player
// channels under one device, and keeps volume/mute/input one level above them.
// Checks the three things a path-based detector cannot do:
//   * map media.* / button.* roles onto the widget's option keys,
//   * resolve device-wide datapoints by walking up (own volume, not zone2's),
//   * carry common.min/max/step over so the slider is not stuck on 0…100.
// Plus: curated detectors keep precedence, and near-misses stay unmatched.
//
//   node tools/tests/media-role-detect.mjs
//
// No dev server needed — the object view is served from the fixture instead of ioBroker.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });

const bundle = join(cache, `aura-media-role-${process.pid}.mjs`);
await build({
    stdin: {
        contents: [
            "export { detectMediaDevices } from './src-vis/utils/mediaDeviceDetectors.ts';",
            "export { isPlaybackActive } from './src-vis/utils/mediaPlayback.ts';",
            "export { ensureDatapointCache, invalidateDatapointCache } from './src-vis/hooks/useDatapointList.ts';",
        ].join('\n'),
        resolveDir: process.cwd(),
        loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    external: ['react'],
    logLevel: 'warning',
    plugins: [
        {
            name: 'objects-from-fixture',
            setup(b) {
                b.onResolve({ filter: /^\.\/useIoBroker$/ }, (a) => ({ path: a.path, namespace: 'stub' }));
                b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
                    // Re-read per call so a test can swap the fixture after invalidating the cache.
                    contents: [
                        "import { readFileSync } from 'node:fs';",
                        'export const getObjectViewDirect = (type, from, to) => {',
                        "    const objs = JSON.parse(readFileSync(process.env.AURA_MEDIA_FIXTURE, 'utf8'));",
                        '    const rows = [];',
                        '    for (const [id, value] of Object.entries(objs)) {',
                        '        if (value.type !== type) continue;',
                        '        if (from && !(id >= from && id <= to)) continue;',
                        '        rows.push({ id, value: { ...value, _id: id } });',
                        '    }',
                        '    return Promise.resolve({ rows });',
                        '};',
                    ].join('\n'),
                    loader: 'js',
                }));
            },
        },
    ],
});
const { detectMediaDevices, isPlaybackActive, ensureDatapointCache, invalidateDatapointCache } = await import(
    pathToFileURL(bundle).href
);
rmSync(bundle, { force: true });

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail && !ok ? ` - ${detail}` : ''}`);
};
const eq = (name, got, want) =>
    check(
        name,
        JSON.stringify(got) === JSON.stringify(want),
        `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
    );
/** Same as eq, but insensitive to key order — configs are built in datapoint order. */
const sortKeys = (o) => (o ? Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b))) : o);
const eqObj = (name, got, want) => eq(name, sortKeys(got), sortKeys(want));

const YAMAHA = JSON.parse(readFileSync(join(process.cwd(), 'tools/tests/fixtures/yamaha-rx-v481.json'), 'utf8'));

/** Points the stubbed object view at `objects` and re-runs detection from scratch. */
async function detect(objects) {
    const path = join(cache, `aura-media-fixture-${process.pid}.json`);
    writeFileSync(path, JSON.stringify(objects));
    process.env.AURA_MEDIA_FIXTURE = path;
    invalidateDatapointCache();
    const devices = detectMediaDevices(await ensureDatapointCache());
    rmSync(path, { force: true });
    return devices;
}

const state = (role, over = {}) => ({
    type: 'state',
    common: { name: role, type: 'string', role, read: true, write: true, ...over },
});

// ── 1. Yamaha: every player channel is found, non-players are not ─────────────

const yamaha = await detect(YAMAHA);
const byId = new Map(yamaha.map((d) => [d.id, d]));
const P = 'yamaha.0.RX-V481.player';

eq(
    'all seven player channels detected',
    yamaha.map((d) => d.id).sort(),
    [
        `${P}.airplay`,
        `${P}.bluetooth`,
        `${P}.netPlayer`,
        `${P}.netRadio`,
        `${P}.server`,
        `${P}.spotify`,
        `${P}.usb`,
    ].sort(),
);
check('browse channel is not a player', !byId.has(`${P}.browse`), 'line1…line8 carry no media.title');
check('tuner channel is not a player', !byId.has('yamaha.0.RX-V481.tuner'), 'rdsService is role text');

// ── 2. netPlayer: the full option map ────────────────────────────────────────

const net = byId.get(`${P}.netPlayer`);
eq('label is device › channel', net?.label, 'Wohnzimmer › Network player');
eq('adapter taken from the namespace', net?.adapter, 'yamaha');
eqObj('metadata + transport roles mapped', net?.config, {
    titleDp: `${P}.netPlayer.track`,
    artistDp: `${P}.netPlayer.artist`,
    albumDp: `${P}.netPlayer.album`,
    coverDp: `${P}.netPlayer.albumArt`,
    playStateDp: `${P}.netPlayer.playback`,
    mediaProgressDp: `${P}.netPlayer.elapsedTime`,
    mediaLengthDp: `${P}.netPlayer.totalTime`,
    playDp: `${P}.netPlayer.play`,
    pauseDp: `${P}.netPlayer.pause`,
    stopDp: `${P}.netPlayer.stop`,
    nextDp: `${P}.netPlayer.next`,
    prevDp: `${P}.netPlayer.prev`,
    // shuffle/repeat carry the mode read-only; the widget writes, so the toggle wins.
    shuffleDp: `${P}.netPlayer.shuffleToggle`,
    repeatDp: `${P}.netPlayer.repeatToggle`,
    // playback is numbered 0=Play, 1=Stop, 2=Pause — pinned so the widget stops guessing.
    playValue: '0',
    volumeDp: 'yamaha.0.RX-V481.volume',
    volumeMin: -80.5,
    volumeMax: 16.5,
    volumeStep: 0.5,
    muteDp: 'yamaha.0.RX-V481.mute',
    sourceDp: 'yamaha.0.RX-V481.input',
});

// ── 3. Walking up picks the device, not a sibling zone or a limit ────────────

check(
    'zone2 volume never leaks into a main-zone player',
    yamaha.every((d) => d.config.volumeDp === 'yamaha.0.RX-V481.volume'),
    JSON.stringify(yamaha.map((d) => d.config.volumeDp)),
);
check(
    'advanced.maxVolume is not a direct child, so it is ignored',
    yamaha.every((d) => d.config.volumeDp !== 'yamaha.0.RX-V481.advanced.maxVolume'),
);

// netRadio has a writable playback and only the text flavour of elapsed time.
const radio = byId.get(`${P}.netRadio`);
eq('media.elapsed.text maps to the string option', radio?.config.mediaProgressStrDp, `${P}.netRadio.elapsedTime`);
eq('no numeric progress when the adapter has none', radio?.config.mediaProgressDp, undefined);

// ── 4. Curated detectors keep precedence ─────────────────────────────────────

const sonosRoot = 'sonos.0.root.192_168_1_5';
const withSonos = await detect({
    ...YAMAHA,
    'system.adapter.sonos.0': { type: 'instance', common: { name: 'sonos', enabled: true } },
    [`${sonosRoot}.currentTitle`]: state('media.title'),
    [`${sonosRoot}.currentArtist`]: state('media.artist'),
    [`${sonosRoot}.state_simple`]: state('media.state'),
    [`${sonosRoot}.volume`]: state('level.volume', { type: 'number' }),
});
const sonos = withSonos.filter((d) => d.id.startsWith('sonos.'));
eq('sonos yields exactly one device', sonos.length, 1);
eq('sonos keeps its hand-tuned adapter tag', sonos[0]?.adapter, 'sonos');
eq('sonos keeps its curated cover path', sonos[0]?.config.coverDp, `${sonosRoot}.cover_url`);

// ── 5. Near-misses and the mute fallback ─────────────────────────────────────

const edge = await detect({
    ...YAMAHA,
    'system.adapter.volumio.0': { type: 'instance', common: { name: 'volumio', enabled: true } },
    // Two mapped datapoints — a text state pair, not a player.
    '0_userdata.0.notes.lastTitle': state('media.title'),
    '0_userdata.0.notes.lastArtist': state('media.artist'),
    // Three is the threshold.
    '0_userdata.0.mini.title': state('media.title'),
    '0_userdata.0.mini.artist': state('media.artist'),
    '0_userdata.0.mini.album': state('media.album'),
    // Read-only mute next to a writable volume.
    'volumio.0.player.title': state('media.title'),
    'volumio.0.player.artist': state('media.artist'),
    'volumio.0.player.album': state('media.album'),
    'volumio.0.mute': state('media.mute', { type: 'boolean', write: false }),
    'volumio.0.volume': state('level.volume', { type: 'number' }),
});
const edgeById = new Map(edge.map((d) => [d.id, d]));

check('two mapped datapoints are below the threshold', !edgeById.has('0_userdata.0.notes'));
check('three mapped datapoints qualify', edgeById.has('0_userdata.0.mini'));

const volumio = edgeById.get('volumio.0.player');
eq('read-only mute is not offered as muteDp', volumio?.config.muteDp, undefined);
eq('mute falls back to volume=0', volumio?.config.muteViaVolume, true);
eq('volume without declared bounds stays unbounded', volumio?.config.volumeMin, undefined);

eq('no enum, no pinned play value', volumio?.config.playValue, undefined);

// ── 6. The play-state reading the pinned value feeds ─────────────────────────

check('yamaha 0 reads as playing', isPlaybackActive(0, net?.config.playValue));
check('yamaha 1 reads as stopped', !isPlaybackActive(1, net?.config.playValue), 'the plain ===1 check got this wrong');
check('yamaha 2 reads as paused', !isPlaybackActive(2, net?.config.playValue));
check('without a pinned value 1 still means playing', isPlaybackActive(1));
check('booleans and strings keep working', isPlaybackActive(true) && isPlaybackActive('playing'));
check('an empty pinned value does not swallow the fallback', isPlaybackActive(true, ''));

// ── Summary ──────────────────────────────────────────────────────────────────

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
