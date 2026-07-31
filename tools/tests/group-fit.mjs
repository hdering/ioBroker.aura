// ─────────────────────────────────────────────────────────────────────────────
// Group fit test bench
// ─────────────────────────────────────────────────────────────────────────────
// Drives the real app (dev server + __auraShot harness) through a matrix of grid
// settings × group variants × child layouts and measures, in BOTH the editor and
// the frontend:
//
//   barPx       width the browser took away for a scrollbar (offsetWidth −
//               clientWidth). MUST be 0 — this is the symptom the user sees.
//   contentPx   scrollHeight − clientHeight. Informational: a child whose own
//               content needs more room than its cell spills and is clipped (in
//               both views), which is a per-widget/grid-size matter, not a fit bug.
//   gridOverPx  the RGL grid box vs. that container — this is the height math
//               itself and MUST be <= 0.
//   gapTopPx / gapBottomPx  inset between the group's grid area and the first /
//               last child. Both should equal GROUP_GAP (4px) — a much larger
//               bottom gap is the row-snapping slack showing up.
//
// Everything runs against injected demo state with screenshotMode on, so no
// ioBroker object or state is ever written.
//
// Usage:  node tools/tests/group-fit.mjs            (expects dev server on 5174)
//         AURA_BASE=http://localhost:5174 node tools/tests/group-fit.mjs
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const GID = 'grp';
const DEF = 'def-grp';
const TOL = 1; // px — sub-pixel layout noise

// ── matrix ───────────────────────────────────────────────────────────────────
const GRIDS = [
    { name: 'row20/snap20/gap10 (default)', gridRowHeight: 20, gridSnapX: 20, gridGap: 10 },
    { name: 'row10/snap10/gap10', gridRowHeight: 10, gridSnapX: 10, gridGap: 10 },
    { name: 'row10/snap20/gap10', gridRowHeight: 10, gridSnapX: 20, gridGap: 10 },
    { name: 'row40/snap40/gap10', gridRowHeight: 40, gridSnapX: 40, gridGap: 10 },
    { name: 'row20/snap20/gap4', gridRowHeight: 20, gridSnapX: 20, gridGap: 4 },
    { name: 'row15/snap15/gap0', gridRowHeight: 15, gridSnapX: 15, gridGap: 0 },
    { name: 'row60/snap60/gap20', gridRowHeight: 60, gridSnapX: 60, gridGap: 20 },
];

const VARIANTS = [
    { name: 'title+icon', title: 'Gruppe', options: {} },
    { name: 'icon only', title: '', options: {} },
    { name: 'title, no icon', title: 'Gruppe', options: { showIcon: false } },
    { name: 'headerless', title: '', options: { showIcon: false } },
    { name: 'master switch', title: 'Gruppe', options: { groupSwitch: true } },
    { name: 'headerless + master', title: '', options: { showIcon: false, groupSwitch: true } },
    { name: 'collapsible', title: 'Gruppe', options: { defaultCollapsed: false } },
    { name: 'transparent', title: 'Gruppe', options: { transparent: true } },
    { name: 'big icon (32)', title: 'Gruppe', options: { iconSize: 32 } },
];

const CHILDSETS = [
    { name: '1 child 8x4', children: [{ w: 8, h: 4 }] },
    { name: '1 child 8x1 (tiny)', children: [{ w: 8, h: 1 }] },
    { name: '2 stacked 8x4', children: [{ w: 8, h: 4 }, { w: 8, h: 4, y: 4 }] },
    { name: '2 side by side', children: [{ w: 8, h: 4 }, { w: 8, h: 4, x: 8 }] },
    { name: '3 mixed heights', children: [{ w: 8, h: 4 }, { w: 8, h: 6, x: 8 }, { w: 8, h: 3, y: 6 }] },
    { name: '1 child 8x12 (tall)', children: [{ w: 8, h: 12 }] },
];

function childCfg(c, i) {
    return {
        id: `${DEF}-c${i}`,
        type: 'switch',
        title: `Kind ${i + 1}`,
        datapoint: 'demo.switch',
        layout: 'default',
        options: { icon: 'Zap' },
        gridPos: { x: c.x ?? 0, y: c.y ?? 0, w: c.w, h: c.h },
    };
}

