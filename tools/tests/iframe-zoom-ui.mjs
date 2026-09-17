// Verifies the iFrame zoom in a real browser (issue #667) against the dev server.
//
//   AURA_IOBROKER_URL=http://127.0.0.1:9 npx vite --port 5174
//   node tools/tests/iframe-zoom-ui.mjs
//
// The pure arithmetic lives in tools/tests/iframe-zoom.mjs. What only a browser can
// answer is whether the pair of numbers actually lands on the frame: the element has
// to lay out at the inverse size (so the embedded page sees the larger viewport) and
// still paint exactly the widget's width after the transform — anything else leaves a
// gap or overflows the clip. The per-device level is checked where it lives, in
// localStorage, and across a re-mount.
import { chromium } from 'playwright';
import http from 'node:http';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{height:100%;margin:0;background:#123}</style></head><body>hi</body></html>`;
const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' }).end(PAGE);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const URL_UNDER_TEST = `http://127.0.0.1:${server.address().port}/page.html`;

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const WID = 'zoom-test';
const SEL = `.aura-widget-${WID}`;
const ZOOM_KEY = 'aura-iframe-zoom';

const widget = (options) => ({
    id: WID,
    type: 'iframe',
    title: 'Zoom',
    datapoint: '',
    gridPos: { x: 0, y: 0, w: 14, h: 10 },
    options: { iframeUrl: URL_UNDER_TEST, ...options },
});

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });

async function show(options) {
    // Drop the widget first so a re-show really re-mounts and re-reads the device level.
    await page.evaluate(() => window.__auraShot.showWidgets([]));
    await page.waitForTimeout(150);
    await page.evaluate(([w]) => window.__auraShot.showWidgets([w]), [widget(options)]);
    await page.waitForTimeout(700);
}

/** Layout size (pre-transform) and painted size (post-transform) of the frame. */
const measure = (sel) =>
    page.evaluate((s) => {
        const frame = document.querySelector(`${s} iframe`);
        const box = frame?.parentElement;
        if (!frame || !box) return null;
        return {
            layoutWidth: frame.offsetWidth,
            paintedWidth: frame.getBoundingClientRect().width,
            boxWidth: box.getBoundingClientRect().width,
            transform: getComputedStyle(frame).transform,
        };
    }, sel);

const storedZoom = () =>
    page.evaluate((k) => {
        try {
            return JSON.parse(localStorage.getItem(k) ?? 'null');
        } catch {
            return 'unparsable';
        }
    }, ZOOM_KEY);

const near = (a, b, tol = 1.5) => Math.abs(a - b) <= tol;

// Where a real pointer exists the controls only appear over the widget (index.css,
// same rule as the fullscreen button) — so every click has to hover first, exactly
// as a mouse user does.
async function tap(index) {
    await page.hover(SEL);
    await ctl.locator('button').nth(index).click();
    await page.waitForTimeout(250);
}

// ── no zoom configured ───────────────────────────────────────────────────────
await show({});
let m = await measure(SEL);
check('unzoomed: the frame carries no transform', m?.transform === 'none', m?.transform);
check(
    'unzoomed: the frame is as wide as the widget',
    near(m.layoutWidth, m.boxWidth),
    `${m.layoutWidth}/${m.boxWidth}`,
);

// ── zoomed out ───────────────────────────────────────────────────────────────
await show({ iframeZoom: 50 });
m = await measure(SEL);
check(
    '50 %: the page lays out for twice the width',
    near(m.layoutWidth, m.boxWidth * 2, 3),
    `${m.layoutWidth} vs ${m.boxWidth * 2}`,
);
check('50 %: and still paints exactly the widget', near(m.paintedWidth, m.boxWidth), `${m.paintedWidth}/${m.boxWidth}`);

// ── zoomed in ────────────────────────────────────────────────────────────────
await show({ iframeZoom: 200 });
m = await measure(SEL);
check(
    '200 %: the page lays out for half the width',
    near(m.layoutWidth, m.boxWidth / 2, 3),
    `${m.layoutWidth} vs ${m.boxWidth / 2}`,
);
check(
    '200 %: and still paints exactly the widget',
    near(m.paintedWidth, m.boxWidth),
    `${m.paintedWidth}/${m.boxWidth}`,
);

// ── controls off ─────────────────────────────────────────────────────────────
check('without the option there are no controls', (await page.locator(`${SEL} .aura-zoom-ctl`).count()) === 0);

