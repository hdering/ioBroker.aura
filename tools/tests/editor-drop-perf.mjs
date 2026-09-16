// How long the browser is busy when a widget is dropped in the grid editor —
// the "kurz stocken" after releasing the mouse.
//
//   AURA_IOBROKER_URL=http://127.0.0.1:9 npx vite --port 5199    (or set AURA_BASE)
//   AURA_BASE=http://localhost:5199 node tools/tests/editor-drop-perf.mjs
//
// Measures the mouseup event's processing time (PerformanceObserver 'event', no
// profiler overhead) for a tab with 60 and with 20 widgets, plus a variant with
// five more tabs of 200 widgets each, so a regression in either "per widget on the
// tab" or "per widget anywhere" shows up. Reference on the dev server (React dev
// build, 2026-09): 60 widgets ~16 ms, 20 widgets ~8 ms. Before WidgetFrame was
// memoised every frame on the tab re-rendered on a drop: 60 widgets ~36 ms.
//
// Fails only on a gross regression (60 widgets > 60 ms) — absolute numbers depend
// on the machine; read the table.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5173';
const DRAGS = 6;
const LIMIT_MS = Number(process.env.DROP_LIMIT_MS ?? 60);

const widget = (id, x, y) => ({
    id,
    type: 'value',
    title: `W ${id}`,
    datapoint: `demo.0.${id}`,
    layout: 'default',
    gridPos: { x, y, w: 12, h: 6 },
    options: { showTitle: true, unit: '°C', decimals: 1 },
});
const tab = (ti, n) => ({
    id: `tab${ti}`,
    name: `Tab ${ti}`,
    slug: `tab-${ti}`,
    widgets: Array.from({ length: n }, (_, i) => widget(`w${ti}-${i}`, (i % 5) * 12, Math.floor(i / 5) * 6)),
});
const makeLayouts = ({ onTab, otherTabs, otherWidgets }) => [
    {
        id: 'layout-default',
        name: 'Standard',
        slug: 'default',
        activeSectionId: 'sec',
        settings: { gridRowHeight: 20, gridSnapX: 20, gridGap: 10 },
        sections: [
            {
                id: 'sec',
                name: 'B',
                slug: 'b',
                activeTabId: 'tab0',
                tabs: [tab(0, onTab), ...Array.from({ length: otherTabs }, (_, i) => tab(i + 1, otherWidgets))],
            },
        ],
    },
];

const VARIANTS = [
    { name: '60 widgets on the tab', onTab: 60, otherTabs: 0, otherWidgets: 0, guard: true },
    { name: '60 on the tab + 5 tabs x 200', onTab: 60, otherTabs: 5, otherWidgets: 200 },
    { name: '20 widgets on the tab', onTab: 20, otherTabs: 0, otherWidgets: 0 },
];

const browser = await chromium.launch();
const page = await (
    await browser.newContext({ viewport: { width: 1400, height: 900 }, ignoreHTTPSErrors: true })
).newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
await page.evaluate(() => {
    window.__dropPerf = [];
    new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
            if (e.name === 'mouseup') window.__dropPerf.push(e.processingEnd - e.processingStart);
        }
    }).observe({ type: 'event', durationThreshold: 16, buffered: true });
});

const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const results = [];
console.log(`${BASE}  mouseup processing per drop, median of ${DRAGS - 1} (first drop = warm-up, dropped):`);
for (const v of VARIANTS) {
    await page.evaluate((l) => window.__auraShot.seed({ layouts: l, editMode: true }), makeLayouts(v));
    await page.waitForTimeout(700);
    await page.evaluate(() => window.__auraShot.editHistory?.(true));
    const rows = [];
    for (let n = 0; n < DRAGS; n++) {
        // Left-column widgets only, dragged 240 px to the right — always inside the grid.
        const id = `w0-${(n * 5) % v.onTab}`;
        const box = await page.locator(`.aura-widget-${id}`).boundingBox();
        const gx = box.x + 16;
        const gy = box.y + box.height - 10;
        await page.mouse.move(gx, gy);
        await page.mouse.down();
        for (let i = 1; i <= 12; i++) {
            await page.mouse.move(gx + (240 * i) / 12, gy + 4 * Math.sin(i));
            await page.waitForTimeout(16);
        }
        await page.evaluate(() => {
            window.__dropPerf = [];
        });
        await page.mouse.up();
        await page.waitForTimeout(500);
        // Below the 16 ms reporting threshold nothing is recorded — that counts as fast.
        const ms = await page.evaluate(() => window.__dropPerf[0] ?? 0);
        if (n > 0) rows.push(ms);
    }
    const m = med(rows);
    results.push({ ...v, ms: m });
    console.log(`  ${m.toFixed(1).padStart(6)} ms   ${v.name}   (drops: ${rows.map((r) => r.toFixed(0)).join(' ')})`);
}
await browser.close();

const guard = results.find((r) => r.guard);
const ok = guard.ms <= LIMIT_MS && pageErrors.length === 0;
console.log(
    ok
        ? `\nok: ${guard.name} ${guard.ms.toFixed(1)} ms <= ${LIMIT_MS} ms`
        : `\nFAIL: ${guard.name} ${guard.ms.toFixed(1)} ms > ${LIMIT_MS} ms ${pageErrors.join(' | ')}`,
);
if (!ok) process.exit(1);
