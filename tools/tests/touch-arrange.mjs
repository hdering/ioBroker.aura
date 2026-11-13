// Arranging widgets on a touch device (#699).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/touch-arrange.mjs            (AURA_BROWSER=webkit for Safari's engine)
//
// On touch the editor grid is locked unless the arrange mode is on — a tap meant
// for a widget's menu used to register as a drag and the compaction then persisted
// new positions for every widget. Inside the arrange mode a tap selects a widget,
// only its grip drags and only its corner resizes; a swipe anywhere else scrolls.
// Driven with real touch events (CDP), not synthetic pointer events, because
// `touch-action` and react-draggable's touch listeners decide the outcome.
import { chromium, webkit } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5173';
const engine = process.env.AURA_BROWSER === 'webkit' ? webkit : chromium;

let failed = 0;
const check = (ok, name, detail = '') => {
    if (!ok) failed++;
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const browser = await engine.launch();
// isMobile makes the primary pointer coarse — the condition the editor keys on.
const ctx = await browser.newContext({ viewport: { width: 1100, height: 700 }, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
const settle = (ms = 400) => page.waitForTimeout(ms);

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 60000 });
check(await page.evaluate(() => matchMedia('(pointer: coarse)').matches), 'the context reports a coarse pointer');

const DEF = 'touch-group-def';
const widgets = [
    { id: 'w-a', type: 'value', title: 'A', datapoint: '0_userdata.0.x', gridPos: { x: 0, y: 0, w: 4, h: 3 } },
    { id: 'w-b', type: 'value', title: 'B', datapoint: '0_userdata.0.x', gridPos: { x: 8, y: 0, w: 4, h: 3 } },
    {
        id: 'w-g',
        type: 'group',
        title: 'Gruppe',
        gridPos: { x: 0, y: 6, w: 12, h: 8 },
        options: { defId: DEF },
    },
    // Tall filler so the page can scroll at all.
    {
        id: 'w-tall',
        type: 'value',
        title: 'Füller',
        datapoint: '0_userdata.0.x',
        gridPos: { x: 0, y: 16, w: 4, h: 60 },
    },
];
const kids = [
    { id: 'k-1', type: 'value', title: 'K1', datapoint: '0_userdata.0.x', gridPos: { x: 0, y: 0, w: 3, h: 3 } },
    { id: 'k-2', type: 'value', title: 'K2', datapoint: '0_userdata.0.x', gridPos: { x: 6, y: 0, w: 3, h: 3 } },
];
await page.evaluate(
    ([w, d, k]) => {
        window.__auraShot.groupDefs({ [d]: k });
        window.__auraShot.showWidgets(w);
        window.__auraShot.setEditMode(true);
    },
    [widgets, DEF, kids],
);
await page.waitForSelector('[data-aura-widget="w-tall"]', { timeout: 15000 });
await page.waitForSelector('.aura-widget-k-1', { timeout: 15000 });
await settle(800);

const cdp = await ctx.newCDPSession(page).catch(() => null);
const pos = (id) => page.evaluate((i) => window.__auraShot.widgetGridPos(i), id);
const kidPos = (id) =>
    page.evaluate(
        ([d, i]) => window.__auraShot.groupDefChildren(d)?.find((c) => c.id === i)?.gridPos ?? null,
        [DEF, id],
    );
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const box = (sel) =>
    page.evaluate((s) => {
        const el = document.querySelector(s);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        if (!r.width) return null;
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, top: r.top, w: r.width, h: r.height };
    }, sel);
const itemOf = (id) => `.react-grid-item:has(> .aura-widget-${id}), .react-grid-item:has(> * > .aura-widget-${id})`;
const scroller = () =>
    page.evaluate(() => {
        const el = [...document.querySelectorAll('.aura-scroll')].find((n) => n.scrollHeight > n.clientHeight + 100);
        return el ? el.scrollTop : null;
    });
const scrollTo0 = () =>
    page.evaluate(() => document.querySelectorAll('.aura-scroll').forEach((n) => (n.scrollTop = 0)));

