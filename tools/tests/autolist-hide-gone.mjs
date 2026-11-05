// Verifies "Nicht erreichbare Geräte ausblenden" and "Aliase ohne Ziel ausblenden" of
// the dynamic list (#925): rows of a device that reports itself unreachable, and alias
// rows whose target does not exist, drop out - and only while the option is on.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/autolist-hide-gone.mjs
//
// Objects come from __auraShot.mockObject / mockObjectView, ids are invented, writes
// are captured - nothing reaches a real ioBroker.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const eq = (name, got, want) =>
    check(
        name,
        JSON.stringify(got) === JSON.stringify(want),
        `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
    );

const L = 'alias.0.aura_test925h';
const st = (id, role, type = 'boolean') => ({ id, value: { _id: id, type: 'state', common: { role, type } } });
const ROWS = [
    // reachable lamp, UNREACH false
    ['Decke', `${L}.decke.ON`],
    // unplugged fairy light, UNREACH true
    ['Lichterkette', `${L}.kette.ON`],
    // zigbee-style: available false
    ['Stehlampe', `${L}.steh.ON`],
    // no reachability datapoint at all
    ['Spot', `${L}.spot.ON`],
    // alias whose target is gone
    ['Kuechenschrank', `${L}.schrank.ON`],
];
const STATES = [
    st(`${L}.decke.ON`, 'switch.light'),
    st(`${L}.decke.UNREACH`, 'indicator.maintenance.unreach'),
    st(`${L}.kette.ON`, 'switch.light'),
    st(`${L}.kette.UNREACH`, 'indicator.maintenance.unreach'),
    st(`${L}.steh.ON`, 'switch.light'),
    st(`${L}.steh.available`, 'indicator.reachable'),
    st(`${L}.spot.ON`, 'switch.light'),
    st(`${L}.schrank.ON`, 'switch.light'),
];
const VALUES = {
    [`${L}.decke.ON`]: true,
    [`${L}.decke.UNREACH`]: false,
    [`${L}.kette.ON`]: false,
    [`${L}.kette.UNREACH`]: true,
    [`${L}.steh.ON`]: false,
    [`${L}.steh.available`]: false,
    [`${L}.spot.ON`]: true,
    [`${L}.schrank.ON`]: false,
};
const alias = (id, target) => ({ _id: id, type: 'state', common: { role: 'switch.light', alias: { id: target } } });
const OBJECTS = {
    [L]: { _id: L, type: 'folder', common: {} },
    [`${L}.decke.ON`]: alias(`${L}.decke.ON`, 'hm-rpc.0.DECKE.1.STATE'),
    'hm-rpc.0.DECKE.1.STATE': { _id: 'hm-rpc.0.DECKE.1.STATE', type: 'state', common: {} },
    [`${L}.kette.ON`]: alias(`${L}.kette.ON`, 'zigbee.0.kette.state'),
    'zigbee.0.kette.state': { _id: 'zigbee.0.kette.state', type: 'state', common: {} },
    [`${L}.steh.ON`]: alias(`${L}.steh.ON`, 'zigbee.0.steh.state'),
    'zigbee.0.steh.state': { _id: 'zigbee.0.steh.state', type: 'state', common: {} },
    [`${L}.spot.ON`]: alias(`${L}.spot.ON`, 'shelly.0.spot.Relay0.Switch'),
    'shelly.0.spot.Relay0.Switch': { _id: 'shelly.0.spot.Relay0.Switch', type: 'state', common: {} },
    [`${L}.schrank.ON`]: alias(`${L}.schrank.ON`, 'zigbee.0.weg.state'),
    // the moved lamp: its target does not exist
    'zigbee.0.weg.state': null,
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 } });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 60000 });
await page.evaluate(
    ([states, objects, values]) => {
        const s = window.__auraShot;
        s.mockObjectView({ state: states });
        s.mockObject(objects);
        s.mockServerState(values);
        s.mock(values);
        s.captureWrites(true);
    },
    [STATES, OBJECTS, VALUES],
);

// A new widget id per call: offline a widget only reads the cached values when it mounts.
let mount = 0;
/** The labels the list shows with the given options. */
async function shown(options) {
    await page.evaluate(
        ([rows, options, n]) =>
            window.__auraShot.showWidgets([
                {
                    id: 'w-auto-' + n,
                    type: 'autolist',
                    title: 'Lampen',
                    datapoint: '',
                    layout: 'default',
                    gridPos: { x: 0, y: 0, w: 8, h: 10 },
                    options: { entries: rows.map(([label, id]) => ({ id, label })), ...options },
                },
            ]),
        [ROWS, options, ++mount],
    );
    await page.waitForTimeout(1200);
    return page.evaluate(
        (labels) => labels.filter((l) => document.body.innerText.includes(l)),
        ROWS.map(([l]) => l),
    );
}

eq('off: every row shows', await shown({}), ['Decke', 'Lichterkette', 'Stehlampe', 'Spot', 'Kuechenschrank']);
eq('unreachable: UNREACH true and available false drop out', await shown({ hideUnreachable: true }), [
    'Decke',
    'Spot',
    'Kuechenschrank',
]);
eq('alias without target: the moved lamp drops out', await shown({ hideAliasWithoutTarget: true }), [
    'Decke',
    'Lichterkette',
    'Stehlampe',
    'Spot',
]);
eq('both', await shown({ hideUnreachable: true, hideAliasWithoutTarget: true }), ['Decke', 'Spot']);

// Plugged in again: the row is back (a fresh mount reads the new value offline).
await page.evaluate((id) => {
    window.__auraShot.mockServerState({ [id]: false });
    window.__auraShot.mock({ [id]: false });
}, `${L}.kette.UNREACH`);
eq('reachable again: the row is back', await shown({ hideUnreachable: true }), [
    'Decke',
    'Lichterkette',
    'Spot',
    'Kuechenschrank',
]);

eq('no page errors', pageErrors, []);
await browser.close();

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${failed ? `${failed} failed` : 'all passed'} (${results.length - failed}/${results.length})`);
process.exit(failed ? 1 : 0);
