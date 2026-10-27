// Verifies that popup-view widgets follow the grid's column count while the popup is
// open (#862).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/popup-cols-resync.mjs
//
// Why: react-grid-layout clamps its internal layout to `cols` whenever the layout prop
// changes, but never widens it again when only `cols` grows. The popup measures its
// width one frame after a view change, so a view that got wider while open (e.g. the
// popup config arriving after a screensaver popup opened) stayed squeezed into the old
// column count — a wide widget sat at a third of the dialog. Asserted here:
//
//   1. The widget opens at its designed width.
//   2. After the view grows while open, the widget spans the new width.
//   3. Shrinking back works as well.
//
// Popups are opened through a datapoint trigger like popup-auto-width.mjs.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const DP = 'demo.popupColsTrigger';
const VIEW_ID = 'pv-cols-test';
const SNAP = 20;
const GAP = 10;

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const views = (w) => [
    {
        id: VIEW_ID,
        name: 'Spalten-Test',
        widgets: [
            {
                id: 'pc-a',
                type: 'value',
                title: 'pc-a',
                datapoint: 'demo.value',
                gridPos: { x: 0, y: 0, w, h: 3 },
                options: {},
            },
        ],
    },
];

const rule = {
    id: 'pt-cols',
    name: 'Spalten',
    enabled: true,
    clause: { datapoint: DP, operator: 'true', value: '' },
    host: {
        id: 'ptw-cols',
        type: 'value',
        title: 'Popup',
        datapoint: DP,
        gridPos: { x: 0, y: 0, w: 1, h: 1 },
        options: { clickAction: { kind: 'popup-view', viewId: VIEW_ID } },
    },
    resetDp: false,
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, null, { timeout: 90000 });

const settle = () => page.waitForTimeout(450);
const cellWidth = () =>
    page.evaluate(() => {
        const cell = document.querySelector('[data-aura-click-popup] [data-aura-popup-widget="pc-a"]');
        return cell ? Math.round(cell.getBoundingClientRect().width) : -1;
    });
// Single widget spanning the whole view: it fills the grid box, whose width is the
// span's columns plus one trailing gap (see naturalMinWidth).
const expected = (w) => w * (SNAP + GAP) + GAP;
const near = (a, b) => Math.abs(a - b) <= 2;

await page.evaluate(
    ([dp, r, v, snap, gap]) => {
        window.__auraShot.setFrontend({ gridSnapX: snap, gridGap: gap });
        window.__auraShot.mock({ 'demo.value': { val: 21.5, unit: '°C' }, [dp]: false });
        window.__auraShot.popupViews(v);
        window.__auraShot.dpTriggers([r]);
    },
    [DP, rule, views(12), SNAP, GAP],
);
await settle();
await page.evaluate((dp) => window.__auraShot.mock({ [dp]: true }), DP);
await settle();

// ── 1. Designed width on open ─────────────────────────────────────────────────
const open = await cellWidth();
check('Popup öffnet in Entwurfsbreite', near(open, expected(12)), `${open} px, erwartet ${expected(12)}`);

// ── 2. View grows while open → widget must not stay at the old 12 columns ────
await page.evaluate((v) => window.__auraShot.popupViews(v), views(42));
await settle();
const grown = await cellWidth();
check('breitere View füllt den Dialog', near(grown, expected(42)), `${grown} px, erwartet ${expected(42)}`);

// ── 3. And back ───────────────────────────────────────────────────────────────
await page.evaluate((v) => window.__auraShot.popupViews(v), views(20));
await settle();
const shrunk = await cellWidth();
check('schmalere View schrumpft mit', near(shrunk, expected(20)), `${shrunk} px, erwartet ${expected(20)}`);

check('keine Seitenfehler', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} Checks ok`);
process.exit(failed.length ? 1 : 0);
