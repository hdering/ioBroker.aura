// Header items on EXPANDED widgets (issue #676), across every widget type and layout.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/header-items-sweep.mjs
//
// Expanded, a widget places the items into its own title row (HeaderSlotsInline /
// HeaderSlotsRow2); a row it does not draw falls back to a strip the frame puts above
// the body. Either way every item has to show up exactly once and inside the card —
// a widget wired twice would show it twice, one wired into a hidden branch not at all.
// Checked per type × layout; the report lists which ones use the fallback strip.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5173';
const schema = JSON.parse(readFileSync('public/ai/aura-widget-schema.json', 'utf8'));
// Types with no header of their own in the grid: the section title IS a header, the
// group draws its own bar, the mirror renders its source, the menu is navigation.
const SKIP = new Set(['header', 'group', 'mirror', 'menu', 'panels']);

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    if (!ok) console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
await page.waitForTimeout(700);

const ITEMS = [
    { id: 'r1', source: 'text', text: 'HI-R1', slot: 'r1-right' },
    { id: 'r2', source: 'text', text: 'HI-R2', slot: 'r2-left' },
];

const strip = [];
const above = [];
const inline = [];
let seq = 0;
for (const [type, meta] of Object.entries(schema.widgets)) {
    if (SKIP.has(type)) continue;
    for (const layout of meta.layouts?.length ? meta.layouts : ['default']) {
        const id = `sw-${++seq}`;
        await page.evaluate(
            ([w]) => window.__auraShot.showWidgets([w]),
            [
                {
                    id,
                    type,
                    title: 'Probe',
                    datapoint: '',
                    layout,
                    gridPos: { x: 0, y: 0, w: 16, h: 12 },
                    options: { headerItems: ITEMS },
                },
            ],
        );
        // Heavy types (recharts, leaflet) load their chunk on first use — on a cold dev
        // server that takes longer than a render. Wait for the item, not a fixed time.
        await page
            .waitForSelector(`[data-aura-widget="${id}"] [data-header-item="r1"]`, { timeout: 3000 })
            .catch(() => undefined);
        await page.waitForTimeout(150);
        const res = await page.evaluate((wid) => {
            const card = document.querySelector(`[data-aura-widget="${wid}"]`);
            if (!card) return null;
            const cb = card.getBoundingClientRect();
            const find = (itemId) =>
                [...card.querySelectorAll(`[data-header-item="${itemId}"]`)].map((el) => {
                    const r = el.getBoundingClientRect();
                    return {
                        top: r.top,
                        bottom: r.bottom,
                        inStrip: !!el.closest('[data-header-strip]'),
                        above: el.closest('[data-header-strip]')?.getAttribute('data-header-strip') === 'above',
                        inside: r.width > 0 && r.left >= cb.left - 1 && r.right <= cb.right + 1 && r.top >= cb.top - 1,
                        visible: r.width > 0 && r.height > 0,
                    };
                });
            const t = [...card.querySelectorAll('.aura-widget-title')]
                .map((el) => el.getBoundingClientRect())
                .find((r) => r.width > 0 && r.height > 0);
            return { r1: find('r1'), r2: find('r2'), title: t ? { top: t.top, bottom: t.bottom } : null };
        }, id);
        const label = `${type}/${layout}`;
        if (!res) {
            check(`${label}: card rendered`, false);
            continue;
        }
        for (const key of ['r1', 'r2']) {
            const hits = res[key].filter((h) => h.visible);
            check(`${label}: ${key} shown exactly once`, hits.length === 1, `${hits.length}×`);
            if (hits.length === 1) check(`${label}: ${key} inside the card`, hits[0].inside);
        }
        // Row 2 is a row of its own: it has to sit below row 1, never beside it (a row-2
        // component dropped into a horizontal flex parent would line up next to the title).
        const r1 = res.r1.find((h) => h.visible);
        const r2 = res.r2.find((h) => h.visible);
        if (r1 && r2) {
            check(`${label}: row 2 below row 1`, r2.top >= r1.bottom - 1, `${r2.top} vs ${r1.bottom}`);
            // …and right below it, not pushed apart by a parent that spreads its children
            // (HeaderGroup). Exempt: the frame's row 2 under the body.
            if (!r2.inStrip) {
                check(
                    `${label}: row 2 right below row 1`,
                    r2.top - r1.bottom < 24,
                    `${Math.round(r2.top - r1.bottom)} px gap`,
                );
            }
        }

        // Row 1 in the frame's fallback lies over the body's first line: it has to line
        // up with the widget's title, not sit on a line of its own above it.
        if (r1 && r1.inStrip && res.title) {
            if (r1.above) {
                // A title inside a filled tile: the row sits above the body, clear of it.
                check(
                    `${label}: row 1 above the tiled title`,
                    r1.bottom <= res.title.top + 2,
                    `${Math.round(r1.bottom)} vs ${Math.round(res.title.top)}`,
                );
            } else {
                const mid = (r1.top + r1.bottom) / 2;
                check(
                    `${label}: row 1 in line with the title`,
                    mid >= res.title.top - 4 && mid <= res.title.bottom + 4,
                    `item ${Math.round(r1.top)}–${Math.round(r1.bottom)}, title ${Math.round(res.title.top)}–${Math.round(res.title.bottom)}`,
                );
            }
        }
        if (r1 && r1.above) above.push(label);
        const usesStrip = [...res.r1, ...res.r2].some((h) => h.inStrip);
        (usesStrip ? strip : inline).push(label);
    }
}

check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
await browser.close();

console.log(`\ninline (${inline.length}): ${inline.join(', ')}`);
console.log(`\nfallback strip (${strip.length}): ${strip.join(', ')}`);
console.log(`\nrow 1 above a tiled title (${above.length}): ${above.join(', ')}`);
const failed = results.filter((r) => !r.ok);
console.log(`\nheader-items-sweep: ${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
