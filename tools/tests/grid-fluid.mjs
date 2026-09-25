// Fluid-Raster (#413): mit gridWidthMode 'fluid' behaelt das Desktop-Raster seine
// Spaltenzahl und streckt die Spalten auf die Fensterbreite. 'fixed' (Standard) muss
// pixelgleich zum bisherigen Verhalten bleiben.
//
//   npm run dev            (oder AURA_BASE setzen)
//   node tools/tests/grid-fluid.mjs
//
// Geprueft im Browser: Breite und Lage der Widget-Boxen, rechter Rand gegen die
// Rasterbreite, waagerechter Ueberlauf, Vorrang des Tablet-Flusses und die
// Entwurfsansicht im Editor. Die Formel selbst prueft grid-columns-logic.mjs.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5173';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const browser = await chromium.launch();

/** 48 Rasterspalten (Entwurf 48 · 30 + 10 = 1450 px bei snapX 20 / Abstand 10):
 *  zwei Haelften und eine volle Zeile darunter. */
const WIDGETS = [
    { id: 'A', x: 0, y: 0, w: 24, h: 4 },
    { id: 'B', x: 24, y: 0, w: 24, h: 4 },
    { id: 'C', x: 0, y: 4, w: 48, h: 4 },
];
const DESIGN_PX = 48 * 30 + 10;

const widgetDefs = () =>
    WIDGETS.map((w) => ({
        id: w.id,
        type: 'value',
        title: `Widget ${w.id}`,
        datapoint: 'demo.t1',
        gridPos: { x: w.x, y: w.y, w: w.w, h: w.h },
        options: {},
    }));

async function open(width) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, ignoreHTTPSErrors: true });
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
    return { ctx, page, pageErrors };
}

async function show(page, { settings, editMode = false }) {
    await page.evaluate(
        ([settings, widgets, editMode]) => {
            window.__auraShot.mock({ 'demo.t1': 21.5 });
            window.__auraShot.mockServerState({ 'demo.t1': 21.5 });
            window.__auraShot.setFrontend({
                gridSnapX: 20,
                gridGap: 10,
                mobileBreakpoint: 600,
                mobileCols: 1,
                tabletBreakpoint: 0,
                tabletCols: 2,
                guidelinesEnabled: false,
                gridWidthMode: 'fixed',
                fluidDesignWidth: 0,
                fluidMinScale: 0.6,
                fluidMaxScale: 0,
                ...settings,
            });
            window.__auraShot.showWidgets(widgets, { editMode });
        },
        [settings, widgetDefs(), editMode],
    );
    await page.waitForSelector('[data-aura-widget="A"]', { timeout: 10000 });
    await page.waitForTimeout(400);
}

const geometry = (page) =>
    page.evaluate(() => {
        const grid = document.querySelector('.react-grid-layout');
        const flow = document.querySelector('[data-aura-flow-cols]');
        const scroller = (grid ?? flow)?.closest('.aura-scroll');
        const r1 = (n) => Math.round(n * 10) / 10;
        const boxes = {};
        for (const el of document.querySelectorAll('[data-aura-widget]')) {
            const b = el.getBoundingClientRect();
            boxes[el.getAttribute('data-aura-widget')] = {
                top: r1(b.top),
                left: r1(b.left),
                right: r1(b.right),
                width: r1(b.width),
                height: r1(b.height),
            };
        }
        const gb = grid?.getBoundingClientRect();
        return {
            mode: flow ? 'flow' : grid ? 'grid' : 'none',
            gridMode: scroller?.getAttribute('data-aura-grid-mode') ?? null,
            gridRight: gb ? r1(gb.right) : 0,
            gridWidth: gb ? r1(gb.width) : 0,
            // Content box of the scroller (it carries p-2 / sm:p-4).
            contentWidth: scroller
                ? scroller.clientWidth -
                  parseFloat(getComputedStyle(scroller).paddingLeft) -
                  parseFloat(getComputedStyle(scroller).paddingRight)
                : 0,
            overflowX: scroller ? scroller.scrollWidth - scroller.clientWidth : null,
            boxes,
        };
    });

const approx = (a, b, tol = 2) => Math.abs(a - b) <= tol;
// Eine Haelfte auf dem festen Raster: 24 Spalten · 20 + 23 Abstaende · 10. RGL teilt die
// Rasterbreite auf die Spalten auf, eine Spalte liegt daher nur ungefaehr bei snapX.
const HALF_FIXED = 24 * 20 + 23 * 10;
const nearFixed = (w) => approx(w, HALF_FIXED, 20);
/** Gerenderte Rasterbreite: C belegt alle 48 Spalten, containerPadding ist 0. */
const span = (g) => g.boxes.C.right - g.boxes.C.left;
let fixedHalf1920 = 0;

