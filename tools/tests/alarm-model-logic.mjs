// Alarm widget without the alarm adapter (#1037): JSON lists for modes and zones
// (utils/alarmListJson.ts) and the source-independent model (widgets/alarm/alarmModel.ts).
//
//   node tools/tests/alarm-model-logic.mjs
//
// No dev server needed — both modules are pure and bundled with esbuild. Every JSON
// shape shown in docs/widgets/alarmanlage.md appears here as a case.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-alarm-model-${process.pid}.mjs`);
await build({
    stdin: {
        contents:
            "export * from './src-vis/utils/alarmListJson.ts';\nexport * from './src-vis/components/widgets/alarm/alarmModel.ts';",
        resolveDir: process.cwd(),
        loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'warning',
});
const m = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

const results = [];
const eq = (name, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    results.push({ name, ok });
    console.log(
        `${ok ? '  ok  ' : '  FAIL'} ${name}${ok ? '' : ` - got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`,
    );
};

// ── modes JSON ───────────────────────────────────────────────────────────────
const full = m.parseAlarmModesJson(
    JSON.stringify([
        { key: 'off', label: 'Aus', icon: 'ShieldOff', disarm: true, writeValue: '0' },
        { key: 'away', label: 'Abwesend', writeDp: '0_userdata.0.alarm.cmd', writeValue: '2' },
        { key: 'night', label: 'Nacht', requirePin: false, color: '#6366f1' },
    ]),
);
eq('modes: full form', full.items, [
    { key: 'off', label: 'Aus', icon: 'ShieldOff', writeValue: '0', disarm: true },
    { key: 'away', label: 'Abwesend', writeDp: '0_userdata.0.alarm.cmd', writeValue: '2' },
    { key: 'night', label: 'Nacht', color: '#6366f1', requirePin: false },
]);
eq('modes: full form, nothing rejected', full.rejected, []);

eq('modes: map like common.states', m.parseAlarmModesJson({ 0: 'Aus', 1: 'Scharf' }).items, [
    { key: '0', label: 'Aus' },
    { key: '1', label: 'Scharf' },
]);
eq('modes: map with objects', m.parseAlarmModesJson('{"0":{"label":"Aus","disarm":true},"1":"Scharf"}').items, [
    { key: '0', label: 'Aus', disarm: true },
    { key: '1', label: 'Scharf' },
]);
eq('modes: plain strings', m.parseAlarmModesJson(['Aus', 'Scharf']).items, [
    { key: 'Aus', label: 'Aus' },
    { key: 'Scharf', label: 'Scharf' },
]);
eq('modes: value/name spelling', m.parseAlarmModesJson([{ value: 0, name: 'Aus' }]).items, [
    { key: '0', label: 'Aus' },
]);
const wrapped = '{"modes":[{"key":"a","label":"A"}],"zones":[{"key":"z","label":"Z","onOffDp":"x.0.z"}]}';
eq('wrapper: modes part', m.parseAlarmModesJson(wrapped).items, [{ key: 'a', label: 'A' }]);
eq('wrapper: zones part', m.parseAlarmZonesJson(wrapped).items, [{ key: 'z', label: 'Z', onOffDp: 'x.0.z' }]);
eq('wrapper with zones only: no modes, still valid', m.parseAlarmModesJson('{"zones":[]}'), {
    items: [],
    rejected: [],
    invalid: false,
});
eq('result wrapper', m.parseAlarmModesJson({ result: [{ key: 'a' }] }).items, [{ key: 'a' }]);

const bad = m.parseAlarmModesJson([{ key: 'x', writeDp: 'http://evil' }, { icon: 'Lock' }, { key: 'a' }, { key: 'a' }]);
eq('modes: invalid writeDp, no key, duplicate dropped', bad.items, [{ key: 'a' }]);
eq(
    'modes: rejected reasons',
    bad.rejected.map((r) => r.reason),
    ['ungültiger Datenpunkt', 'weder key noch label', 'doppelter key'],
);
eq('modes: broken JSON is invalid', m.parseAlarmModesJson('{nope').invalid, true);
eq('modes: empty string is invalid', m.parseAlarmModesJson('').invalid, true);

// ── zones JSON ───────────────────────────────────────────────────────────────
eq(
    'zones: full form',
    m.parseAlarmZonesJson([
        {
            key: 'eg',
            label: 'Erdgeschoss',
            onOffDp: '0_userdata.0.alarm.eg',
            triggeredDp: '0_userdata.0.alarm.eg_alarm',
        },
        { key: 'og', label: 'Obergeschoss', onOffDp: '0_userdata.0.alarm.og' },
    ]).items,
    [
        {
            key: 'eg',
            label: 'Erdgeschoss',
            onOffDp: '0_userdata.0.alarm.eg',
            triggeredDp: '0_userdata.0.alarm.eg_alarm',
        },
        { key: 'og', label: 'Obergeschoss', onOffDp: '0_userdata.0.alarm.og' },
    ],
);
eq('zones: names only', m.parseAlarmZonesJson(['EG', 'OG']).items, [
    { key: 'EG', label: 'EG' },
    { key: 'OG', label: 'OG' },
]);
eq('zones: bad dp dropped', m.parseAlarmZonesJson([{ key: 'a', onOffDp: 'a?b' }]).items, []);

// ── adapter modes ────────────────────────────────────────────────────────────
const keys = (list) => list.map((x) => x.key);
eq('adapter: default four', keys(m.resolveAdapterModes(undefined, {})), ['off', 'sharp', 'inside', 'night']);
eq('adapter: legacy showModeNight=false hides', keys(m.resolveAdapterModes(undefined, { showModeNight: false })), [
    'off',
    'sharp',
    'inside',
]);
eq(
    'adapter: list hidden=false overrides legacy',
    keys(m.resolveAdapterModes([{ key: 'night', hidden: false }], { showModeNight: false })),
    ['night', 'off', 'sharp', 'inside'],
);
const reordered = m.resolveAdapterModes(
    [{ key: 'sharp', label: 'Weg', color: '#000', icon: 'Car' }, { key: 'off' }, { key: 'bogus' }],
    {},
);
eq('adapter: order from list, unknown key dropped', keys(reordered), ['sharp', 'off', 'inside', 'night']);
eq(
    'adapter: own label/colour/icon',
    [reordered[0].label, reordered[0].color, reordered[0].icon],
    ['Weg', '#000', 'Car'],
);
eq('adapter: off disarms', reordered[1].disarm, true);

// ── manual modes ─────────────────────────────────────────────────────────────
const man = m.resolveManualModes([
    { key: 'off', disarm: true, writeValue: 'false' },
    { key: 'armed', writeValue: 'true' },
    { key: 'x', hidden: true },
    { key: 'night' },
]);
eq('manual: hidden dropped', keys(man), ['off', 'armed', 'night']);
eq(
    'manual: writeValue default = key, activeWhen default = writeValue',
    [man[2].writeValue, man[2].activeWhen],
    ['night', 'night'],
);
eq('manual: disarm icon/colour default', [man[0].icon, man[0].color], ['ShieldOff', '#10b981']);

// ── zones resolve ────────────────────────────────────────────────────────────
const az = m.resolveAdapterZones(
    [
        { key: 'two', label: 'Garage' },
        { key: 'one', hidden: true },
    ],
    'alarm.0',
);
eq(
    'adapter zones: order, label, hidden',
    az.map((z) => [z.key, z.label ?? null]),
    [
        ['two', 'Garage'],
        ['three', null],
    ],
);
eq(
    'adapter zones: dps from prefix',
    [az[0].onOffDp, az[0].triggeredDp],
    ['alarm.0.zone.two_on_off', 'alarm.0.zone.two'],
);
eq('manual zones: label falls back to key', m.resolveManualZones([{ key: 'eg' }])[0].label, 'eg');

// ── state mapping ────────────────────────────────────────────────────────────
const map = [
    { value: '0', phase: 'off' },
    { value: '1', phase: 'armed', label: 'Abwesend' },
    { value: 'ALARM', phase: 'triggered' },
];
eq('map: numeric match', m.phaseFromValue(1, map), { phase: 'armed', label: 'Abwesend', known: true });
eq('map: "1.0" matches 1', m.phaseFromValue('1.0', map).phase, 'armed');
eq('map: case-insensitive text', m.phaseFromValue('alarm', map).phase, 'triggered');
eq('map: unknown value = off with raw text', m.phaseFromValue(7, map), { phase: 'off', label: '7', known: false });
eq('no map: true = armed', m.phaseFromValue(true, undefined).phase, 'armed');
eq('no map: false = off', m.phaseFromValue('false', undefined).phase, 'off');
eq('no map: adapter code 4 = night', m.phaseFromValue(4, undefined).phase, 'night');
eq('no map: unknown text', m.phaseFromValue('weird', undefined), { phase: 'off', label: 'weird', known: false });

// ── helpers ──────────────────────────────────────────────────────────────────
eq('isSet', [true, 1, 'open', 'on', false, 0, 'closed', null].map(m.isSet), [
    true,
    true,
    true,
    true,
    false,
    false,
    false,
    false,
]);
eq('noticeOf: text', m.noticeOf('Fenster Bad'), { active: true, text: 'Fenster Bad' });
eq('noticeOf: true', m.noticeOf(true), { active: true, text: '' });
eq('noticeOf: empty', m.noticeOf(''), { active: false, text: '' });
eq('typedValue', [m.typedValue('true'), m.typedValue('2'), m.typedValue('away')], [true, 2, 'away']);
eq('countdown seconds', m.countdownSeconds(42, 's', 0), 42);
eq('countdown end ts (ms)', m.countdownSeconds(1_700_000_010_000, 'endTs', 1_700_000_004_000), 6);
eq('countdown end ts (s)', m.countdownSeconds(100, 'endTs', 90_000), 10);
eq('countdown past = 0', m.countdownSeconds(1_700_000_000_000, 'endTs', 1_700_000_005_000), 0);
eq('guessPhase', ['Unscharf', 'Scharf', 'Nachtmodus', 'Intern scharf', 'Einbruch', 'Stiller Alarm'].map(m.guessPhase), [
    'off',
    'armed',
    'night',
    'inside',
    'triggered',
    'silent',
]);
eq('log: <br>', m.parseLog('10:01 - Scharf<br>10:05: Aus', 5, 'br'), [
    { time: '10:01', text: 'Scharf' },
    { time: '10:05', text: 'Aus' },
]);
eq('log: newline + max', m.parseLog('a\nb\nc', 2, 'newline'), [
    { time: '', text: 'a' },
    { time: '', text: 'b' },
]);
eq('log: json', m.parseLog('[{"time":"08:00","text":"Aus"},"09:00 - Scharf"]', 5, 'json'), [
    { time: '08:00', text: 'Aus' },
    { time: '09:00', text: 'Scharf' },
]);
eq('pin payload json', JSON.parse(m.pinPayload('json', '1234', { mode: 'off', dp: 'a.0.b', value: 'false' })), {
    pin: '1234',
    mode: 'off',
    dp: 'a.0.b',
    value: 'false',
});
eq('pin payload plain', m.pinPayload('pin', '1234', { mode: 'off' }), '1234');

const take = m.adapterTakeover('alarm.1');
eq('takeover: manual source + state dp', [take.sourceMode, take.stateDp], ['manual', 'alarm.1.status.state_list']);
eq(
    'takeover: modes write use.list',
    take.modes.map((x) => [x.writeDp, x.writeValue]),
    [
        ['alarm.1.use.list', '0'],
        ['alarm.1.use.list', '1'],
        ['alarm.1.use.list', '2'],
        ['alarm.1.use.list', '4'],
    ],
);
eq('takeover: state map = adapter codes', m.phaseFromValue(3, take.stateMap).phase, 'triggered');

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