// ── controls on ──────────────────────────────────────────────────────────────
await page.evaluate((k) => localStorage.removeItem(k), ZOOM_KEY);
await show({ iframeZoom: 100, iframeZoomControls: true });
const ctl = page.locator(`${SEL} .aura-zoom-ctl`);
check('with the option the controls are there', (await ctl.count()) === 1);
check('they start on the configured level', (await ctl.locator('button').nth(1).innerText()) === '100%');

await tap(2); // +
check('one step up walks the ladder', (await ctl.locator('button').nth(1).innerText()) === '110%');
check('and is remembered for this device', JSON.stringify(await storedZoom()) === JSON.stringify({ [WID]: 110 }));
m = await measure(SEL);
check('the frame follows the button', near(m.paintedWidth, m.boxWidth), `${m.paintedWidth}/${m.boxWidth}`);

await tap(0); // −
await tap(0);
check('two steps down land below the start', (await ctl.locator('button').nth(1).innerText()) === '90%');

// ── the device level survives a re-mount and beats the config ────────────────
await show({ iframeZoom: 200, iframeZoomControls: true });
check('after a re-mount the device level wins', (await ctl.locator('button').nth(1).innerText()) === '90%');

// ── and is ignored again once the controls are switched off ──────────────────
await show({ iframeZoom: 200, iframeZoomControls: false });
m = await measure(SEL);
check(
    'with the controls off the configured level is back',
    near(m.layoutWidth, m.boxWidth / 2, 3),
    `${m.layoutWidth} vs ${m.boxWidth / 2}`,
);

// ── reset ────────────────────────────────────────────────────────────────────
await show({ iframeZoom: 150, iframeZoomControls: true });
check('the reset button shows the device level', (await ctl.locator('button').nth(1).innerText()) === '90%');
await tap(1);
check('tapping it falls back to the configured level', (await ctl.locator('button').nth(1).innerText()) === '150%');
check('and the device entry is gone', (await storedZoom()) === null);

await page.evaluate((k) => localStorage.removeItem(k), ZOOM_KEY);
await ctx.close();

// -- two-finger zoom ---------------------------------------------------------
// Only reachable where the blocker of `action` mode keeps the touches in the host
// document. Synthesised through CDP: Playwright's own gestures never produce the
// two simultaneous touch points a pinch is made of.
{
    const touchCtx = await browser.newContext({ viewport: { width: 1280, height: 900 }, hasTouch: true });
    const tpage = await touchCtx.newPage();
    await tpage.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
    await tpage.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });
    await tpage.evaluate((k) => localStorage.removeItem(k), ZOOM_KEY);
    await tpage.evaluate(
        ([w]) => window.__auraShot.showWidgets([w]),
        [widget({ iframeZoom: 100, iframeZoomControls: true, interactionMode: 'action' })],
    );
    await tpage.waitForTimeout(700);

    const box = await tpage.evaluate((sel) => {
        const r = document.querySelector(`${sel} iframe`)?.parentElement?.getBoundingClientRect();
        return r ? { cx: r.x + r.width / 2, cy: r.y + r.height / 2 } : null;
    }, SEL);
    check('the locked frame offers a box to pinch', !!box);

    const cdp = await touchCtx.newCDPSession(tpage);
    const pinch = (half) =>
        cdp.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [
                { x: box.cx - half, y: box.cy },
                { x: box.cx + half, y: box.cy },
            ],
        });
    await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [
            { x: box.cx - 25, y: box.cy },
            { x: box.cx + 25, y: box.cy },
        ],
    });
    for (const half of [35, 50, 60, 75]) await pinch(half);
    await tpage.waitForTimeout(150);
    const tctl = tpage.locator(`${SEL} .aura-zoom-ctl`);
    check(
        'spreading the fingers threefold zooms threefold',
        (await tctl.locator('button').nth(1).innerText()) === '300%',
    );
    check(
        'the level is not written yet, mid-gesture',
        (await tpage.evaluate((k) => localStorage.getItem(k), ZOOM_KEY)) === null,
    );

    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await tpage.waitForTimeout(200);
    check(
        'lifting the fingers remembers it for this device',
        (await tpage.evaluate((k) => localStorage.getItem(k), ZOOM_KEY)) === JSON.stringify({ [WID]: 300 }),
    );
    check('and the frame ends up there', (await tctl.locator('button').nth(1).innerText()) === '300%');

    await tpage.evaluate((k) => localStorage.removeItem(k), ZOOM_KEY);
    await touchCtx.close();
}

await browser.close();
server.close();

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
