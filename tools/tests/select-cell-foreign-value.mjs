// Universal-Widget Auswahl cells sharing one datapoint (#744).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/select-cell-foreign-value.mjs
//
// Several cells may point at the same datapoint, each listing only its own
// entries. A cell whose list does not cover the current value must show the
// dash — like the Auswahlfeld widget since #679 — not the raw value another
// cell wrote.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const eq = (name, got, want) => check(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1000, height: 800 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
await page.evaluate(() => window.__auraShot.captureWrites(true));

const DP = 'aura-selftest.0.select-cell.instance';
const TOP = [
    { value: 'flot.0', label: 'Flot' },
    { value: 'history.0', label: 'History' },
];
const BOTTOM = [
    { value: 'echarts.0', label: 'eCharts' },
    { value: 'sql.0', label: 'SQL' },
];

let seq = 0;

// Values are seeded before each mount — offline, useDatapoint never subscribes,
// so a value has to be in the cache when the widget mounts.
async function show(value, extra = {}) {
    const id = `uni${++seq}`;
    await page.evaluate(
        ([wid, dp, val, top, bottom, ex]) => {
            window.__auraShot.mock({ [dp]: val });
            window.__auraShot.mockServerState({ [dp]: val });
            window.__auraShot.showWidgets([
                {
                    id: wid,
                    type: 'universal',
                    title: '',
                    layout: 'custom',
                    gridPos: { x: 0, y: 0, w: 12, h: 6 },
                    options: {
                        showTitle: false,
                        showIcon: false,
                        customGrid: {
                            cols: 1,
                            rows: 2,
                            cells: [
                                { type: 'select', dpId: dp, entries: top, ...ex },
                                { type: 'select', dpId: dp, entries: bottom, ...ex },
                            ],
                        },
                    },
                },
            ]);
        },
        [id, DP, value, TOP, BOTTOM, extra],
    );
    await page.waitForSelector(`.aura-widget-${id} .aura-custom-cell-1 .aura-widget-action button`, { timeout: 10000 });
    await page.waitForTimeout(300);
    const text = (i) =>
        page.locator(`.aura-widget-${id} .aura-custom-cell-${i} .aura-widget-action button`).innerText();
    return { top: (await text(0)).trim(), bottom: (await text(1)).trim() };
}

const a = await show('echarts.0');
eq('the cell listing the value shows its label', a.bottom, 'eCharts');
eq('the other cell shows a dash, not the raw value', a.top, '–');

const b = await show('history.0');
eq('and the other way round: matching cell', b.top, 'History');
eq('and the other way round: dash', b.bottom, '–');

const c = await show('');
eq('an empty value shows a dash too', c.top, '–');

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\nselect-cell-foreign-value: ${results.length - failed.length}/${results.length} passed\n`);
process.exit(failed.length ? 1 : 0);
