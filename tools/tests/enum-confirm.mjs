// The "Auswahlfeld" (enum) widget's security prompt (#674) — the same option the
// input widget already carries: picking an entry must not write the datapoint
// until the user confirms.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/enum-confirm.mjs
//
// What is worth pinning here is the value, not just the fact that something was
// written: the picked entry is parked in a ref while the overlay is up, so a
// regression that loses it would still write — just the wrong thing, or nothing.
// Cancel has to drop that parked value again, otherwise the next confirmed pick
// writes the entry the user cancelled.
//
// captureWrites() keeps the clicks off the socket (the datapoint below is under a
// root that exists nowhere, but the dev server still proxies a real ioBroker).
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const eq = (name, got, want) => check(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 900, height: 700 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

const DP = 'aura-selftest.0.enum-confirm.mode';
const VALUES = { [DP]: 0 };
const ENTRIES = [
    { value: '0', label: 'Aus' },
    { value: '1', label: 'Heizen' },
    { value: '2', label: 'Kühlen' },
];

await page.evaluate((values) => {
    window.__auraShot.captureWrites(true);
    window.__auraShot.mock(values);
    window.__auraShot.mockServerState(values);
}, VALUES);

const writes = (reset = false) => page.evaluate((r) => window.__auraShot.writes(r), reset);

/** Mounts the widget in one layout with the given options. */
async function show(layout, options) {
    await page.evaluate(
        ([lay, opts, dp, entries]) => {
            window.__auraShot.showWidgets([
                {
                    id: `enum-${lay}`,
                    type: 'enum',
                    title: 'Betriebsart',
                    datapoint: dp,
                    layout: lay,
                    gridPos: { x: 0, y: 0, w: 8, h: 6 },
                    options: { entries, ...opts },
                },
            ]);
        },
        [layout, options, DP, ENTRIES],
    );
    await page.waitForSelector('.aura-widget-action button', { timeout: 10000 });
    await page.evaluate((values) => window.__auraShot.mock(values), VALUES);
    await page.waitForTimeout(500);
    await writes(true);
}

/** Opens the dropdown and clicks the option with the given label. */
async function pick(label) {
    await page.click('.aura-widget-action button');
    await page.waitForTimeout(150);
    await page.click(`.z-\\[9999\\] button:has-text("${label}")`);
    await page.waitForTimeout(250);
}

// The overlay is the only element carrying this class pair (see ConfirmOverlay).
const overlayText = () =>
    page.evaluate(() => {
        const el = document.querySelector('.rounded-widget.z-10');
        return el ? el.textContent : '';
    });

// ── 1. Option off: the pick writes straight away (unchanged behaviour) ───────
await show('default', {});
await pick('Heizen');
let log = await writes();
eq('without the option the pick writes immediately', log.at(-1)?.val, 1);
eq('and it writes the widget datapoint', log.at(-1)?.id, DP);

// ── 2. Option on: the pick asks first and writes nothing yet ─────────────────
await show('default', { confirmAction: true });
await pick('Heizen');
log = await writes();
eq('with the option on nothing is written yet', log.length, 0);
let txt = await overlayText();
check('the confirmation overlay is up', txt.includes('Ja') && txt.includes('Abbruch'), txt);

// ── 3. Confirming writes exactly the picked entry ────────────────────────────
await page.click('.aura-widget-enum-default button:has-text("Ja")');
await page.waitForTimeout(250);
log = await writes();
eq('confirming writes once', log.length, 1);
eq('and it writes the entry that was picked', log.at(-1)?.val, 1);
check('the overlay is gone again', (await overlayText()) === '', await overlayText());

// ── 4. Cancelling writes nothing and forgets the pick ────────────────────────
await show('default', { confirmAction: true });
await pick('Kühlen');
await page.click('.aura-widget-enum-default button:has-text("Abbruch")');
await page.waitForTimeout(250);
log = await writes();
eq('cancelling writes nothing', log.length, 0);
check('the overlay is gone after cancel', (await overlayText()) === '', await overlayText());

// A cancelled pick must not be resurrected by the next confirmed one.
await pick('Heizen');
await page.click('.aura-widget-enum-default button:has-text("Ja")');
await page.waitForTimeout(250);
log = await writes();
eq('the next confirmed pick writes its own value', log.at(-1)?.val, 1);
eq('and only once', log.length, 1);

// ── 5. The custom prompt text replaces the default ───────────────────────────
await show('default', { confirmAction: true, confirmText: 'Betriebsart wirklich ändern?' });
await pick('Heizen');
txt = await overlayText();
check('the configured prompt is shown', txt.includes('Betriebsart wirklich ändern?'), txt);
await page.click('.aura-widget-enum-default button:has-text("Abbruch")');
await page.waitForTimeout(200);

// ── 6. Every layout gets the overlay, including custom ───────────────────────
// The custom grid carries no dropdown by default, so the select component slot is
// placed explicitly — that is the only way the overlay can be reached there.
const CUSTOM_GRID = {
    cols: 3,
    rows: 3,
    cells: [
        { type: 'title', fontSize: 12, align: 'left', valign: 'top' },
        ...Array.from({ length: 3 }, () => ({ type: 'empty' })),
        { type: 'component', componentKey: 'select' },
        ...Array.from({ length: 4 }, () => ({ type: 'empty' })),
    ],
};

for (const layout of ['compact', 'minimal', 'card', 'custom']) {
    await show(layout, { confirmAction: true, ...(layout === 'custom' ? { customGrid: CUSTOM_GRID } : null) });
    await pick('Heizen');
    const up = await overlayText();
    check(`layout ${layout}: the overlay appears`, up.includes('Ja'), up);
    const pendingLog = await writes();
    eq(`layout ${layout}: nothing written while asking`, pendingLog.length, 0);
    await page.click(`.aura-widget-enum-${layout} button:has-text("Ja")`);
    await page.waitForTimeout(250);
    eq(`layout ${layout}: confirming writes the entry`, (await writes()).at(-1)?.val, 1);
}

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\nenum-confirm: ${results.length - failed.length}/${results.length} passed\n`);
process.exit(failed.length ? 1 : 0);
