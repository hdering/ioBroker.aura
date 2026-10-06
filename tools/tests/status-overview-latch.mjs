// Statusübersicht: how the widget merges the adapter's remembered entries into its
// live rows, and how row actions fill their placeholders.
//
//   node tools/tests/status-overview-latch.mjs
//
// No dev server: applyLatch, fillRowTemplate, findBatteryLevelDp … are pure. The
// adapter side has its own test (test/status-latch.test.js).
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-status-latch-${process.pid}.mjs`);
await build({
    stdin: {
        contents: "export * from './src-vis/utils/statusOverview.ts';",
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
            name: 'stub-io',
            setup(b) {
                b.onResolve({ filter: /useIoBroker$/ }, (a) => ({ path: a.path, namespace: 'stub' }));
                b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
                    contents: 'export const getObjectViewDirect = () => Promise.resolve({ rows: [] });',
                    loader: 'js',
                }));
            },
        },
    ],
});
const m = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

let failed = 0;
const eq = (name, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) failed++;
    console.log(
        `${ok ? '  ok  ' : '  FAIL'} ${name}${ok ? '' : ` - got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`,
    );
};

const dp = (over = {}) => ({
    id: 'hm-rpc.1.0020DA499B8F41.0.LOW_BAT',
    name: 'Garage Oeffner Golf',
    type: 'boolean',
    role: 'indicator.lowbat',
    rooms: ['Garage'],
    funcs: [],
    logging: [],
    ...over,
});
const NOW = Date.UTC(2026, 9, 5, 12);
const DAY = 86400000;
const opts = { latchBattery: true };
const base = { id: dp().id, name: 'Garage Oeffner Golf', room: 'Garage', category: 'battery' };

// ── unchanged behaviour without the options ────────────────────────────────
eq('latch off by default', m.latchEnabled({}, 'battery'), false);
eq('latch on', m.latchEnabled(opts, 'battery'), true);
eq('latch needs the category', m.latchEnabled({ latchBattery: true, catBattery: false }, 'battery'), false);
eq(
    'no latch for windows',
    m.latchEnabled({ latchBattery: true, latchUnreach: true, latchAlarm: true }, 'window'),
    false,
);
eq('latch for alarms', m.latchEnabled({ latchAlarm: true }, 'alarm'), true);
eq('alarm latch needs the category', m.latchEnabled({ latchAlarm: true, catAlarm: false }, 'alarm'), false);

// ── applyLatch ───────────────────────────────────────────────────────────────
const liveLow = m.evaluateItem(dp(), true, 'battery', opts, NOW - DAY, true);
const liveOk = m.evaluateItem(dp(), false, 'battery', opts, NOW - DAY, true);
eq('no entry, alert → live row', m.applyLatch(liveLow, undefined, base, false, NOW)?.label, 'schwach');
eq('no entry, ok → nothing', m.applyLatch(liveOk, undefined, base, false, NOW), null);
eq('no entry, ok, show all → ok row', m.applyLatch(liveOk, undefined, base, true, NOW)?.severity, 'ok');

const open = { id: base.id, since: NOW - 3 * DAY, count: 3, active: false, ackedAt: null, snoozedUntil: null };
const quiet = m.applyLatch(liveOk, open, base, false, NOW);
eq('LOWBAT back to false, entry open → still listed', quiet?.severity, 'warn');
eq('… labelled as the problem', quiet?.label, 'schwach');
eq('… marked inactive', quiet?.latch?.active, false);
eq('… counts as hint', m.countsAsHint(quiet), true);
eq('… facts', m.latchFacts(quiet, true), [
    `seit ${m.formatDay(NOW - 3 * DAY)}`,
    '3× gemeldet',
    'meldet zurzeit nichts, bleibt gemerkt',
]);
eq('… no value loaded at all → still listed', m.applyLatch(null, open, base, false, NOW)?.latch?.active, false);

const loud = m.applyLatch(liveLow, { ...open, active: true }, base, false, NOW);
eq('alert + entry → active', loud?.latch?.active, true);

