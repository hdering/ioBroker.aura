// Timer: further target datapoints next to targetDp (#774).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/timer-extra-targets.mjs
//
// Opens the timer's config panel, adds two extra datapoints, removes one and
// checks options.extraTargetDps plus the status tooltip that lists every target.
// Runs through the screenshot harness (`?shot=1`): no datapoint is written.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail && !ok ? ` — ${detail}` : ''}`);
};

const TIMER = {
    id: 'w-timer',
    type: 'timer',
    title: 'Heizung',
    datapoint: '',
    gridPos: { x: 0, y: 0, w: 8, h: 8 },
    options: { stateBaseId: 'aura.0.timers.t-774', targetDp: 'demo.bad.soll', value: '21' },
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
await page.evaluate((w) => {
    window.__auraShot.showWidgets([w], { editMode: true });
    window.__auraShot.setEditMode(true);
}, TIMER);

const opts = () => page.evaluate(() => window.__auraShot.widgetOptions('w-timer'));

await page.locator('.aura-edit-chrome button').first().click();
await page.locator('button:text-is("Bearbeiten")').click();
const add = page.locator('button:has-text("Weiterer Datenpunkt")');
await add.waitFor({ timeout: 10000 });

const extras = page.locator('input[placeholder="weiterer Datenpunkt"]');
check('no extra rows at first', (await extras.count()) === 0);

await add.click();
await extras.nth(0).fill('demo.kueche.soll');
await add.click();
await extras.nth(1).fill('demo.flur.soll');
await page.waitForTimeout(300);
check(
    'two extra DPs are stored',
    JSON.stringify((await opts()).extraTargetDps) === JSON.stringify(['demo.kueche.soll', 'demo.flur.soll']),
    JSON.stringify((await opts()).extraTargetDps),
);
check('the primary target stays', (await opts()).targetDp === 'demo.bad.soll');

await page.locator('button[title="Datenpunkt entfernen"]').first().click();
await page.waitForTimeout(300);
check(
    'removing the first leaves the second',
    JSON.stringify((await opts()).extraTargetDps) === JSON.stringify(['demo.flur.soll']),
    JSON.stringify((await opts()).extraTargetDps),
);

await page.locator('button[title="Datenpunkt entfernen"]').first().click();
await page.waitForTimeout(300);
check('removing the last drops the option', (await opts()).extraTargetDps === undefined);

await add.click();
await extras.nth(0).fill('demo.kueche.soll');
await page.waitForTimeout(300);
const tip = await page
    .locator('[data-widget-id="w-timer"] [title^="Ziel:"], [title^="Ziel:"]')
    .first()
    .getAttribute('title');
check('the status tooltip lists every target', tip === 'Ziel: demo.bad.soll, demo.kueche.soll ← 21', String(tip));

await page.screenshot({ path: process.env.SHOT ?? 'node_modules/.cache/timer-extra-targets.png' });
check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
