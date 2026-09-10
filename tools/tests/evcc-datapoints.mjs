// The free datapoints of the flow widget: every value the diagram draws can come
// from a datapoint of the user's choosing instead of an evcc instance.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/evcc-datapoints.mjs
//
// Grid, battery SoC and battery power already had such an override; production and
// house consumption did not, which is what kept the widget evcc-only (#629). With
// all five set and no prefix at all, no evcc adapter is involved — that is the case
// the last block pins, together with the config panel offering the two new fields.
//
// Values are injected through the screenshot harness, so no real datapoint is read.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const eq = (name, got, want) => check(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

const DP = {
    pv: 'demo.pv.power',
    home: 'demo.home.power',
    grid: 'demo.grid.power',
    soc: 'demo.batt.soc',
    battPower: 'demo.batt.power',
};

const ALL_DPS = {
    pvPowerDatapoint: DP.pv,
    homePowerDatapoint: DP.home,
    gridPowerDatapoint: DP.grid,
    batterySocDatapoint: DP.soc,
    batteryPowerDatapoint: DP.battPower,
};

/** Show the widget with `options`, with the demo datapoints carrying `values`. */
async function show(options, values) {
    await page.evaluate(
        ([options, values]) => {
            window.__auraShot.mock(values);
            window.__auraShot.mockServerState(values);
            window.__auraShot.showWidgets([
                {
                    id: 'flow',
                    type: 'evcc',
                    title: 'PV',
                    datapoint: '',
                    gridPos: { x: 0, y: 0, w: 14, h: 9 },
                    options: { loadpointCount: 1, showBattery: true, showLoadpoints: false, ...options },
                },
            ]);
        },
        [options, values],
    );
    await page.waitForFunction(() => !!document.querySelector('.aura-widget-flow'), { timeout: 10000 });
    // Inject once more AFTER the mount: a value the widget was not subscribed to in
    // the previous scenario misses the pre-mount stateChange, and the cached value
    // from two scenarios ago would win.
    await page.evaluate((values) => window.__auraShot.mock(values), values);
    await page.waitForTimeout(700);
}

const text = () => page.evaluate(() => document.querySelector('.aura-widget-flow')?.textContent ?? '');

// ── production and house consumption from own datapoints ─────────────────────
// 4500 W and 1200 W; fmtKW renders anything >= 100 W with one decimal.
await show(ALL_DPS, {
    [DP.pv]: 4500,
    [DP.home]: 1200,
    [DP.grid]: -3300,
    [DP.soc]: 64,
    [DP.battPower]: -900,
});
let txt = await text();
check('production comes from its own datapoint', txt.includes('4.5 kW'), txt);
check('house consumption too', txt.includes('1.2 kW'), txt);
check('grid keeps working as before', txt.includes('3.3 kW'), txt);
check('a negative grid value still reads as feed-in', txt.includes('Einspsg.'), txt);
check('the battery charge level is shown', txt.includes('64%'), txt);
check('and the battery power', txt.includes('0.9 kW'), txt);

// ── the values follow the datapoints live ────────────────────────────────────
await page.evaluate(
    ([pv, home]) => window.__auraShot.mock({ [pv]: 6100, [home]: 2400 }),
    [DP.pv, DP.home],
);
await page.waitForTimeout(500);
txt = await text();
check('a new production value arrives', txt.includes('6.1 kW'), txt);
check('a new consumption value too', txt.includes('2.4 kW'), txt);

// ── an unset override leaves the value alone ─────────────────────────────────
// Only production is mapped; house consumption has no datapoint and no instance,
// so it must read zero rather than borrow the production datapoint.
await show({ pvPowerDatapoint: DP.pv, evccPrefix: '' }, { [DP.pv]: 3000 });
txt = await text();
check('the mapped value is shown', txt.includes('3.0 kW'), txt);
check('the unmapped one stays at zero', txt.includes('0.00 kW'), txt);

// ── no evcc instance at all: the point of the whole exercise ─────────────────
await show({ ...ALL_DPS, evccPrefix: '' }, {
    [DP.pv]: 5000,
    [DP.home]: 800,
    [DP.grid]: -4200,
    [DP.soc]: 71,
    [DP.battPower]: 0,
});
txt = await text();
check('without any evcc prefix production still shows', txt.includes('5.0 kW'), txt);
check('… consumption too', txt.includes('0.80 kW') || txt.includes('0.8 kW'), txt);
check('… grid too', txt.includes('4.2 kW'), txt);
check('… and the battery', txt.includes('71%'), txt);

// ── the config panel offers the two new fields ───────────────────────────────
await page.evaluate(() => {
    window.__auraShot.mockObjectView({ instance: [] });
    window.__auraShot.showWidgets(
        [
            {
                id: 'flow',
                type: 'evcc',
                title: 'PV',
                datapoint: '',
                gridPos: { x: 0, y: 0, w: 14, h: 9 },
                options: { loadpointCount: 1, showBattery: true },
            },
        ],
        { editMode: true },
    );
    window.__auraShot.setEditMode(true);
});
await page.waitForTimeout(400);
await page.locator('.aura-edit-chrome button').first().click();
await page.locator('button:text-is("Bearbeiten")').click();
const dlg = page.locator('.aura-widget-edit-modal');
await dlg.waitFor({ timeout: 10000 });
await page.waitForTimeout(500);

const dpField = (k) => dlg.locator(`input.aura-evcc-dp-${k}`);
for (const k of Object.keys(ALL_DPS)) {
    eq(`the panel has a field for ${k}`, await dpField(k).count(), 1);
}
check(
    'they sit under a source-neutral heading',
    (await dlg.locator('text=Datenpunkte').count()) > 0 && (await dlg.locator('text=Datenquelle').count()) > 0,
);
check(
    'and the loadpoints say they need evcc',
    (await dlg.locator('text=Ladepunkte (nur mit evcc)').count()) > 0,
);

const opts = () => page.evaluate(() => window.__auraShot.widgetOptions('flow'));
await dpField('pvPowerDatapoint').click();
await page.keyboard.type(DP.pv);
await page.waitForTimeout(400);
eq('typing a production datapoint stores it', (await opts()).pvPowerDatapoint, DP.pv);
await dpField('homePowerDatapoint').click();
await page.keyboard.type(DP.home);
await page.waitForTimeout(400);
eq('and a consumption one', (await opts()).homePowerDatapoint, DP.home);

// Clearing a field must drop the option, not store an empty string.
await dpField('pvPowerDatapoint').click();
await page.keyboard.press('Control+a');
await page.keyboard.press('Backspace');
await page.waitForTimeout(400);
eq('clearing a field removes the override', (await opts()).pvPowerDatapoint, undefined);

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
    console.log('FAILED:');
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
    process.exit(1);
}
