// Verifies that the knob widget only reacts on the dial itself (issue #630).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/knob-touch.mjs
//
// The dial is a square viewBox letterboxed into the widget box, so on a wide or flat
// widget there is free space next to it. That space used to belong to the drag handler
// on the <svg> root: a finger set down there to carry on scrolling turned the knob, and
// `touch-action: none` on the whole box swallowed the scroll on top of it. Checked here:
// the hit target is a circle around the dial, the free area next to it neither takes hits
// nor blocks scrolling, and the angle → value mapping honours the letterbox (the old
// mapping divided by the element box, which skewed every non-square widget). Across the
// three layouts, plus the read-only case, which must not block scrolling anywhere.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    hasTouch: true,
    ignoreHTTPSErrors: true,
});
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });

const DP = 'demo.knob.value';

/** A deliberately wide knob so the square dial is letterboxed with free space beside it. */
const widget = (opts = {}, layout = 'default') => ({
    id: 'w-knob',
    type: 'knob',
    title: 'Drehregler',
    datapoint: DP,
    layout,
    gridPos: { x: 0, y: 0, w: 28, h: 12 },
    options: { minValue: 0, maxValue: 100, step: 1, unit: '%', showTitle: false, showIcon: false, ...opts },
});

async function show(cfg, val = 20) {
    await page.evaluate(
        ([w, v, dp]) => {
            window.__auraShot.mock({ [dp]: v });
            // mock() alone is overwritten by the getState round-trip on remount.
            window.__auraShot.mockServerState({ [dp]: v });
            window.__auraShot.showWidgets([w]);
        },
        [cfg, val, DP],
    );
    await page.waitForSelector('[data-aura-widget="w-knob"] svg', { timeout: 15000 });
    await page.waitForTimeout(300);
    await page.evaluate(() => window.__auraShot.writes(true));
}

/** Element box of the dial svg plus the letterboxed square the viewBox is painted into. */
const dialBox = () =>
    page.evaluate(() => {
        const svg = document.querySelector('[data-aura-widget="w-knob"] svg');
        if (!svg) return null;
        const r = svg.getBoundingClientRect();
        const side = Math.min(r.width, r.height);
        const vb = svg.getAttribute('viewBox').split(/\s+/).map(Number);
        return {
            left: r.left,
            top: r.top,
            width: r.width,
            height: r.height,
            side,
            offX: r.left + (r.width - side) / 2,
            offY: r.top + (r.height - side) / 2,
            vbMin: vb[0],
            vbSize: vb[2],
        };
    });

/** Screen coordinate of a viewBox point — the mapping the widget itself has to use. */
const toScreen = (box, px, py) => ({
    x: box.offX + ((px - box.vbMin) / box.vbSize) * box.side,
    y: box.offY + ((py - box.vbMin) / box.vbSize) * box.side,
});

/** What the browser hits at a screen point, and whether anything there blocks scrolling. */
const probe = ({ x, y }) =>
    page.evaluate(
        ([cx, cy]) => {
            const el = document.elementFromPoint(cx, cy);
            if (!el) return null;
            let blocks = false;
            for (let n = el; n; n = n.parentElement) {
                const ta = getComputedStyle(n).touchAction;
                if (ta === 'none' || ta === 'pan-x' || ta === 'pan-x pinch-zoom') blocks = true;
            }
            return {
                inSvg: !!el.closest('[data-aura-widget="w-knob"] svg'),
                isHit: el.hasAttribute?.('data-aura-knob-hit') ?? false,
                blocksScroll: blocks,
                tag: el.tagName,
            };
        },
        [x, y],
    );

const lastWrite = () => page.evaluate(() => window.__auraShot.lastWrite);
const writeCount = () => page.evaluate(() => window.__auraShot.writes().length);

