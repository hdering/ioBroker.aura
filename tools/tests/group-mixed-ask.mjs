// Group switch, groupMixedAction 'ask': from the mixed state a click opens a small
// popup ("All on" / "All off" / Cancel) instead of writing at once.
//
//   AURA_IOBROKER_URL=http://127.0.0.1:9 npx vite --port 5212    (or set AURA_BASE)
//   AURA_BASE=http://localhost:5212 node tools/tests/group-mixed-ask.mjs
//
// captureWrites() keeps the clicks off the socket.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5212';

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
const ctx = await browser.newContext({ viewport: { width: 900, height: 700 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

const LAMP = 'aura-selftest.0.groupask.lamp';
const PLUG = 'aura-selftest.0.groupask.plug';

const writes = (reset = false) => page.evaluate((r) => window.__auraShot.writes(r), reset);
const mock = (v) =>
    page.evaluate((v) => {
        window.__auraShot.mock(v);
        window.__auraShot.mockServerState(v);
    }, v);
await page.evaluate(() => window.__auraShot.captureWrites(true));

let seq = 0;
async function show(values, mixedAction) {
    await mock(values);
    await page.evaluate((w) => window.__auraShot.showWidgets([w]), {
        id: `list-ask-${++seq}`,
        type: 'list',
        title: 'Steckdosen',
        datapoint: '',
        layout: 'default',
        gridPos: { x: 0, y: 0, w: 12, h: 8 },
        options: {
            entries: [
                { id: LAMP, label: 'Lampe', displayType: 'switch' },
                { id: PLUG, label: 'Stecker', displayType: 'switch' },
            ],
            groupSwitch: true,
            groupSwitchStyle: 'checkbox',
            groupMixedAction: mixedAction,
        },
    });
    await page.waitForSelector('.aura-checkbox', { timeout: 10000 });
    await mock(values);
    await page.waitForTimeout(400);
    await writes(true);
}
const master = () => page.locator('.aura-checkbox').first();
const btn = (name) => page.getByRole('button', { name, exact: true });

// ── 1. mixed + ask → popup, nothing written yet ────────────────────────────
await show({ [LAMP]: true, [PLUG]: false }, 'ask');
eq('mixed reads as mixed', await master().getAttribute('aria-checked'), 'mixed');
await master().click();
await page.waitForTimeout(250);
eq('the click writes nothing yet', (await writes()).length, 0);
check('the popup asks', await page.getByText('Was soll passieren?').isVisible());
await page.screenshot({ path: 'node_modules/.cache/group-mixed-ask.png' });

// ── 2. "Alle aus" switches everything off ──────────────────────────────────
await btn('Alle aus').click();
await page.waitForTimeout(300);
let log = await writes();
eq('"Alle aus" writes every target', log.map((w) => w.id).sort(), [LAMP, PLUG].sort());
check('… with off', log.length === 2 && log.every((w) => w.val === false), JSON.stringify(log));
eq('the popup closes', await page.getByText('Was soll passieren?').count(), 0);

// ── 3. "Alle an" switches everything on ────────────────────────────────────
await show({ [LAMP]: true, [PLUG]: false }, 'ask');
await master().click();
await btn('Alle an').click();
await page.waitForTimeout(300);
log = await writes();
check('"Alle an" writes on to both', log.length === 2 && log.every((w) => w.val === true), JSON.stringify(log));

// ── 4. Cancel writes nothing ───────────────────────────────────────────────
await show({ [LAMP]: true, [PLUG]: false }, 'ask');
await master().click();
await btn('Abbruch').click();
await page.waitForTimeout(300);
eq('cancel writes nothing', (await writes()).length, 0);
eq('cancel closes the popup', await page.getByText('Was soll passieren?').count(), 0);

// ── 5. Not mixed → no question, direct write ───────────────────────────────
await show({ [LAMP]: false, [PLUG]: false }, 'ask');
await master().click();
await page.waitForTimeout(300);
log = await writes();
check('all off + ask switches on directly', log.length === 2 && log.every((w) => w.val === true), JSON.stringify(log));
eq('no popup outside the mixed state', await page.getByText('Was soll passieren?').count(), 0);

// ── 6. Default stays "all on" without asking ───────────────────────────────
await show({ [LAMP]: true, [PLUG]: false }, undefined);
await master().click();
await page.waitForTimeout(300);
log = await writes();
check('default: mixed switches on directly', log.length === 2 && log.every((w) => w.val === true), JSON.stringify(log));

eq('no page errors', pageErrors, []);
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