const snoozed = m.applyLatch(liveLow, { ...open, snoozedUntil: NOW + 2 * DAY }, base, false, NOW);
eq('snoozed → listed', !!snoozed, true);
eq('snoozed → not counted', m.countsAsHint(snoozed), false);
eq('snoozed → fact', m.latchFacts(snoozed, false).at(-1), `zurückgestellt bis ${m.formatDay(NOW + 2 * DAY)}`);
const expiredSnooze = m.applyLatch(liveLow, { ...open, snoozedUntil: NOW - 1 }, base, false, NOW);
eq('snooze over → counted again', m.countsAsHint(expiredSnooze), true);

const acked = { ...open, ackedAt: NOW - DAY, closedBy: 'ack' };
eq('closed entry hides the stale live alert', m.applyLatch(liveLow, acked, base, false, NOW), null);
eq('closed entry, show all → ok', m.applyLatch(liveLow, acked, base, true, NOW)?.severity, 'ok');

const reopened = m.applyLatch(liveLow, { ...open, active: true, reopenedAfter: NOW - 2 * DAY }, base, false, NOW);
eq('reopened → fact', m.latchFacts(reopened, false).at(-1), `trotz Wechsel am ${m.formatDay(NOW - 2 * DAY)}`);

const pctDp = dp({ id: 'zigbee.0.abc.battery', type: 'number', role: 'value.battery' });
const pctLive = m.evaluateItem(pctDp, 45, 'battery', opts, NOW, true);
eq(
    'percent entry gone quiet keeps the live percent',
    m.applyLatch(pctLive, { ...open, id: pctDp.id }, { ...base, id: pctDp.id }, false, NOW)?.label,
    '45 %',
);
eq(
    'unreach quiet entry',
    m.applyLatch(null, { ...open }, { ...base, category: 'unreach' }, false, NOW)?.label,
    'Offline',
);
const smoke = dp({ id: 'x.0.smoke.ALARM', role: 'sensor.alarm.fire', type: 'boolean' });
const smokeQuiet = m.applyLatch(
    m.evaluateItem(smoke, false, 'alarm', {}, NOW, true),
    { ...open, id: smoke.id },
    { ...base, id: smoke.id, category: 'alarm' },
    false,
    NOW,
);
eq('alarm gone quiet stays critical', [smokeQuiet?.severity, smokeQuiet?.label], ['crit', 'Ausgelöst']);
eq('alarm count reads "ausgelöst"', m.latchFacts(smokeQuiet, false)[0], '3× ausgelöst');
eq('alarm kind', m.latchKind(smoke, 'alarm', {}), 'bool');
eq('unresolved import entry is ignored', m.applyLatch(liveOk, { ...open, unresolved: true }, base, false, NOW), null);

// ── list parsing ─────────────────────────────────────────────────────────────
eq('parse list', [...m.parseLatchList(JSON.stringify([open])).keys()], [base.id]);
eq('parse garbage', m.parseLatchList('{nope').size, 0);
eq('parse non-array', m.parseLatchList('{}').size, 0);

// ── watch definitions ────────────────────────────────────────────────────────
eq('kind bool', m.latchKind(dp(), 'battery', {}), 'bool');
eq('kind pct', m.latchKind(pctDp, 'battery', {}), 'pct');
eq('kind reachable', m.latchKind(dp({ id: 'x.0.d.available', role: 'indicator.reachable' }), 'unreach', {}), 'boolInv');
eq('kind unreach', m.latchKind(dp({ id: 'x.0.d.UNREACH', role: 'indicator.unreach' }), 'unreach', {}), 'bool');

