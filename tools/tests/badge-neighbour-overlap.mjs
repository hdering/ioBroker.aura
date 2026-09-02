// A marker with a long label must not disappear under the widget next to it.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/badge-neighbour-overlap.mjs
//
// Two widgets side by side, the left one carrying a top-right label marker.
// Grid items are placed with a transform, so each is its own stacking context —
// a z-index inside the left widget can never lift the badge above the right
// widget. Two things therefore have to hold:
//   1. the badge hangs over the shared edge by a few px only (a constant derived
//      from its HEIGHT), not by 40 % of a long label's WIDTH,
//   2. what does hang over is painted, i.e. the topmost element at that point is
//      the badge, not the neighbour's card.
// The text also has to stay inside its own widget: clamped to the card width and
// ellipsised instead of running out the far side.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail && !ok ? ` - ${detail}` : ''}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });

const LONG = 'Pumpe laeuft seit 3 Stunden 42 Minuten im Nachtbetrieb';

/** Left widget with a marker, right widget next to it. Returns the geometry. */
async function measure(badge, { size, w = 6 } = {}) {
    await page.evaluate(
        ([b, sz, cols]) => {
            window.__auraShot.showWidgets([
                {
                    id: 'w-left',
                    type: 'value',
                    title: 'Links',
                    gridPos: { x: 0, y: 0, w: cols, h: 5 },
                    options: { badges: [{ id: 'b1', corner: 'top-right', size: sz, ...b }] },
                },
                { id: 'w-right', type: 'value', title: 'Rechts', gridPos: { x: cols, y: 0, w: 6, h: 5 } },
            ]);
        },
        [badge, size ?? 'md', w],
    );
    await page.waitForTimeout(350);
    return page.evaluate(() => {
        const badgeEl = document.querySelector('.aura-widget-w-left .aura-badge-corner > *');
        const left = document.querySelector('.aura-widget-w-left');
        const right = document.querySelector('.aura-widget-w-right');
        if (!badgeEl || !left || !right) return null;
        const b = badgeEl.getBoundingClientRect();
        const l = left.getBoundingClientRect();
        const r = right.getBoundingClientRect();
        const item = (el) => el.closest('.react-grid-item');
        // Hit testing follows paint order, so it answers "who is on top" — but
        // the overlay is pointer-transparent, so lift that for the probe only.
        const corner = badgeEl.parentElement;
        const pe = corner.style.pointerEvents;
        corner.style.pointerEvents = 'auto';
        const probe = document.elementFromPoint(Math.min(b.right - 1, window.innerWidth - 1), b.top + b.height / 2);
        corner.style.pointerEvents = pe;
        return {
            overhang: b.right - l.right,
            spillLeft: l.left - b.left,
            intoNeighbour: b.right - r.left,
            height: b.height,
            width: b.width,
            cardWidth: l.width,
            gap: r.left - l.right,
            text: badgeEl.innerText.replace(/\s+/g, ' ').trim(),
            // The text lives in its own element (that is what can ellipsise).
            clipped: [badgeEl, ...badgeEl.querySelectorAll('span')].some((el) => el.scrollWidth > el.clientWidth + 1),
            topmostIsBadge: !!probe && !!probe.closest('.aura-badge-corner'),
            topmost: probe ? probe.className || probe.tagName : 'none',
            zLeft: getComputedStyle(item(left)).zIndex,
            zRight: getComputedStyle(item(right)).zIndex,
        };
    });
}

// ── 1. A dot keeps the look it always had: ~40 % of its own size over the edge ─
const dot = await measure({ style: 'dot' });
check('dot: measured', !!dot, 'widgets or badge missing');
check(
    'dot hangs over the edge by ~40 % of its size',
    Math.abs(dot.overhang - 0.4 * dot.height) <= 1.5,
    `overhang ${dot.overhang?.toFixed(1)}, size ${dot.height}`,
);

// ── 2. The overhang is a constant, not 40 % of the label's width ──────────────
// The regression: a long label was pushed 40 % of its own WIDTH over the edge —
// dozens of px deep into the widget next to it.
const short = await measure({ style: 'label', label: 'OK' });
const long = await measure({ style: 'label', label: LONG });
check('long label: measured', !!long && !!short, 'widgets or badge missing');
check(
    'a long label hangs over exactly as far as a short one',
    Math.abs(long.overhang - short.overhang) <= 1 && long.width > short.width + 50,
    `short ${short.overhang?.toFixed(1)} px / long ${long.overhang?.toFixed(1)} px at width ${long.width?.toFixed(0)} px`,
);
check(
    'the overhang follows the badge height',
    Math.abs(long.overhang - 0.4 * long.height) <= 1.5,
    `overhang ${long.overhang?.toFixed(1)}, height ${long.height}`,
);
check(
    'a long label does not reach into the neighbouring widget',
    long.intoNeighbour < 0,
    `reaches ${long.intoNeighbour?.toFixed(1)} px past the neighbour's left edge (gap ${long.gap?.toFixed(1)})`,
);
check(
    'a long label does not spill out the far side of its own widget',
    long.spillLeft <= 1,
    `spills ${long.spillLeft?.toFixed(1)} px to the left`,
);
check('a short label is not clipped', !short.clipped && short.text === 'OK', `text ${JSON.stringify(short.text)}`);

// ── 3. Too long for the card: clamped to the card, ellipsised ─────────────────
const narrow = await measure({ style: 'label', label: LONG }, { w: 2 });
check(
    'a label wider than the card is clamped to it',
    narrow.width <= narrow.cardWidth + narrow.overhang + 1,
    `badge ${narrow.width?.toFixed(0)} px on a ${narrow.cardWidth?.toFixed(0)} px card`,
);
check('a clamped label is ellipsised', narrow.clipped, `badge ${narrow.width?.toFixed(0)} px, not clipped`);
check(
    'a clamped label does not spill out the far side either',
    narrow.spillLeft <= 1,
    `spills ${narrow.spillLeft?.toFixed(1)} px to the left`,
);

// ── 4. What still hangs over is painted ABOVE the neighbour ───────────────────
// Grid items carry a transform, so each is its own stacking context: without the
// z-index on the item that holds the badge, the next item paints over it.
check(
    'the widget carrying a badge is stacked above its neighbour',
    Number(long.zLeft) > (long.zRight === 'auto' ? 0 : Number(long.zRight)),
    `left z-index ${long.zLeft}, right ${long.zRight}`,
);
// A badge big enough to cross the grid gap proves it by hit test.
const huge = await measure({ style: 'label', label: 'X' }, { size: 44 });
check(
    'a badge big enough to overlap really does overlap',
    huge.intoNeighbour > 0,
    `${huge.intoNeighbour?.toFixed(1)} px past the neighbour's edge (gap ${huge.gap?.toFixed(1)})`,
);
check('the overlapping part is painted above the neighbour', huge.topmostIsBadge, `topmost element: ${huge.topmost}`);

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\nbadge-neighbour-overlap: ${results.length - failed.length}/${results.length} passed\n`);
process.exit(failed.length ? 1 : 0);
