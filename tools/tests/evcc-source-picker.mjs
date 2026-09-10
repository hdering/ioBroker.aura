// The data-source dropdown of the flow widget: detected instances, auto-mapping
// of a non-evcc adapter's datapoints, and "manual".
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/evcc-source-picker.mjs
//
// The heuristic itself is covered without a browser by tools/tests/energy-sources.mjs.
// What is checked here is the wiring: which instances reach the dropdown, that
// picking one writes the five datapoint options, that the panel reports what it
// found and what it could not, and that "manual" leaves the fields alone.
//
// getObjectView is stubbed through the screenshot harness, so no adapter needs to
// be installed. The stub ignores the key range and answers per object type, which
// is why the widget re-filters the rows itself.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const eq = (name, got, want) => check(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

const inst = (id) => ({ id: `system.adapter.${id}`, value: { type: 'instance', common: { enabled: true } } });
const st = (id, common) => ({ id, value: { type: 'state', common: { type: 'number', read: true, ...common } } });

// An SMA-shaped instance with the usual traps: energy counters beside the live
// values, per-string detail below the headline, and a battery split in two.
const SMA_STATES = [
    st('sma.0.pvPower', { role: 'value.power', unit: 'W', name: 'PV Leistung' }),
    st('sma.0.pvEnergyToday', { unit: 'kWh', name: 'Tagesertrag' }),
    st('sma.0.strings.1.pvPower', { role: 'value.power', unit: 'W' }),
    st('sma.0.gridPower', { role: 'value.power', unit: 'W', name: 'Netz' }),
    st('sma.0.homePower', { role: 'value.power', unit: 'W', name: 'Hausverbrauch' }),
    st('sma.0.battery.soc', { role: 'value.battery', unit: '%', min: 0, max: 100 }),
    st('sma.0.battery.power', { role: 'value.power', unit: 'W' }),
    st('sma.0.device.temperature', { unit: '°C' }),
];

// A meter that only knows the grid — the "partly found" case.
const SHELLY_STATES = [
    st('shelly.0.em.gridPower', { role: 'value.power', unit: 'W', name: 'Netz Leistung' }),
    st('shelly.0.em.voltage', { unit: 'V' }),
];

const dlg = page.locator('.aura-widget-edit-modal');
const select = dlg.locator('select.aura-evcc-instance');
const opts = () => page.evaluate(() => window.__auraShot.widgetOptions('flow'));

/** Reopen the edit dialog with `instances` present and `states` behind them. */
async function open(instances, states, widgetOptions = {}) {
    await page.keyboard.press('Escape');
    await page.evaluate(
        ([instances, states, widgetOptions]) => {
            window.__auraShot.mockObjectView({ instance: instances, state: states });
            window.__auraShot.showWidgets(
                [
                    {
                        id: 'flow',
                        type: 'evcc',
                        title: 'PV',
                        datapoint: '',
                        gridPos: { x: 0, y: 0, w: 14, h: 9 },
                        options: { loadpointCount: 1, showBattery: true, ...widgetOptions },
                    },
                ],
                { editMode: true },
            );
            window.__auraShot.setEditMode(true);
        },
        [instances, states, widgetOptions],
    );
    await page.waitForTimeout(400);
    await page.locator('.aura-edit-chrome button').first().click();
    await page.locator('button:text-is("Bearbeiten")').click();
    await dlg.waitFor({ timeout: 10000 });
    await page.waitForTimeout(500);
}

// ── what reaches the dropdown ────────────────────────────────────────────────
await open(
    [
        inst('evcc.0'),
        inst('sma.0'),
        inst('fronius.1'),
        inst('shelly.0'),
        // Not energy adapters — these must not clutter the list.
        inst('admin.0'),
        inst('javascript.0'),
        inst('hm-rpc.1'),
    ],
    SMA_STATES,
);