// ── fixed: unveraendert, breites Fenster laesst rechts Platz ─────────────────────
{
    const { ctx, page, pageErrors } = await open(1920);
    await show(page, { settings: {} });
    const g = await geometry(page);
    check('fixed 1920: Raster', g.mode === 'grid' && g.gridMode === 'fixed', `${g.mode}/${g.gridMode}`);
    check('fixed 1920: Haelfte behaelt Entwurfsbreite', nearFixed(g.boxes.A.width), `${g.boxes.A.width}`);
    fixedHalf1920 = g.boxes.A.width;
    check(
        'fixed 1920: rechts bleibt Platz',
        g.boxes.B.right < g.gridRight - 200,
        `B.right ${g.boxes.B.right}, Raster ${g.gridRight}`,
    );
    check('fixed 1920: keine Seitenfehler', pageErrors.length === 0, pageErrors.join(' | '));
    await ctx.close();
}

// ── fixed: schmales Fenster scrollt waagerecht wie bisher ────────────────────────
{
    const { ctx, page } = await open(1100);
    await show(page, { settings: {} });
    const g = await geometry(page);
    check('fixed 1100: Haelfte behaelt Entwurfsbreite', nearFixed(g.boxes.A.width), `${g.boxes.A.width}`);
    check(
        'fixed: Breite haengt kaum am Fenster',
        approx(g.boxes.A.width, fixedHalf1920, 15),
        `${g.boxes.A.width}/${fixedHalf1920}`,
    );
    check('fixed 1100: waagerechter Ueberlauf', g.overflowX > 0, `${g.overflowX}px`);
    await ctx.close();
}

// ── fluid: breites Fenster wird gefuellt ─────────────────────────────────────────
for (const width of [1920, 2560]) {
    const { ctx, page, pageErrors } = await open(width);
    await show(page, { settings: { gridWidthMode: 'fluid' } });
    const g = await geometry(page);
    const { A, B, C } = g.boxes;
    check(`fluid ${width}: Raster im Fluid-Modus`, g.mode === 'grid' && g.gridMode === 'fluid', `${g.gridMode}`);
    check(
        `fluid ${width}: Raster so breit wie der Scroller`,
        approx(span(g), g.contentWidth, 1),
        `${span(g)}/${g.contentWidth}`,
    );
    check(`fluid ${width}: B endet am rechten Rand`, approx(B.right, g.gridRight, 1), `${B.right}/${g.gridRight}`);
    check(`fluid ${width}: C ueber die volle Breite`, approx(C.left, A.left, 1) && approx(C.right, g.gridRight, 1));
    check(`fluid ${width}: A und B gleich breit`, approx(A.width, B.width, 1), `${A.width}/${B.width}`);
    check(`fluid ${width}: gestreckt`, A.width > HALF_FIXED + 50, `${A.width}`);
    check(`fluid ${width}: Hoehe bleibt`, approx(A.height, 4 * 20 + 3 * 10, 1), `${A.height}`);
    check(`fluid ${width}: kein Ueberlauf`, g.overflowX <= 0, `${g.overflowX}px`);
    check(`fluid ${width}: keine Seitenfehler`, pageErrors.length === 0, pageErrors.join(' | '));
    await ctx.close();
}

// ── fluid: schmaler als der Entwurf, ueber / unter minScale ──────────────────────
{
    const { ctx, page } = await open(1100);
    await show(page, { settings: { gridWidthMode: 'fluid', fluidMinScale: 0.6 } });
    let g = await geometry(page);
    check('fluid 1100 (min 60 %): gestaucht statt Scroll', g.overflowX <= 0, `${g.overflowX}px`);
    check('fluid 1100 (min 60 %): B endet am Rand', approx(g.boxes.B.right, g.gridRight, 1));
    check('fluid 1100: gestaucht', g.boxes.A.width < HALF_FIXED - 20, `${g.boxes.A.width}`);

    await show(page, { settings: { gridWidthMode: 'fluid', fluidMinScale: 0.9 } });
    g = await geometry(page);
    check('fluid 1100 (min 90 %): scrollt waagerecht', g.overflowX > 0, `${g.overflowX}px`);
    check(
        'fluid 1100 (min 90 %): Raster = 90 % des Entwurfs',
        approx(span(g), Math.round(DESIGN_PX * 0.9), 1),
        `${span(g)}`,
    );
    await ctx.close();
}

