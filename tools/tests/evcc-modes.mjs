// The charge-mode buttons of the evcc widget, before and after evcc 0.316 (#700).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/evcc-modes.mjs
//
// evcc 0.316 renamed `pv` to `smart` and folded `minpv` into an "always charge"
// option of Smart. The ioBroker.evcc adapter still writes the old values
// (control.pvControl 0 off, 1 pv, 2 minpv, 3 now), which evcc translates:
// pv = Smart without always charge, minpv = Smart with it. The widget has to
// show four buttons against an old evcc and AUS · SMART · SOFORT + ♾ against a
// new one — told apart by status.mode = smart or an existing status.alwaysCharge.
//
// captureWrites() keeps the clicks off the socket; every scenario uses its own
// widget id and a prefix that does not exist.
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

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
await page.waitForTimeout(700);
await page.evaluate(() => window.__auraShot.captureWrites(true));

/** The writes since the last call, as [datapoint name, value]; clears the log. */
const writes = () =>
    page
        .evaluate(() => {
            const log = window.__auraShot.writes();
            window.__auraShot.writes(true);
            return log;
        })
        .then((log) => log.map((w) => [w.id.split('.').pop(), w.val]));

let n = 0;
/** Mount a fresh widget whose first loadpoint reports `status`. */
async function show(status) {
    n += 1;
    const id = `evccmodes${n}`;
    const prefix = `auratest-evccmodes.${n}`;
    const values = {};
    for (const [k, v] of Object.entries(status)) values[`${prefix}.loadpoint.1.status.${k}`] = v;
    values[`${prefix}.loadpoint.1.status.connected`] = true;
    values[`${prefix}.loadpoint.1.status.title`] = 'Garage';
    await page.evaluate(
        ([id, prefix, values]) => {
            window.__auraShot.mock(values);
            window.__auraShot.mockServerState(values);
            window.__auraShot.showWidgets([
                {
                    id,
                    type: 'evcc',
                    title: 'Wallbox',
                    datapoint: '',
                    gridPos: { x: 0, y: 0, w: 8, h: 10 },
                    options: { evccPrefix: prefix, loadpointCount: 1, showBattery: false },
                },
            ]);
        },
        [id, prefix, values],
    );
    const root = page.locator(`.aura-widget-${id}`);
    await root.waitFor({ timeout: 10000 });
    await page.waitForTimeout(700);
    await writes();
    return root;
}

const labels = (root) =>
    root
        .locator('button')
        .allTextContents()
        .then((t) => t.map((s) => s.trim()).filter((s) => /^(AUS|PV|MIN\+PV|SMART|SOFORT|♾)$/.test(s)));
const always = (root) => root.locator('button[aria-pressed]');

// ── evcc < 0.316: four modes, nothing new ────────────────────────────────────
let w = await show({ mode: 'pv' });
eq('old evcc: the four known modes', await labels(w), ['AUS', 'PV', 'MIN+PV', 'SOFORT']);
eq('old evcc: no always-charge toggle', await always(w).count(), 0);
await w.locator('button:text-is("MIN+PV")').click();
await page.waitForTimeout(200);
eq('old evcc: MIN+PV writes 2', await writes(), [['pvControl', 2]]);

// ── evcc >= 0.316, Smart with always charge on ───────────────────────────────
w = await show({ mode: 'smart', alwaysCharge: 'on' });
eq('new evcc: Off · Smart · Now + toggle', await labels(w), ['AUS', 'SMART', 'SOFORT', '♾']);
eq('new evcc: the toggle shows always charge on', await always(w).getAttribute('aria-pressed'), 'true');
await w.locator('button:text-is("SMART")').click();
await page.waitForTimeout(200);
eq('clicking Smart while in Smart writes nothing (pv would reset always charge)', await writes(), []);
await always(w).click();
await page.waitForTimeout(200);
eq('switching always charge off writes pv', await writes(), [['pvControl', 1]]);

// ── Smart from another mode keeps the option ────────────────────────────────
w = await show({ mode: 'off', alwaysCharge: 'on' });
await w.locator('button:text-is("SMART")').click();
await page.waitForTimeout(200);
eq('Smart with always charge on writes minpv', await writes(), [['pvControl', 2]]);

w = await show({ mode: 'now', alwaysCharge: 'off' });
eq('new evcc detected from alwaysCharge alone', await labels(w), ['AUS', 'SMART', 'SOFORT', '♾']);
eq('the toggle shows always charge off', await always(w).getAttribute('aria-pressed'), 'false');
await w.locator('button:text-is("SMART")').click();
await page.waitForTimeout(200);
eq('Smart with always charge off writes pv', await writes(), [['pvControl', 1]]);
await w.locator('button:text-is("AUS")').click();
await page.waitForTimeout(200);
eq('Off writes 0', await writes(), [['pvControl', 0]]);

w = await show({ mode: 'smart', alwaysCharge: 'off' });
await always(w).click();
await page.waitForTimeout(200);
eq('switching always charge on writes minpv', await writes(), [['pvControl', 2]]);

eq('no page errors', pageErrors, []);
await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