function groupCfg(variant, rows) {
    return {
        id: GID,
        type: 'group',
        title: variant.title,
        datapoint: '',
        layout: 'default',
        options: { icon: 'Layers2', defId: DEF, ...variant.options },
        // Deliberately "wrong": the hug math must derive the real height from the
        // children, not trust this.
        gridPos: { x: 0, y: 0, w: 24, h: rows },
    };
}

// ── measurement (runs in the page) ───────────────────────────────────────────
const MEASURE = (gid) => {
    const root = document.querySelector(`.aura-widget-${gid}`);
    if (!root) return { error: 'group not rendered' };
    const grid = root.querySelector('.react-grid-layout');
    if (!grid) return { error: 'no inner grid' };
    const box = grid.parentElement; // the scroll container
    const items = [...grid.querySelectorAll(':scope > .react-grid-item')];
    if (!items.length) return { error: 'no children rendered' };
    const bb = box.getBoundingClientRect();
    const gb = grid.getBoundingClientRect();
    const tops = items.map((el) => el.getBoundingClientRect().top);
    const bottoms = items.map((el) => el.getBoundingClientRect().bottom);
    return {
        barPx: Math.round(box.offsetWidth - box.clientWidth),
        contentPx: Math.round(box.scrollHeight - box.clientHeight),
        gridOverPx: Math.round(gb.height - bb.height),
        gapTopPx: Math.round(Math.min(...tops) - bb.top),
        gapBottomPx: Math.round(bb.bottom - Math.max(...bottoms)),
        outerPx: Math.round(root.getBoundingClientRect().height),
    };
};

// ── run ──────────────────────────────────────────────────────────────────────
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1200 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

// domcontentloaded, not networkidle: the ioBroker socket keeps the connection
// busy (and retries when the instance behind the dev proxy is unreachable), which
// networkidle would wait out.
await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });
await page.evaluate(() =>
    localStorage.setItem('aura-auth', JSON.stringify({ state: { sessionActive: true }, version: 0 })),
);

const rows = [];
let checked = 0;

for (const grid of GRIDS) {
    for (const variant of VARIANTS) {
        for (const set of CHILDSETS) {
            for (const editMode of [true, false]) {
                const children = set.children.map(childCfg);
                const cfg = groupCfg(variant, 6);
                await page.evaluate(
                    ({ cfg, children, def, grid, editMode }) => {
                        window.__auraShot.mock({ 'demo.switch': true });
                        window.__auraShot.groupDefs({ [def]: children });
                        window.__auraShot.showWidgets([cfg], {
                            editMode,
                            gridRowHeight: grid.gridRowHeight,
                            gridSnapX: grid.gridSnapX,
                            gridGap: grid.gridGap,
                        });
                    },
                    { cfg, children, def: DEF, grid, editMode },
                );
                // The hug settles over a frame or two (header ResizeObserver →
                // store → outer rows → fill pitch), so poll until two identical
                // readings instead of guessing a timeout.
                let m = null;
                let prev = '';
                for (let i = 0; i < 15; i++) {
                    await page.waitForTimeout(120);
                    m = await page.evaluate(MEASURE, GID);
                    const key = JSON.stringify(m);
                    if (key === prev) break;
                    prev = key;
                }
                checked++;
                rows.push({
                    grid: grid.name,
                    variant: variant.name,
                    children: set.name,
                    view: editMode ? 'editor' : 'frontend',
                    ...m,
                });
            }
        }
    }
}

// ── empty group: keeps its stored height, in both views ──────────────────────
// An empty group derives nothing from children, so its box must be exactly the
// stored row count (it used to clamp to a single row in the editor).
const EMPTY_H = 7;
const emptyFails = [];
for (const grid of GRIDS) {
    for (const editMode of [true, false]) {
        await page.evaluate(
            ({ cfg, def, grid, editMode }) => {
                window.__auraShot.groupDefs({ [def]: [] });
                window.__auraShot.showWidgets([cfg], {
                    editMode,
                    gridRowHeight: grid.gridRowHeight,
                    gridSnapX: grid.gridSnapX,
                    gridGap: grid.gridGap,
                });
            },
            { cfg: groupCfg(VARIANTS[0], EMPTY_H), def: DEF, grid, editMode },
        );
        await page.waitForTimeout(260);
        const got = await page.evaluate((gid) => {
            const el = document.querySelector(`.aura-widget-${gid}`);
            return el ? Math.round(el.getBoundingClientRect().height) : -1;
        }, GID);
        const want = EMPTY_H * grid.gridRowHeight + (EMPTY_H - 1) * grid.gridGap;
        if (Math.abs(got - want) > TOL)
            emptyFails.push(`${(editMode ? 'editor' : 'frontend').padEnd(8)} | ${grid.name.padEnd(28)} | ${got}px, expected ${want}px`);
    }
}

