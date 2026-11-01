// Verifies the row spacing of the static and dynamic list (#890).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/list-row-density.mjs
//
// The vertical padding of a list row used to be fixed px: shrinking the text left
// two thirds of every row as air. `rowDensity` sets it on its own. Checked here:
// compact < normal < comfortable in the default and the two-column layout, for
// both list types, and "normal" is exactly the row the list drew before (so an
// existing dashboard does not move by a pixel).
//
// Datapoint values are injected through the screenshot harness (__auraShot.mock)
// — no socket write, no real datapoint is touched.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const DENSITIES = [undefined, 'compact', 'comfortable'];
const ENTRIES = Array.from({ length: 4 }, (_, i) => ({ id: `demo.dens${i + 1}.STATE`, label: `Zeile ${i + 1}` }));
// Rows of the default layout before #890: py-2 around a text-xs line (16 px) + 1 px divider.
const LEGACY_DEFAULT_ROW = 33;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1200 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

const values = Object.fromEntries(ENTRIES.map((e) => [e.id, 21.5]));
await page.evaluate((m) => {
    window.__auraShot.mock(m);
    window.__auraShot.mockServerState(m);
}, values);

/** Height of the row that holds "Zeile 1": the flex-col row element around the label. */
const rowHeight = (id) =>
    page.evaluate((wid) => {
        const root = document.querySelector(`.aura-widget-${wid}`);
        if (!root) return null;
        // A div in the default layout, a span in the two-column one.
        const label = [...root.querySelectorAll('div, span')].find(
            (d) => d.textContent === 'Zeile 1' && !d.children.length,
        );
        const row = label?.closest('.flex-col');
        return row ? Math.round(row.getBoundingClientRect().height * 10) / 10 : null;
    }, id);

for (const type of ['list', 'autolist']) {
    for (const layout of ['default', 'compact']) {
        const widgets = DENSITIES.map((d, i) => ({
            id: `dens-${type}-${layout}-${d ?? 'normal'}`,
            type,
            layout: layout === 'default' ? undefined : layout,
            title: `${layout} ${d ?? 'normal'}`,
            datapoint: '',
            gridPos: { x: i * 8, y: 0, w: 8, h: 8 },
            options: { entries: ENTRIES, syncIntervalMin: 999, hideFilterButton: true, rowDensity: d },
        }));
        await page.evaluate((ws) => window.__auraShot.showWidgets(ws), widgets);
        await page.waitForTimeout(800);
        const [normal, compact, comfortable] = await Promise.all(widgets.map((w) => rowHeight(w.id)));
        const tag = `${type}/${layout}`;
        check(
            `${tag}: compact < normal < comfortable`,
            normal != null && compact < normal && normal < comfortable,
            `${compact} / ${normal} / ${comfortable} px`,
        );
        // Both steps are the same 8 px of padding, one either way.
        check(`${tag}: one step = 8 px`, normal - compact === 8 && comfortable - normal === 8);
        if (layout === 'default') check(`${tag}: normal unchanged`, normal === LEGACY_DEFAULT_ROW, `${normal} px`);
    }
}

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