/** A finger from (x0, y0) by (dx, dy) as raw touch events. */
async function touchDrag(x0, y0, dx, dy, steps = 12) {
    const [x, y] = [Math.round(x0), Math.round(y0)];
    if (!cdp) {
        // WebKit has no CDP: Playwright's touchscreen only taps, so drags are skipped there.
        await page.touchscreen.tap(x, y);
        return;
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    for (let i = 1; i <= steps; i++) {
        await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [{ x: Math.round(x + (dx * i) / steps), y: Math.round(y + (dy * i) / steps), id: 1 }],
        });
        await page.waitForTimeout(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await settle(500);
}
const tap = async (x, y) => {
    await page.touchscreen.tap(Math.round(x), Math.round(y));
    await settle(250);
};

const a0 = await pos('w-a');
const b0 = await pos('w-b');

// ── 1. Locked without the arrange mode ─────────────────────────────────────────
check(
    (await page.locator('.react-grid-item.react-draggable').count()) === 0,
    'without arrange mode no grid item is draggable on touch',
);
let ba = await box('.aura-widget-w-a');
if (cdp) {
    await touchDrag(ba.x, ba.y, 300, 0);
    check(
        same(await pos('w-a'), a0),
        'a touch drag without arrange mode moves nothing',
        JSON.stringify(await pos('w-a')),
    );
}

// ── 2. Arrange mode: tap selects, grip + corner only on the selected widget ─────
await page.evaluate(() => window.__auraShot.setTouchArrange(true));
await settle(400);
check(
    await page.evaluate(() => document.documentElement.classList.contains('aura-touch-arrange')),
    'arrange mode sets the root class',
);
check((await box('.aura-drag-handle')) === null, 'no grip is shown before a widget is selected');
ba = await box('.aura-widget-w-a');
await tap(ba.x, ba.y - ba.h / 4);
check(
    await page.evaluate(() => !!document.querySelector('.aura-widget-w-a[data-aura-selected]')),
    'a tap selects the widget',
);
const grip = await box('.aura-widget-w-a > .aura-drag-handle');
check(!!grip && grip.w >= 40, 'the selected widget shows a finger-sized grip', JSON.stringify(grip));
const handles = await page.evaluate(
    () =>
        [...document.querySelectorAll('.react-resizable-handle')].filter((h) => getComputedStyle(h).display !== 'none')
            .length,
);
check(handles === 1, 'exactly one resize corner is visible', `${handles}`);
check(
    await page.evaluate(
        () => getComputedStyle(document.querySelector('.aura-drag-handle:not([style*=none])')).touchAction === 'none',
    ),
    'the grip refuses touch panning',
);

if (cdp) {
    // ── 3. A swipe on the widget body scrolls and moves nothing ──────────────────
    await scrollTo0();
    ba = await box('.aura-widget-w-b');
    await touchDrag(ba.x, ba.y + ba.h / 4, 0, -200);
    check(((await scroller()) ?? 0) > 40, 'a swipe on a widget body scrolls the page', `${await scroller()}`);
    check(same(await pos('w-b'), b0), 'and does not move the widget', JSON.stringify(await pos('w-b')));
    await scrollTo0();
    await settle();

    // ── 4. A wobble on the grip is a tap, not a move ─────────────────────────────
    ba = await box('.aura-widget-w-a');
    await tap(ba.x, ba.y - ba.h / 4);
    let g = await box('.aura-widget-w-a > .aura-drag-handle');
    await touchDrag(g.x, g.y, 4, 2, 3);
    check(same(await pos('w-a'), a0), 'a 4 px wobble on the grip persists nothing', JSON.stringify(await pos('w-a')));

    // ── 5. Dragging the grip moves exactly that widget ───────────────────────────
    g = await box('.aura-widget-w-a > .aura-drag-handle');
    // Short of B (x 8): a move onto it would push B aside, which is correct, but not this check.
    await touchDrag(g.x, g.y, 90, 0);
    const a1 = await pos('w-a');
    check(!!a1 && a1.x > a0.x, 'dragging the grip moves the widget', JSON.stringify(a1));
    check(same(await pos('w-b'), b0), 'the other widget stays where it was', JSON.stringify(await pos('w-b')));

    // ── 6. The corner resizes ─────────────────────────────────────────────────────
    const corner = await page.evaluate(() => {
        const h = [...document.querySelectorAll('.react-resizable-handle')].find(
            (n) => getComputedStyle(n).display !== 'none',
        );
        const r = h?.getBoundingClientRect();
        return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
    });
    await touchDrag(corner.x, corner.y, 30, 0);
    const a2 = await pos('w-a');
    check(!!a2 && a2.w > a1.w, 'dragging the corner widens the widget', JSON.stringify(a2));

    // ── 7. Inside a group: the child's grip moves the child, not the group ────────
    const g0 = await pos('w-g');
    const k10 = await kidPos('k-1');
    const kb = await box('.aura-widget-k-1');
    await tap(kb.x, kb.y - kb.h / 4);
    check(
        await page.evaluate(() => !!document.querySelector('.aura-widget-k-1[data-aura-selected]')),
        'a tap on a group child selects the child',
    );
    const kg = await box('.aura-widget-k-1 > .aura-drag-handle');
    // Sideways: the group compacts vertically in the editor, a move down snaps back.
    await touchDrag(kg.x, kg.y, 60, 0);
    const k11 = await kidPos('k-1');
    check(!!k11 && !same(k11, k10), 'the child grip moves the child', JSON.stringify(k11));
    check(same(await pos('w-g'), g0), 'the group itself stays put', JSON.stringify(await pos('w-g')));
}

// ── 8. Leaving the arrange mode locks again ──────────────────────────────────────
await page.evaluate(() => window.__auraShot.setTouchArrange(false));
await settle(400);
check(
    (await page.locator('.react-grid-item.react-draggable').count()) === 0 &&
        !(await page.evaluate(() => document.querySelector('[data-aura-selected]'))),
    'off again: grid locked, selection cleared',
);

check(pageErrors.length === 0, 'no page errors', pageErrors.join(' | '));
await browser.close();
if (failed) {
    console.log(`\n${failed} check(s) failed`);
    process.exit(1);
}
console.log('\nall checks passed');