/** Press, optionally move, release — the drag the dial expects. */
async function drag(points) {
    await page.mouse.move(points[0].x, points[0].y);
    await page.mouse.down();
    for (const p of points.slice(1)) await page.mouse.move(p.x, p.y, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(200);
}

// ── Bounded (default) layout ────────────────────────────────────────────────────
await show(widget());
let box = await dialBox();
check('the dial box is wider than tall', box && box.width > box.height + 40, box && `${box.width}×${box.height}`);

check(
    'the svg root takes no hits',
    await page.evaluate(
        () => getComputedStyle(document.querySelector('[data-aura-widget="w-knob"] svg')).pointerEvents === 'none',
    ),
    '',
);

const centre = toScreen(box, 100, 100);
let p = await probe(centre);
check('the dial centre hits the drag target', p?.isHit === true, JSON.stringify(p));
check('and it blocks the page scroller there', p?.blocksScroll === true, JSON.stringify(p));

// A point on the same row as the dial centre but well outside the square.
const outside = { x: box.left + 6, y: centre.y };
p = await probe(outside);
check('the area beside the dial is outside the svg', p?.inSvg === false, JSON.stringify(p));
check('and it lets the page scroll', p?.blocksScroll === false, JSON.stringify(p));

await drag([outside]);
check('a click beside the dial writes nothing', (await writeCount()) === 0, JSON.stringify(await lastWrite()));

// 135° → 405° puts 0 % at the lower left, 50 % straight up, 83.3 % at the right.
await drag([toScreen(box, 160, 100)]);
let w = await lastWrite();
check('a click on the right of the dial writes 83', w?.val === 83, JSON.stringify(w));

await page.evaluate(() => window.__auraShot.writes(true));
await drag([toScreen(box, 100, 40)]);
w = await lastWrite();
check('a click above the centre writes 50', w?.val === 50, JSON.stringify(w));

await page.evaluate(() => window.__auraShot.writes(true));
await drag([toScreen(box, 40, 100)]);
w = await lastWrite();
check('a click on the left writes 17', w?.val === 17, JSON.stringify(w));

// On the axes a skewed x maps to the same angle, so only a diagonal shows whether the
// letterbox is honoured: 45° up to the right is 66.7 % of the 135° → 405° sweep.
await page.evaluate(() => window.__auraShot.writes(true));
await drag([toScreen(box, 100 + 70.7, 100 - 70.7)]);
w = await lastWrite();
check('a click at 45° writes 67, not the skewed 58', w?.val === 67, JSON.stringify(w));

await page.evaluate(() => window.__auraShot.writes(true));
await drag([toScreen(box, 100, 40), toScreen(box, 160, 100)]);
check('a drag writes once, on release', (await writeCount()) === 1, `${await writeCount()}`);
w = await lastWrite();
check('and it writes where the drag ended', w?.val === 83, JSON.stringify(w));

// The ring and the background disc reach further out than the ticks, so they widen
// the target; without them the corners of the square stay free.
await show(widget({ showRing: false, showBackground: false }));
box = await dialBox();
const corner = toScreen(box, 100 + 71, 100 + 71); // ~100 px out, past the r=98 target
p = await probe(corner);
check('a corner of the square is not part of the target', p?.blocksScroll === false, JSON.stringify(p));

await show(widget({ showRing: true, showBackground: true }));
box = await dialBox();
const onRing = toScreen(box, 100, 100 - 108);
p = await probe(onRing);
check('the bezel belongs to the target', p?.isHit === true, JSON.stringify(p));

// ── Scale layout: the number labels sit at r=105 and must stay grabbable ────────
await show(widget({ showRing: false, showBackground: false }, 'knob-scale'));
box = await dialBox();
// The svg viewport clips at r=100 unless a bezel pads the viewBox, so the target
// reaches as far out as the layout can paint — the outer tick ring here.
p = await probe(toScreen(box, 100, 100 - 95));
check('the scale ticks belong to the target', p?.isHit === true, JSON.stringify(p));
p = await probe({ x: box.left + 6, y: toScreen(box, 100, 100).y });
check('the scale layout frees the area beside it', p?.inSvg === false && p?.blocksScroll === false, JSON.stringify(p));

// ── Endless layout: relative drag, so a bare click must not jump the value ──────
await show(widget({}, 'knob-endless'), 50);
box = await dialBox();
p = await probe({ x: box.left + 6, y: toScreen(box, 100, 100).y });
check(
    'the endless layout frees the area beside it',
    p?.inSvg === false && p?.blocksScroll === false,
    JSON.stringify(p),
);
await drag([{ x: box.left + 6, y: toScreen(box, 100, 100).y }]);
check('and a click there writes nothing', (await writeCount()) === 0, JSON.stringify(await lastWrite()));

await page.evaluate(() => window.__auraShot.writes(true));
// A quarter turn clockwise from straight up adds a quarter of the range.
await drag([toScreen(box, 100, 40), toScreen(box, 160, 100)]);
w = await lastWrite();
check('a quarter turn adds a quarter of the range', w?.val === 75, JSON.stringify(w));

// ── Read-only: nothing anywhere may block the scroller ─────────────────────────
await show(widget({ readOnly: true }));
box = await dialBox();
check(
    'a read-only dial has no drag target',
    await page.evaluate(() => !document.querySelector('[data-aura-widget="w-knob"] [data-aura-knob-hit]')),
    '',
);
p = await probe(toScreen(box, 100, 100));
check('and it lets the page scroll on the dial too', p?.blocksScroll === false, JSON.stringify(p));
await drag([toScreen(box, 160, 100)]);
check('and a click writes nothing', (await writeCount()) === 0, JSON.stringify(await lastWrite()));

// ── The reported gesture: a real touch swipe, not a synthetic pointer event ─────
// `touch-action` is what actually decides this, and it has to work on an SVG child —
// so drive the browser's own gesture pipeline instead of trusting the computed value.
const cdp = await ctx.newCDPSession(page);
await show(widget(), 40);
// A second, tall widget below so there is something to scroll in the first place.
await page.evaluate(
    ([dp]) => {
        window.__auraShot.showWidgets([
            {
                id: 'w-knob',
                type: 'knob',
                title: 'Drehregler',
                datapoint: dp,
                layout: 'default',
                gridPos: { x: 0, y: 0, w: 28, h: 12 },
                options: { minValue: 0, maxValue: 100, step: 1, unit: '%', showTitle: false, showIcon: false },
            },
            {
                id: 'w-tall',
                type: 'value',
                title: 'Füller',
                datapoint: dp,
                layout: 'default',
                gridPos: { x: 0, y: 13, w: 28, h: 70 },
                options: {},
            },
        ]);
    },
    [DP],
);
await page.waitForSelector('[data-aura-widget="w-tall"]', { timeout: 15000 });
await page.waitForTimeout(300);

/** The scroll container the dashboard actually uses. */
const scroller = () =>
    page.evaluate(() => {
        const all = [document.scrollingElement, ...document.querySelectorAll('div')];
        const el = all.find((n) => n && n.scrollHeight > n.clientHeight + 100 && n.clientHeight > 300);
        return el ? { top: el.scrollTop, range: el.scrollHeight - el.clientHeight } : null;
    });
const scrollTo0 = () =>
    page.evaluate(() => {
        const all = [document.scrollingElement, ...document.querySelectorAll('div')];
        const el = all.find((n) => n && n.scrollHeight > n.clientHeight + 100 && n.clientHeight > 300);
        if (el) el.scrollTop = 0;
    });

// A finger swiping up by `dist` px from (x, y), as single touch events —
// `Input.synthesizeScrollGesture` never moved this scroller, raw events do.
const swipe = async (x0, y0, dist = 240) => {
    const [x, y] = [Math.round(x0), Math.round(y0)];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    for (let i = 1; i <= 10; i++) {
        await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [{ x, y: Math.round(y - (dist * i) / 10), id: 1 }],
        });
        await page.waitForTimeout(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(500);
};

check('the page is scrollable at all', ((await scroller())?.range ?? 0) > 100, JSON.stringify(await scroller()));

box = await dialBox();
await scrollTo0();
await page.evaluate(() => window.__auraShot.writes(true));
await swipe(box.left + 6, toScreen(box, 100, 100).y);
let sc = await scroller();
check('a swipe beside the dial scrolls the page', (sc?.top ?? 0) > 40, JSON.stringify(sc));
check('and leaves the value alone', (await writeCount()) === 0, JSON.stringify(await lastWrite()));

await scrollTo0();
await page.evaluate(() => window.__auraShot.writes(true));
box = await dialBox();
await swipe(toScreen(box, 100, 100).x, toScreen(box, 100, 100).y);
sc = await scroller();
check('a swipe on the dial does not scroll', (sc?.top ?? 0) === 0, JSON.stringify(sc));
check('and turns the knob instead', (await writeCount()) === 1, `${await writeCount()}`);

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
