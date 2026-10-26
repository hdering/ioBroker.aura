// Verifies that auto-height cells in a popup view fill their grid slot.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/popup-auto-height-fill.mjs
//
// Why: a popup without popupHeight (always the case for a trigger rule) sizes
// content-driven widgets (status overview, calendar, list …) to their content. The
// cell ended at its content while the grid slot kept the designed height, so a
// status overview with one or two tiles sat visibly shorter than the calendar next
// to it, and every loading step ("loading…" → OK text → tiles) showed as a jump.
// Asserted here:
//
//   1. Status overview and calendar (both h=10) fill their slot and end level.
//   2. The status overview's frame height never changes while it loads.
//   3. Content taller than the designed slot still grows the slot.
//
// Popups are opened through a datapoint trigger like popup-auto-width.mjs.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const DP = 'demo.popupFillTrigger';
const VIEW_ID = 'pv-fill-test';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const status = (id, x, h) => ({
    id,
    type: 'statusoverview',
    title: 'Offene Fenster',
    datapoint: '',
    layout: 'card',
    gridPos: { x, y: 0, w: 4, h },
    options: {},
});
const calendar = (id, x, h) => ({
    id,
    type: 'calendar',
    title: 'Termine',
    datapoint: '',
    gridPos: { x, y: 0, w: 4, h },
    options: {},
});

const trigger = {
    id: 'pt-fill',
    name: 'Fill',
    enabled: true,
    clause: { datapoint: DP, operator: 'true', value: '' },
    host: {
        id: 'ptw-fill',
        type: 'value',
        title: 'Popup',
        datapoint: DP,
        gridPos: { x: 0, y: 0, w: 1, h: 1 },
        options: { clickAction: { kind: 'popup-view', viewId: VIEW_ID } },
    },
    resetDp: false,
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, null, { timeout: 90000 });

const settle = (ms = 450) => page.waitForTimeout(ms);

/** Opens the view; records every height the given cell takes until it settles. */
async function open(widgets, watchId) {
    await page.keyboard.press('Escape');
    await settle();
    await page.evaluate(
        ([dp, rule, v]) => {
            window.__auraShot.mock({ [dp]: false });
            window.__auraShot.popupViews(v);
            window.__auraShot.dpTriggers([rule]);
        },
        [DP, trigger, [{ id: VIEW_ID, name: 'Fill-Test', widgets }]],
    );
    await settle();
    await page.evaluate((id) => {
        window.__fillTrace = [];
        const tick = () => {
            const el = document.querySelector(`[data-aura-popup-widget="${id}"]`);
            if (el) {
                const h = Math.round(el.getBoundingClientRect().height);
                if (window.__fillTrace.at(-1) !== h) window.__fillTrace.push(h);
            }
            if (window.__fillTrace.length < 50) window.__fillRaf = requestAnimationFrame(tick);
        };
        tick();
    }, watchId);
    await page.evaluate((dp) => window.__auraShot.mock({ [dp]: true }), DP);
    await settle(1500);
    return page.evaluate(() => {
        cancelAnimationFrame(window.__fillRaf);
        const cells = {};
        for (const el of document.querySelectorAll('[data-aura-popup-widget]')) {
            const r = el.getBoundingClientRect();
            const slot = el.closest('.react-grid-item').getBoundingClientRect();
            cells[el.dataset.auraPopupWidget] = {
                h: Math.round(r.height),
                bottom: Math.round(r.bottom),
                slot: Math.round(slot.height),
            };
        }
        return { cells, trace: window.__fillTrace };
    });
}

// ── 1 + 2. Side by side, both h=10 ────────────────────────────────────────────
const a = await open([status('pf-status', 0, 10), calendar('pf-cal', 4, 10)], 'pf-status');
const s = a.cells['pf-status'];
const c = a.cells['pf-cal'];
check('Popup öffnet mit beiden Widgets', !!s && !!c);
check('Statusübersicht füllt ihren Platz', s && s.h >= s.slot - 1, s && `${s.h} / ${s.slot} px`);
check('Kalender füllt seinen Platz', c && c.h >= c.slot - 1, c && `${c.h} / ${c.slot} px`);
check(
    'beide schließen unten bündig ab',
    s && c && Math.abs(s.bottom - c.bottom) <= 1,
    s && c && `${s.bottom} / ${c.bottom}`,
);
check('Statusübersicht springt beim Laden nicht', a.trace.length === 1, a.trace.join(' → '));

// ── 3. Designed slot too small → still grows ──────────────────────────────────
const b = await open([status('pf-small', 0, 1)], 'pf-small');
const sm = b.cells['pf-small'];
check('zu kleiner Platz wächst mit dem Inhalt', sm && sm.slot > 60, sm && `${sm.slot} px`);
check('gewachsene Zelle füllt ihren Platz', sm && sm.h >= sm.slot - 1, sm && `${sm.h} / ${sm.slot} px`);

check('keine Seitenfehler', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} Checks ok`);
process.exit(failed.length ? 1 : 0);