const listed = await select.locator('option').allTextContents();
check('the evcc instance is offered', listed.some((o) => o.includes('evcc.0')), listed.join(' | '));
check('so is SMA, by its proper name', listed.some((o) => o === 'SMA (sma.0)'), listed.join(' | '));
check('and Fronius', listed.some((o) => o.includes('fronius.1')), listed.join(' | '));
check('unrelated adapters are left out', !listed.some((o) => /admin|javascript|hm-rpc/.test(o)), listed.join(' | '));
check('evcc comes first — it can do the most', listed[0].includes('evcc'), listed.join(' | '));
check('there is a manual entry', listed.some((o) => o.includes('Manuell')), listed.join(' | '));
check('and one for an evcc prefix by hand', listed.some((o) => o.includes('von Hand')), listed.join(' | '));

// ── picking evcc is still just a prefix ──────────────────────────────────────
await select.selectOption('evcc.0');
await page.waitForTimeout(500);
eq('picking evcc sets the prefix', (await opts()).evccPrefix, 'evcc.0');
eq('and no auto-mapped adapter', (await opts()).sourceAdapter, undefined);

// ── picking SMA maps its datapoints ──────────────────────────────────────────
await select.selectOption('sma.0');
await page.waitForTimeout(1200);
let o = await opts();
eq('the prefix is cleared — no evcc involved', o.evccPrefix, '');
eq('the source is remembered', o.sourceAdapter, 'sma.0');
eq('production is mapped to the headline value', o.pvPowerDatapoint, 'sma.0.pvPower');
eq('house consumption is mapped', o.homePowerDatapoint, 'sma.0.homePower');
eq('grid is mapped', o.gridPowerDatapoint, 'sma.0.gridPower');
eq('the battery charge level is mapped', o.batterySocDatapoint, 'sma.0.battery.soc');
eq('the battery power is mapped separately', o.batteryPowerDatapoint, 'sma.0.battery.power');

const report = dlg.locator('.aura-evcc-scan-report');
check('the panel says how much it found', (await report.textContent()).includes('5 von 5'), await report.textContent());
check('the mapped datapoints are visible in the fields', (await dlg.locator('input.aura-evcc-dp-pvPowerDatapoint').inputValue()) === 'sma.0.pvPower');
check('and can be corrected', (await dlg.locator('input.aura-evcc-dp-gridPowerDatapoint').isEditable()));
check('there is a way to search again', (await dlg.locator('.aura-evcc-rescan').count()) > 0);

// ── a source that only covers part of it says so ─────────────────────────────
await open([inst('shelly.0')], SHELLY_STATES);
await select.selectOption('shelly.0');
await page.waitForTimeout(1200);
o = await opts();
eq('what it has is mapped', o.gridPowerDatapoint, 'shelly.0.em.gridPower');
eq('what it does not have stays empty', o.pvPowerDatapoint, undefined);
const partial = await dlg.locator('.aura-evcc-scan-report').textContent();
check('the panel reports the shortfall', partial.includes('1 von 5'), partial);
check('and names what is missing', partial.includes('Erzeugung') && partial.includes('Hausverbrauch'), partial);

// ── manual leaves everything to the user ─────────────────────────────────────
await open([inst('sma.0')], SMA_STATES, {
    pvPowerDatapoint: 'my.0.pv',
    evccPrefix: '',
    sourceAdapter: '',
});
await select.selectOption('__manual__');
await page.waitForTimeout(600);
o = await opts();
eq('manual keeps no prefix', o.evccPrefix, '');
eq('and no adapter', o.sourceAdapter, undefined);
eq('a hand-picked datapoint survives the switch', o.pvPowerDatapoint, 'my.0.pv');
eq('the dropdown shows manual as selected', await select.inputValue(), '__manual__');
eq('and no evcc prefix field is in the way', await dlg.locator('input.aura-evcc-prefix').count(), 0);

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
    console.log('FAILED:');
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
    process.exit(1);
}
