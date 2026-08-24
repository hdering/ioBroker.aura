// Verifies the header of both list widgets (static + dynamic): the title alignment
// option really moves the text, and the filter chip can be switched off.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/list-title-align.mjs
//
// Uses the screenshot harness (__auraShot) so datapoint values live in the in-memory
// cache only - no socket write, no real datapoint is touched.
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

const VALUES = { 'demo.l1': true, 'demo.l2': false };
const ENTRIES = [
    { id: 'demo.l1', label: 'Lampe1' },
    { id: 'demo.l2', label: 'Lampe2' },
];

// A fresh widget id per call: filter mode and search term are local widget state.
let seq = 0;

async function show(type, options) {
    const widget = {
        id: `w-ttl-${++seq}`,
        type,
        title: 'Pool',
        datapoint: '',
        layout: 'default',
        gridPos: { x: 0, y: 0, w: 12, h: 6 },
        options: { entries: ENTRIES, ...options },
    };
    await page.evaluate(
        ([w, vals]) => {
            window.__auraShot.mock(vals);
            window.__auraShot.mockServerState(vals);
            window.__auraShot.showWidgets([w]);
        },
        [widget, VALUES],
    );
    await page.waitForTimeout(400);
}

/**
 * Where the title TEXT sits inside the widget - not where its box sits. A Range over
 * the paragraph's contents measures the glyphs, which is exactly what text-align moves.
 */
const titleGeom = () =>
    page.evaluate(() => {
        const card = document.querySelector('.react-grid-item');
        const p = card?.querySelector('.aura-widget-title');
        if (!card || !p) return null;
        const range = document.createRange();
        range.selectNodeContents(p);
        const t = range.getBoundingClientRect();
        const c = card.getBoundingClientRect();
        return {
            text: p.innerText.trim(),
            left: Math.round(t.left - c.left),
            right: Math.round(c.right - t.right),
            centerOff: Math.round(t.left + t.width / 2 - (c.left + c.width / 2)),
            width: Math.round(c.width),
        };
    });

for (const type of ['list', 'autolist']) {
    const kind = type === 'list' ? 'static' : 'dynamic';
    const geo = {};
    for (const align of ['left', 'center', 'right']) {
        await show(type, { titleAlign: align });
        geo[align] = await titleGeom();
        check(`${kind}: title rendered (${align})`, geo[align]?.text?.startsWith('Pool'), JSON.stringify(geo[align]));
    }
    if (geo.left && geo.center && geo.right) {
        // The header icon sits in front of the title, so "at the left edge" means the
        // left end of the space the title owns - not the widget's own edge.
        check(`${kind}: left keeps the title at the left edge`, geo.left.left < 50, `left inset ${geo.left.left}px`);
        // The header reserves the right end for the filter chip, so "centred" means
        // centred in the space the title actually owns - a chip-width tolerance.
        check(
            `${kind}: centre puts the title in the middle`,
            Math.abs(geo.center.centerOff) < 40 && geo.center.left > geo.left.left + 100,
            `offset ${geo.center.centerOff}px, inset ${geo.center.left}px`,
        );
        check(
            `${kind}: right pushes the title to the right edge`,
            geo.right.left > geo.center.left + 100 && geo.right.right < 80,
            `inset ${geo.right.left}px, right gap ${geo.right.right}px`,
        );
    }

    // ── Filter chip visibility ────────────────────────────────────────────────
    await show(type, {});
    check(`${kind}: filter chip shown by default`, (await page.locator('button[title="Filter"]').count()) === 1);
    await show(type, { hideFilterButton: true });
    check(`${kind}: hideFilterButton removes the chip`, (await page.locator('button[title="Filter"]').count()) === 0);
    // With no chip there is no way to reach the search - a stale term must not filter.
    check(
        `${kind}: rows still visible without the chip`,
        (await page.locator('.react-grid-item').innerText()).includes('Lampe2'),
    );
}

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) process.exit(1);
