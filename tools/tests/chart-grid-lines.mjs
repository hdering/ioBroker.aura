// Verifies the horizontal helper lines of the simple chart and the climate widget (issue #558).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/chart-grid-lines.mjs
//
// Both widgets render with recharts, so the lines are real SVG elements
// (.recharts-cartesian-grid-horizontal line) and can be counted in the DOM. Checked: off by
// default, on with `showGridLines`, no vertical lines, and independent of `showYAxis` — the
// grid has to appear with a hidden y axis too, which is the default of both widgets.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

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
await page.evaluate(() => window.__auraShot.enableHistory(true));

/** Renders one widget and returns the number of grid lines recharts drew. */
async function gridLines(widget, values) {
    await page.evaluate(
        ([w, vals]) => {
            window.__auraShot.mock(vals);
            window.__auraShot.mockServerState(vals);
            window.__auraShot.showWidgets([w]);
        },
        [widget, values],
    );
    // Wait for the line/area itself — the grid is painted in the same frame.
    try {
        await page.waitForFunction(() => !!document.querySelector('.recharts-line, .recharts-area'), {
            timeout: 15000,
        });
    } catch {
        /* fall through — the counts below report the empty render */
    }
    await page.waitForTimeout(400);
    return page.evaluate(() => ({
        horizontal: document.querySelectorAll('.recharts-cartesian-grid-horizontal line').length,
        vertical: document.querySelectorAll('.recharts-cartesian-grid-vertical line').length,
    }));
}

// Every case uses its own datapoint id: the fabricated history is generated per id at fetch
// time, so a reused id would keep serving the previous case's series.
const chart = (dp, options) => ({
    id: `w-chart-${dp}`,
    type: 'chart',
    title: 'Leistung',
    datapoint: dp,
    layout: options.layout ?? 'default',
    gridPos: { x: 0, y: 0, w: 12, h: 8 },
    options: {
        historyInstance: 'history.0',
        historyRange: '24h',
        decimals: 1,
        unit: 'W',
        ...options,
    },
});

// ── 1. Off by default — existing charts keep their look ──────────────────────
{
    const g = await gridLines(chart('demo.grid1', {}), { 'demo.grid1': 1500 });
    check('simple chart draws no grid lines by default', g.horizontal === 0, JSON.stringify(g));
}

// ── 2. showGridLines draws horizontal lines only ─────────────────────────────
{
    const g = await gridLines(chart('demo.grid2', { showGridLines: true }), { 'demo.grid2': 1500 });
    check('showGridLines draws horizontal lines', g.horizontal > 1, JSON.stringify(g));
    check('no vertical lines are added', g.vertical === 0, JSON.stringify(g));
}

// ── 3. Works with a hidden y axis (the default) and with a visible one ───────
{
    const hidden = await gridLines(chart('demo.grid3', { showGridLines: true, showYAxis: false }), {
        'demo.grid3': 1500,
    });
    check('grid lines appear although the y axis is hidden', hidden.horizontal > 1, JSON.stringify(hidden));

    const shown = await gridLines(chart('demo.grid4', { showGridLines: true, showYAxis: true }), {
        'demo.grid4': 1500,
    });
    check('grid lines appear with a visible y axis', shown.horizontal > 1, JSON.stringify(shown));
}

// ── 4. Card layout (area chart) honours the option too ──────────────────────
{
    const off = await gridLines(chart('demo.grid5', { layout: 'card' }), { 'demo.grid5': 1500 });
    check('card layout has no grid lines by default', off.horizontal === 0, JSON.stringify(off));

    const on = await gridLines(chart('demo.grid6', { layout: 'card', showGridLines: true }), { 'demo.grid6': 1500 });
    check('card layout draws grid lines when enabled', on.horizontal > 1, JSON.stringify(on));
}

// ── 5. The climate widget shares the option ─────────────────────────────────
{
    const climate = (dp, options) => ({
        id: `w-climate-${dp}`,
        type: 'climate',
        title: 'Wohnzimmer',
        datapoint: dp,
        layout: 'default',
        gridPos: { x: 0, y: 0, w: 12, h: 10 },
        options: { historyInstance: 'history.0', historyRange: '24h', decimals: 1, ...options },
    });

    const off = await gridLines(climate('demo.temp1', {}), { 'demo.temp1': 21.5 });
    check('climate widget has no grid lines by default', off.horizontal === 0, JSON.stringify(off));

    const on = await gridLines(climate('demo.temp2', { showGridLines: true }), { 'demo.temp2': 21.5 });
    check('climate widget draws grid lines when enabled', on.horizontal > 1, JSON.stringify(on));
}

check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