const cacheList = [
    dp(),
    dp({ id: 'hm-rpc.1.0020DA499B8F41.0.OPERATING_VOLTAGE', type: 'number', role: 'value.voltage' }),
    dp({ id: 'hm-rpc.1.0007DBE98D9753.0.LOW_BAT' }),
    dp({ id: 'hm-rpc.1.0007DBE98D9753.4.OPERATING_VOLTAGE', type: 'number', role: 'value.voltage' }),
    dp({ id: 'zigbee.0.xyz.battery_low' }),
    dp({ id: 'zigbee.0.xyz.battery', type: 'number', role: 'value.battery' }),
    dp({ id: 'zigbee.0.solo.battery_low' }),
];
eq('level: same channel', m.findBatteryLevelDp(cacheList[0], cacheList), {
    id: 'hm-rpc.1.0020DA499B8F41.0.OPERATING_VOLTAGE',
    unit: 'V',
});
eq('level: other channel of the device', m.findBatteryLevelDp(cacheList[2], cacheList), {
    id: 'hm-rpc.1.0007DBE98D9753.4.OPERATING_VOLTAGE',
    unit: 'V',
});
eq('level: percent sibling', m.findBatteryLevelDp(cacheList[4], cacheList), { id: 'zigbee.0.xyz.battery', unit: '%' });
eq('level: none', m.findBatteryLevelDp(cacheList[6], cacheList), null);
eq('level: percent dp is its own level', m.findBatteryLevelDp(pctDp, cacheList), null);

// ── row actions ──────────────────────────────────────────────────────────────
const ctx = { id: base.id, device: 'hm-rpc.1.0020DA499B8F41', name: 'Garage Oeffner Golf', room: 'Garage' };
eq('template serial', m.fillRowTemplate('gewechselt:{serial}', ctx), 'gewechselt:0020DA499B8F41');
eq(
    'template all',
    m.fillRowTemplate('{id}|{device}|{name}|{room}|{other}', ctx),
    `${base.id}|hm-rpc.1.0020DA499B8F41|Garage Oeffner Golf|Garage|{other}`,
);
eq('template no room', m.fillRowTemplate('[{room}]', { ...ctx, room: undefined }), '[]');
eq('device fallback', m.deviceIdFallback(base.id), 'hm-rpc.1.0020DA499B8F41');
eq('device fallback short id', m.deviceIdFallback('a.0.b'), 'a.0');
eq('typed true', m.typedActionValue('true'), true);
eq('typed number', m.typedActionValue('42'), 42);
eq('typed text', m.typedActionValue('gewechselt:x'), 'gewechselt:x');
const actions = [
    { label: 'A', targetDp: 'x', value: '1' },
    { label: 'B', targetDp: 'x', value: '1', categories: ['battery'] },
    { label: 'C', targetDp: 'x', value: '1', categories: ['window'] },
    { label: '', targetDp: 'x', value: '1' },
];
eq(
    'actions for battery',
    m.actionsFor(actions, 'battery').map((a) => a.label),
    ['A', 'B'],
);
eq(
    'actions for window',
    m.actionsFor(actions, 'window').map((a) => a.label),
    ['A', 'C'],
);
eq('actions unset', m.actionsFor(undefined, 'window'), []);

// ── presets ──────────────────────────────────────────────────────────────────
const presets = Object.fromEntries(m.ROW_ACTION_PRESETS.map((p) => [p.key, p]));
eq('three presets', Object.keys(presets), ['light-off', 'window-remind', 'battery-script']);
const off = presets['light-off'].action;
eq('light off: only light rows', m.actionsFor([off], 'light').length + m.actionsFor([off], 'window').length, 1);
eq('light off: targets the row itself', m.fillRowTemplate(off.targetDp, ctx), base.id);
eq('light off: writes boolean false', m.typedActionValue(m.fillRowTemplate(off.value, ctx)), false);
eq('light off needs no own datapoint', presets['light-off'].needsDp, false);
eq(
    'window remind text',
    m.fillRowTemplate(presets['window-remind'].action.value, ctx),
    'Garage Oeffner Golf (Garage) ist offen',
);
eq('battery script value', m.fillRowTemplate(presets['battery-script'].action.value, ctx), 'gewechselt:0020DA499B8F41');

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