await browser.close();

// ── report ───────────────────────────────────────────────────────────────────
const failed = rows.filter(
    (r) =>
        r.error ||
        r.barPx > 0 ||
        r.gridOverPx > TOL ||
        Math.abs(r.gapBottomPx - 4) > 2 ||
        Math.abs(r.gapTopPx - 4) > 2,
);

const fmt = (r) =>
    r.error
        ? `${r.view.padEnd(8)} | ${r.grid.padEnd(28)} | ${r.variant.padEnd(20)} | ${r.children.padEnd(20)} | ERROR ${r.error}`
        : `${r.view.padEnd(8)} | ${r.grid.padEnd(28)} | ${r.variant.padEnd(20)} | ${r.children.padEnd(20)} | ` +
          `bar ${String(r.barPx).padStart(3)} | grid ${String(r.gridOverPx).padStart(4)} | ` +
          `top ${String(r.gapTopPx).padStart(3)} | bottom ${String(r.gapBottomPx).padStart(4)} | ` +
          `clipped ${String(r.contentPx).padStart(4)} | outer ${r.outerPx}`;

console.log(`\nchecked ${checked} constellations — ${failed.length} failing\n`);
if (failed.length) {
    console.log('── failing ──');
    for (const r of failed) console.log(fmt(r));
    // Group the failures so the pattern is visible at a glance.
    const by = (key) => {
        const m = new Map();
        for (const r of failed) m.set(r[key], (m.get(r[key]) ?? 0) + 1);
        return [...m.entries()].map(([k, v]) => `${k}: ${v}`).join(', ');
    };
    console.log(`\nby view    : ${by('view')}`);
    console.log(`by grid    : ${by('grid')}`);
    console.log(`by variant : ${by('variant')}`);
    console.log(`by children: ${by('children')}`);
} else {
    console.log('all constellations fit: no scrollbar, grid within the box, uniform 4px inset top and bottom.');
    const clipped = rows.filter((r) => r.contentPx > TOL);
    if (clipped.length) {
        console.log(
            `\nnote: ${clipped.length} constellations clip a child's own content (cell too small for the widget) —` +
                ' identical in both views, e.g.:',
        );
        for (const r of clipped.slice(0, 5)) console.log('  ' + fmt(r));
    }
}
// ── editor vs frontend parity ────────────────────────────────────────────────
// The editor must render a group exactly like the frontend does — same outer
// height, same insets. This is what "backend and frontend drift apart" means.
const key = (r) => `${r.grid} | ${r.variant} | ${r.children}`;
const byKey = new Map();
for (const r of rows) {
    const e = byKey.get(key(r)) ?? {};
    e[r.view] = r;
    byKey.set(key(r), e);
}
const drift = [];
for (const [k, e] of byKey) {
    if (!e.editor || !e.frontend || e.editor.error || e.frontend.error) continue;
    const dOuter = Math.abs(e.editor.outerPx - e.frontend.outerPx);
    const dTop = Math.abs(e.editor.gapTopPx - e.frontend.gapTopPx);
    const dBottom = Math.abs(e.editor.gapBottomPx - e.frontend.gapBottomPx);
    if (dOuter > TOL || dTop > TOL || dBottom > TOL)
        drift.push(`${k} | outer ${e.editor.outerPx} vs ${e.frontend.outerPx} | top ±${dTop} | bottom ±${dBottom}`);
}
console.log(
    drift.length
        ? `\n── editor/frontend drift (${drift.length}) ──\n${drift.join('\n')}`
        : `\neditor and frontend render identically in all ${byKey.size} combinations.`,
);

console.log(
    emptyFails.length
        ? `\n── empty group height (${emptyFails.length}) ──\n${emptyFails.join('\n')}`
        : `\nempty group keeps its stored height (${EMPTY_H} rows) in every grid, both views.`,
);

if (pageErrors.length) console.log(`\npage errors:\n  ${[...new Set(pageErrors)].join('\n  ')}`);

process.exit(failed.length || drift.length || emptyFails.length ? 1 : 0);