// ── fluid: Deckel und Entwurfsbreite ─────────────────────────────────────────────
{
    const { ctx, page } = await open(2560);
    await show(page, { settings: { gridWidthMode: 'fluid', fluidMaxScale: 1.2 } });
    let g = await geometry(page);
    check('fluid 2560 (max 120 %): Raster gedeckelt', approx(span(g), Math.round(DESIGN_PX * 1.2), 1), `${span(g)}`);

    // Entwurf 2900 px = doppelte Belegung → Inhalt fuellt die halbe Breite
    await show(page, { settings: { gridWidthMode: 'fluid', fluidDesignWidth: 2 * DESIGN_PX - 10 } });
    g = await geometry(page);
    check(
        'fluid 2560 (Entwurf doppelt): Inhalt belegt die halbe Breite',
        approx(span(g), g.contentWidth / 2, 12),
        `${span(g)}/${g.contentWidth}`,
    );
    await ctx.close();
}

// ── Gruppe: die Kinder strecken sich mit, statt Spalten dazuzubekommen ──────────
async function groupGeometry(width, settings) {
    const { ctx, page } = await open(width);
    await page.evaluate((settings) => {
        const child = (id, x) => ({
            id,
            type: 'value',
            title: id,
            datapoint: 'demo.t1',
            gridPos: { x, y: 0, w: 24, h: 3 },
            options: {},
        });
        window.__auraShot.mock({ 'demo.t1': 21.5 });
        window.__auraShot.mockServerState({ 'demo.t1': 21.5 });
        window.__auraShot.setFrontend({
            gridRowHeight: 20,
            gridSnapX: 20,
            gridGap: 10,
            mobileBreakpoint: 600,
            tabletBreakpoint: 0,
            guidelinesEnabled: false,
            ...settings,
        });
        window.__auraShot.groupDefs({ gdef: [child('X1', 0), child('X2', 24)] });
        window.__auraShot.showWidgets(
            [
                {
                    id: 'G',
                    type: 'group',
                    title: 'Gruppe',
                    datapoint: '',
                    layout: 'default',
                    options: { defId: 'gdef' },
                    gridPos: { x: 0, y: 0, w: 48, h: 6 },
                },
            ],
            { editMode: false },
        );
    }, settings);
    await page.waitForSelector('.aura-widget-X2', { timeout: 10000 });
    await page.waitForTimeout(600);
    const g = await page.evaluate(() => {
        const r = (id) =>
            (
                document.querySelector('.aura-widget-' + id).closest('.react-grid-item') ??
                document.querySelector('.aura-widget-' + id)
            ).getBoundingClientRect();
        const G = r('G');
        const X1 = r('X1');
        const X2 = r('X2');
        return { gRight: G.right, gWidth: G.width, x1: X1.width, x2: X2.width, x2Right: X2.right };
    });
    await ctx.close();
    return g;
}
{
    const g = await groupGeometry(2560, { gridWidthMode: 'fluid' });
    check('fluid 2560: Gruppe gestreckt', g.gWidth > DESIGN_PX + 500, `${g.gWidth}`);
    check('fluid 2560: Gruppenkinder fuellen die Gruppe', g.gRight - g.x2Right < 12, `Rest ${g.gRight - g.x2Right}`);
    check('fluid 2560: Gruppenkinder gleich breit', approx(g.x1, g.x2, 1), `${g.x1}/${g.x2}`);
    const f = await groupGeometry(1920, { gridWidthMode: 'fixed' });
    check('fixed 1920: Gruppenkinder fuellen die Gruppe', f.gRight - f.x2Right < 12, `Rest ${f.gRight - f.x2Right}`);
}

// ── Tablet-Fluss hat Vorrang, Editor zeigt die Entwurfsansicht ───────────────────
{
    const { ctx, page } = await open(900);
    await show(page, { settings: { gridWidthMode: 'fluid', tabletBreakpoint: 1024 } });
    const g = await geometry(page);
    check('fluid + Tablet-Band 900: Fluss statt Raster', g.mode === 'flow', g.mode);
    await ctx.close();
}
{
    const { ctx, page } = await open(1920);
    await show(page, { settings: { gridWidthMode: 'fluid' }, editMode: true });
    const g = await geometry(page);
    check('Editor: festes Raster', g.gridMode === 'fixed', `${g.gridMode}`);
    check('Editor: Haelfte in Entwurfsbreite', nearFixed(g.boxes.A.width), `${g.boxes.A.width}`);
    await ctx.close();
}

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
if (failed.length) {
    console.log('FAILED:');
    for (const f of failed) console.log(`  - ${f.name}${f.detail ? ` (${f.detail})` : ''}`);
    process.exit(1);
}
