// LED segments of the fill widget follow the tile (issue #756).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/fill-segments.mjs
//
// Checked here: the default is still 12 segments, `segmentCount` sets the number,
// and `segmentFillWidth` adds segments of the configured size until the bar spans the
// tile — horizontally across the width, vertically down the height — while a tile too
// small for more keeps its configured count.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const SOC = 'demo.segments.level';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });
await page.evaluate(() => window.__auraShot.writes(true));

const widget = (opts, gridPos) => ({
    id: 'w-seg',
    type: 'fill',
    title: 'Füllstand',
    datapoint: SOC,
    layout: 'segments',
    gridPos,
    options: { unit: '%', decimals: 0, minValue: 0, maxValue: 100, orientation: 'horizontal', ...opts },
});

async function show(cfg) {
    await page.evaluate(
        ([w, soc]) => {
            const vals = { [soc]: 50 };
            window.__auraShot.mock(vals);
            window.__auraShot.mockServerState(vals);
            window.__auraShot.showWidgets([w]);
        },
        [cfg, SOC],
    );
    await page.waitForSelector('.aura-widget-value svg rect', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(400);
}

/** Segment count, lit count and how much of the host the segments span. */
const measure = () =>
    page.evaluate(() => {
        const svg = document.querySelector('.aura-widget-value svg');
        const host = svg?.parentElement;
        const rects = [...(svg?.querySelectorAll('rect') ?? [])];
        if (!host || !rects.length) return null;
        const h = host.getBoundingClientRect();
        const boxes = rects.map((r) => r.getBoundingClientRect());
        const left = Math.min(...boxes.map((b) => b.left));
        const right = Math.max(...boxes.map((b) => b.right));
        const top = Math.min(...boxes.map((b) => b.top));
        const bottom = Math.max(...boxes.map((b) => b.bottom));
        return {
            count: rects.length,
            lit: rects.filter((r) => r.hasAttribute('data-aura-fill-level')).length,
            spanX: (right - left) / h.width,
            spanY: (bottom - top) / h.height,
            segW: boxes[0].width,
            segH: boxes[0].height,
        };
    });

const WIDE = { x: 0, y: 0, w: 12, h: 4 };
const SMALL = { x: 0, y: 0, w: 3, h: 4 };
const TALL = { x: 0, y: 0, w: 8, h: 30 };

// ── 1. Default unchanged ────────────────────────────────────────────────────
await show(widget({}, WIDE));
const base = await measure();
check('default keeps 12 segments', base?.count === 12, JSON.stringify(base));
check('half of them lit at 50 %', base?.lit === 6, String(base?.lit));
check('and leaves margins on a wide tile', base && base.spanX < 0.7, base?.spanX.toFixed(2));

// ── 2. Configured count ─────────────────────────────────────────────────────
await show(widget({ segmentCount: 20 }, WIDE));
let r = await measure();
check('segmentCount sets the number', r?.count === 20, String(r?.count));
check('segmentCount 20 lights 10 at 50 %', r?.lit === 10, String(r?.lit));

// ── 3. Fill width ───────────────────────────────────────────────────────────
await show(widget({ segmentFillWidth: true }, WIDE));
r = await measure();
check('fill width adds segments on a wide tile', r && r.count > 12, String(r?.count));
check('and spans the tile', r && r.spanX > 0.97, r?.spanX.toFixed(3));
check('segments keep roughly their size', r && Math.abs(r.segH - base.segH) < 1, `${r?.segH} vs ${base?.segH}`);
check('lit share stays at half', r && Math.abs(r.lit / r.count - 0.5) <= 1 / r.count, `${r?.lit}/${r?.count}`);

await show(widget({ segmentFillWidth: true }, SMALL));
r = await measure();
check('a small tile keeps the configured 12', r?.count === 12, String(r?.count));

await show(widget({ segmentFillWidth: true, segmentCount: 8 }, WIDE));
const coarse = await measure();
await show(widget({ segmentFillWidth: true, segmentCount: 24 }, WIDE));
const fine = await measure();
check(
    'segmentCount sets the segment size when filling',
    coarse && fine && fine.count > coarse.count * 2.5,
    `${coarse?.count} → ${fine?.count}`,
);

// ── 4. Vertical ─────────────────────────────────────────────────────────────
await show(widget({ orientation: 'vertical', showValue: false }, TALL));
const vBase = await measure();
await show(widget({ orientation: 'vertical', showValue: false, segmentFillWidth: true }, TALL));
r = await measure();
check('vertical: fill adds rows on a tall tile', r && r.count > 12 && r.count < 200, `${vBase?.count} → ${r?.count}`);
check('vertical: and spans the height', r && r.spanY > 0.97, r?.spanY.toFixed(3));

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
