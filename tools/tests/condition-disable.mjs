// Verifies the condition effect "Widget deaktivieren" against the dev server.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/condition-disable.mjs
//
// While a rule with `disableWidget` matches, the card turns grey, a veil covers
// it and a click on the control writes nothing. When the rule stops matching the
// same click writes again. Values come from __auraShot.mock, writes are captured
// (captureWrites) — no real datapoint is touched.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const LOCK_DP = 'demo.disableLock';
const SW_DP = 'demo.disableSwitch';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const widget = {
    id: 'cd-test',
    type: 'switch',
    title: 'Pumpe',
    datapoint: SW_DP,
    gridPos: { x: 0, y: 0, w: 8, h: 4 },
    options: {
        conditions: [
            {
                id: 'cd-rule',
                logic: 'AND',
                clauses: [{ datapoint: LOCK_DP, operator: 'true', value: '' }],
                style: {},
                effect: 'none',
                disableWidget: true,
            },
        ],
    },
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });
await page.evaluate(() => window.__auraShot.captureWrites(true));

const settle = () => page.waitForTimeout(500);
const setDp = (values) => page.evaluate((v) => window.__auraShot.mock(v), values);
const state = () =>
    page.evaluate(() => {
        const el = document.querySelector('.aura-widget-cd-test');
        if (!el) return null;
        return {
            disabled: el.classList.contains('aura-cond-disabled'),
            veil: !!el.querySelector(':scope > .aura-cond-disabled-veil'),
            filter: getComputedStyle(el).filter,
        };
    });
const clickControl = async () => {
    await page.evaluate(() => window.__auraShot.writes(true));
    // Mouse at the toggle's position rather than locator.click(): the click has
    // to travel the way a finger's does, so the veil gets the chance to catch it.
    const box = await page.locator('.aura-widget-cd-test button').first().boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(300);
    await page.mouse.move(2, 2);
    return page.evaluate(() => window.__auraShot.writes());
};

await setDp({ [LOCK_DP]: true, [SW_DP]: false });
await page.evaluate(([w]) => window.__auraShot.showWidgets([w]), [widget]);
await settle();

{
    const s = await state();
    check('matching rule marks the widget disabled', !!s?.disabled, JSON.stringify(s));
    check('veil covers the card', !!s?.veil);
    check('card is greyed out', !!s?.filter?.includes('grayscale'), s?.filter);
    const writes = await clickControl();
    check('clicks on a disabled widget write nothing', writes.length === 0, JSON.stringify(writes));
}

await setDp({ [LOCK_DP]: false });
await settle();
{
    const s = await state();
    check('rule no longer matching enables the widget', s && !s.disabled && !s.veil, JSON.stringify(s));
    const writes = await clickControl();
    check(
        'clicks write again once enabled',
        writes.some((w) => w.id === SW_DP),
        JSON.stringify(writes),
    );
}

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `\n${failed.length} FAILED` : '\nall passed');
process.exit(failed.length ? 1 : 0);
