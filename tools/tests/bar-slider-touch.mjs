// Verifies that the bar-style sliders follow a finger drag (forum report, dimmer in a popup).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/bar-slider-touch.mjs
//
// The bar sliders are plain divs driven by pointer events. Without `touch-action` the
// browser read a horizontal finger drag as a pan, fired pointercancel after the first few
// pixels and the bar stopped following — a tap jumped, a drag did nothing. Checked with
// real touch events (CDP), not synthetic pointer events: a horizontal drag moves the bar,
// writes (once on release, or along the way for a live slider), the value label follows during the drag, and a vertical swipe
// on the bar still scrolls the page.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({
    viewport: { width: 420, height: 800 },
    hasTouch: true,
    isMobile: true,
    ignoreHTTPSErrors: true,
});
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });
const cdp = await ctx.newCDPSession(page);

const DP = 'demo.bar.level';
const filler = {
    id: 'w-tall',
    type: 'value',
    title: 'Füller',
    datapoint: DP,
    layout: 'default',
    gridPos: { x: 0, y: 8, w: 12, h: 80 },
    options: {},
};

const scrollEl = `(() => [document.scrollingElement, ...document.querySelectorAll('div')]
    .find((n) => n && n.scrollHeight > n.clientHeight + 100 && n.clientHeight > 300))()`;
const scrollTop = () => page.evaluate(`(${scrollEl})?.scrollTop ?? -1`);
const scrollTo0 = () => page.evaluate(`{ const el = ${scrollEl}; if (el) el.scrollTop = 0; }`);

async function show(w, val = 20) {
    await page.evaluate(
        ([ws, v, dp]) => {
            window.__auraShot.mock({ [dp]: v });
            // mock() alone is overwritten by the getState round-trip on remount.
            window.__auraShot.mockServerState({ [dp]: v });
            window.__auraShot.showWidgets(ws);
        },
        [[w, filler], val, DP],
    );
    await page.waitForSelector(`[data-aura-widget="${w.id}"] .nodrag.select-none`, { timeout: 15000 });
    await page.waitForTimeout(300);
    // The previous case left the page scrolled.
    await scrollTo0();
    await page.evaluate(() => window.__auraShot.writes(true));
}

const barBox = (id) =>
    page.evaluate((wid) => {
        const el = document.querySelector(`[data-aura-widget="${wid}"] .nodrag.select-none`);
        const r = el.getBoundingClientRect();
        return { left: r.left, top: r.top, width: r.width, height: r.height };
    }, id);

const writes = () => page.evaluate(() => window.__auraShot.writes());

/**
 * A finger moving from (x0, y0) to (x1, y1) as raw touch events; `mid` runs halfway.
 *
 * @param x0
 * @param y0
 * @param x1
 * @param y1
 * @param mid
 */
const touchDrag = async (x0, y0, x1, y1, mid) => {
    const at = (i) => ({ x: Math.round(x0 + ((x1 - x0) * i) / 10), y: Math.round(y0 + ((y1 - y0) * i) / 10), id: 1 });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [at(0)] });
    for (let i = 1; i <= 10; i++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [at(i)] });
        await page.waitForTimeout(16);
        if (i === 10 && mid) {
            await mid();
        }
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(400);
};

const CASES = [
    {
        name: 'dimmer (default layout, bar style)',
        widget: {
            id: 'w-dim',
            type: 'dimmer',
            title: 'Decke Mitte',
            datapoint: DP,
            layout: 'default',
            gridPos: { x: 0, y: 0, w: 12, h: 7 },
            options: { barStyle: true },
        },
        label: '[data-aura-widget="w-dim"] .aura-widget-value',
    },
    {
        name: 'dimmer (minimal layout, bar style)',
        widget: {
            id: 'w-dim',
            type: 'dimmer',
            title: 'Decke Mitte',
            datapoint: DP,
            layout: 'minimal',
            gridPos: { x: 0, y: 0, w: 12, h: 7 },
            options: { barStyle: true },
        },
        label: '[data-aura-widget="w-dim"] .aura-widget-value',
    },
    {
        name: 'slider (bar style)',
        // The slider writes every step unless commitOnRelease is set.
        live: true,
        widget: {
            id: 'w-sl',
            type: 'slider',
            title: 'Regler',
            datapoint: DP,
            layout: 'default',
            gridPos: { x: 0, y: 0, w: 12, h: 7 },
            options: { barStyle: true, minValue: 0, maxValue: 100, step: 1 },
        },
    },
];

for (const c of CASES) {
    console.log(`\n${c.name}`);
    await show(c.widget, 20);
    let b = await barBox(c.widget.id);
    const y = b.top + b.height / 2;
    let midLabel = null;
    await touchDrag(b.left + b.width * 0.2, y, b.left + b.width * 0.8, y, async () => {
        if (c.label) {
            midLabel = await page.locator(c.label).first().textContent();
        }
    });
    const w = await writes();
    const last = w[w.length - 1];
    if (c.live) {
        check('a horizontal finger drag writes along the way', w.length > 5, `${w.length} writes`);
    } else {
        check('a horizontal finger drag writes once', w.length === 1, JSON.stringify(w));
    }
    check('at the point where the finger let go', last && Math.abs(last.val - 80) <= 2, JSON.stringify(last));
    if (c.label) {
        check('the value label follows the drag', /^(7[8-9]|8[0-2])%$/.test(midLabel ?? ''), midLabel);
    }

    await scrollTo0();
    await page.evaluate(() => window.__auraShot.writes(true));
    b = await barBox(c.widget.id);
    const sx = b.left + b.width / 2;
    const sy = b.top + b.height / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: sx, y: sy, id: 1 }] });
    for (let i = 1; i <= 10; i++) {
        await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [{ x: Math.round(sx), y: Math.round(sy - 24 * i), id: 1 }],
        });
        await page.waitForTimeout(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(500);
    const top = await scrollTop();
    check('a vertical swipe on the bar still scrolls the page', top > 40, `scrollTop ${top}`);
}

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
