// Verifies the time formats of the list stepper in the rendered widget (#827).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/list-stepper-format.mjs
//
// Uses the screenshot harness (__auraShot) with captureWrites, so the −/+ clicks never
// reach the socket. Checked: a Sprinkle Control running time "05:00" shows as 05:00 and
// "+" writes the next step in minutes as a number; `stepWrite: 'time'` writes "10:00";
// the plain stepper still shows and writes numbers.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const DP = 'daikin-cloud.0.aura-selftest-device.runningTime';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });
await page.evaluate(() => window.__auraShot.captureWrites(true));

let n = 0;
/** Renders a list with one stepper entry, returns the printed value and the write of a "+" click. */
async function run(entryPatch, value) {
    const widget = {
        id: `w-stepper-${++n}`,
        type: 'list',
        title: 'Sprinkler',
        datapoint: '',
        layout: 'default',
        gridPos: { x: 0, y: 0, w: 6, h: 3 },
        options: {
            entries: [{ id: DP, label: 'Laufzeit', role: 'value', displayType: 'stepper', ...entryPatch }],
        },
    };
    await page.evaluate(
        ([w, values]) => {
            window.__auraShot.mock(values);
            window.__auraShot.mockServerState(values);
            window.__auraShot.showWidgets([w]);
        },
        [widget, { [DP]: value }],
    );
    await page.waitForTimeout(400);
    await page.evaluate((values) => window.__auraShot.mock(values), { [DP]: value });
    await page.waitForTimeout(300);
    const shown = await page.evaluate(
        () => document.querySelector('.aura-widget button[aria-label="−"] + span')?.textContent?.trim() ?? null,
    );
    await page.evaluate(() => window.__auraShot.writes(true));
    await page.locator('.aura-widget button[aria-label="+"]').first().click();
    await page.waitForTimeout(200);
    const written = await page.evaluate(() => window.__auraShot.lastWrite);
    return { shown, written };
}

const sprinkle = { stepTimeFormat: 'mm:ss', stepUnit: 'min', stepStep: 5, stepMin: 0, stepMax: 60 };

let r = await run(sprinkle, '05:00');
check('sprinkle: "05:00" shows as 05:00', r.shown === '05:00', `shown ${JSON.stringify(r.shown)}`);
check('sprinkle: "+" writes 10 (minutes, number)', r.written?.val === 10, JSON.stringify(r.written));

r = await run(sprinkle, '00:00');
check('sprinkle: idle "00:00" shows 00:00', r.shown === '00:00', `shown ${JSON.stringify(r.shown)}`);
check('sprinkle: "+" from idle writes 5', r.written?.val === 5, JSON.stringify(r.written));

r = await run({ ...sprinkle, stepWrite: 'time' }, '05:00');
check('time write: "+" writes "10:00"', r.written?.val === '10:00', JSON.stringify(r.written));

r = await run({ stepStep: 1 }, 20);
check('plain: 20 shows as a number (list decimals)', Number(r.shown) === 20, `shown ${JSON.stringify(r.shown)}`);
check('plain: "+" writes 21', r.written?.val === 21, JSON.stringify(r.written));

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((x) => !x.ok).length;
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
