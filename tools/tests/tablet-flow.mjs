// Tablet-Modus (#413): zwischen Mobile- und Tablet-Breakpoint fliessen die Widgets in
// N Spalten statt ins Desktop-Raster (das dort waagerecht scrollt) oder in die
// Einspalten-Ansicht des Handys.
//
//   npm run dev            (oder AURA_BASE setzen)
//   node tools/tests/tablet-flow.mjs
//
// Geprueft wird im Browser, nicht an der Formel: Lage und Breite der Widget-Boxen,
// der Zweig (Raster oder Fluss), der waagerechte Ueberlauf des Scrollers und die
// Reihenfolge - inklusive Rueckfall der Tablet- auf die Mobile-Reihenfolge und der
// dichten Packung (ein spaeteres Widget rueckt in eine Luecke vor).
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5173';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const browser = await chromium.launch();

/** Zwoelf Rasterspalten wie ein typischer Desktop-Tab: zwei Haelften, eine volle Zeile,
 *  ein Drittel neben zwei Dritteln. */
const WIDGETS = [
    { id: 'A', x: 0, y: 0, w: 6, h: 4 },
    { id: 'B', x: 6, y: 0, w: 6, h: 4 },
    { id: 'C', x: 0, y: 4, w: 12, h: 4 },
    { id: 'D', x: 0, y: 8, w: 4, h: 4 },
    { id: 'E', x: 4, y: 8, w: 8, h: 4 },
];

function widgetDefs(orders = {}) {
    return WIDGETS.map((w) => ({
        id: w.id,
        type: 'value',
        title: `Widget ${w.id}`,
        datapoint: 'demo.t1',
        gridPos: { x: w.x, y: w.y, w: w.w, h: w.h },
        options: {},
        ...(orders[w.id] ?? {}),
    }));
}

/** Frischer Kontext je Breite: der Dashboard-Zweig haengt an der gemessenen Breite. */
async function open(width) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, ignoreHTTPSErrors: true });
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
    return { ctx, page, pageErrors };
}

async function show(page, { settings, orders, editMode = false }) {
    await page.evaluate(
        ([settings, widgets, editMode]) => {
            window.__auraShot.mock({ 'demo.t1': 21.5 });
            window.__auraShot.mockServerState({ 'demo.t1': 21.5 });
            window.__auraShot.setFrontend({ mobileBreakpoint: 600, tabletBreakpoint: 0, tabletCols: 2, ...settings });
            window.__auraShot.showWidgets(widgets, { editMode });
        },
        [settings, widgetDefs(orders), editMode],
    );
    await page.waitForSelector('[data-aura-widget="A"]', { timeout: 10000 });
    await page.waitForTimeout(400);
}

/** Zweig + Geometrie: Raster (RGL) oder Fluss (Spaltenzahl), Boxen je Widget, Ueberlauf. */
const geometry = (page) =>
    page.evaluate(() => {
        const flow = document.querySelector('[data-aura-flow-cols]');
        const grid = document.querySelector('.react-grid-layout');
        const scroller = flow?.closest('.aura-scroll') ?? grid?.closest('.aura-scroll');
        const r1 = (n) => Math.round(n * 10) / 10;
        const boxes = {};
        for (const el of document.querySelectorAll('[data-aura-widget]')) {
            const b = el.getBoundingClientRect();
            boxes[el.getAttribute('data-aura-widget')] = {
                top: r1(b.top),
                left: r1(b.left),
                width: r1(b.width),
                height: r1(b.height),
                span: Number(el.getAttribute('data-aura-flow-span') ?? 0),
            };
        }
        return {
            mode: flow ? 'flow' : grid ? 'grid' : 'none',
            cols: flow ? Number(flow.getAttribute('data-aura-flow-cols')) : 0,
            flowWidth: flow ? r1(flow.getBoundingClientRect().width) : 0,
            overflowX: scroller ? scroller.scrollWidth - scroller.clientWidth : null,
            boxes,
        };
    });

const sameRow = (a, b) => Math.abs(a.top - b.top) < 1;
const approx = (a, b, tol = 2) => Math.abs(a - b) <= tol;

// ── Tablet-Band: zwei Spalten, breite Widgets ueber beide, kein Ueberlauf ──────────────
{
    const { ctx, page, pageErrors } = await open(900);
    await show(page, { settings: { tabletBreakpoint: 1024, tabletCols: 2 } });
    const g = await geometry(page);
    check('900px: Fluss statt Raster', g.mode === 'flow', g.mode);
    check('900px: zwei Spalten', g.cols === 2, String(g.cols));
    check('900px: kein waagerechter Ueberlauf', g.overflowX !== null && g.overflowX <= 0, `${g.overflowX}px`);
    const { A, B, C, D, E } = g.boxes;
    check('A und B nebeneinander', sameRow(A, B) && A.left < B.left, `A ${A.left}/${A.top} B ${B.left}/${B.top}`);
    check(
        'A und B je eine halbe Breite',
        approx(A.width, B.width) && A.width < g.flowWidth * 0.55,
        `${A.width} von ${g.flowWidth}`,
    );
    check(
        'C ueber die volle Breite',
        C.span === 2 && approx(C.width, g.flowWidth),
        `${C.width} von ${g.flowWidth}, span ${C.span}`,
    );
    check('C unter A/B', C.top > A.top + A.height - 1, `C ${C.top}, A bis ${A.top + A.height}`);
    check(
        'D (1/3) und E (2/3) je eine Spalte',
        D.span === 1 && E.span === 1 && sameRow(D, E),
        `D ${D.span} E ${E.span}`,
    );
    check(
        'Reihenfolge folgt dem Raster',
        A.top <= B.top && B.top < C.top && C.top < D.top,
        `${A.top} ${B.top} ${C.top} ${D.top}`,
    );
    check('900px: keine Seitenfehler', pageErrors.length === 0, pageErrors.join(' | '));
    await ctx.close();
}

// ── Reihenfolge: Tablet faellt auf die Mobile-Reihenfolge zurueck, eigene gewinnt ──────
{
    const { ctx, page } = await open(900);
    await show(page, {
        settings: { tabletBreakpoint: 1024, tabletCols: 2 },
        orders: {
            D: { mobileOrder: 0 },
            A: { mobileOrder: 1 },
            B: { mobileOrder: 2 },
            C: { mobileOrder: 3 },
            E: { mobileOrder: 4 },
        },
    });
    let g = await geometry(page);
    check(
        'mobileOrder ordnet auch den Tablet-Fluss (D zuerst)',
        g.boxes.D.top <= g.boxes.A.top && g.boxes.D.left < g.boxes.A.left,
        `D ${g.boxes.D.left}/${g.boxes.D.top} A ${g.boxes.A.left}/${g.boxes.A.top}`,
    );

    await show(page, {
        settings: { tabletBreakpoint: 1024, tabletCols: 2 },
        orders: {
            D: { mobileOrder: 0, tabletOrder: 1 },
            A: { mobileOrder: 1, tabletOrder: 2 },
            B: { mobileOrder: 2, tabletOrder: 3 },
            C: { mobileOrder: 3, tabletOrder: 4 },
            E: { mobileOrder: 4, tabletOrder: 0 },
        },
    });
    g = await geometry(page);
    check(
        'tabletOrder gewinnt ueber mobileOrder (E zuerst)',
        g.boxes.E.top <= g.boxes.D.top && g.boxes.E.left < g.boxes.D.left,
        `E ${g.boxes.E.left}/${g.boxes.E.top} D ${g.boxes.D.left}/${g.boxes.D.top}`,
    );
    await ctx.close();
}

// ── Dichte Packung: ein spaeteres schmales Widget fuellt die Luecke neben A ──────────
{
    const { ctx, page } = await open(900);
    await show(page, {
        settings: { tabletBreakpoint: 1024, tabletCols: 2 },
        orders: {
            A: { mobileOrder: 0 },
            C: { mobileOrder: 1 },
            D: { mobileOrder: 2 },
            B: { mobileOrder: 3 },
            E: { mobileOrder: 4 },
        },
    });
    const g = await geometry(page);
    const { A, C, D } = g.boxes;
    check('D rueckt in die Luecke neben A', sameRow(A, D) && D.left > A.left, `A ${A.top} D ${D.left}/${D.top}`);
    check('C (volle Breite) darunter', C.top > A.top, `C ${C.top} A ${A.top}`);
    await ctx.close();
}

// ── Drei Spalten ────────────────────────────────────────────────────────────────────────
{
    const { ctx, page } = await open(900);
    await show(page, { settings: { tabletBreakpoint: 1024, tabletCols: 3 } });
    const g = await geometry(page);
    check('tabletCols 3: drei Spalten', g.cols === 3, String(g.cols));
    check(
        '3 Spalten: D (1/3) eine Spalte, C alle drei',
        g.boxes.D.span === 1 && g.boxes.C.span === 3 && g.boxes.D.width < g.flowWidth * 0.4,
        `D ${g.boxes.D.width} C ${g.boxes.C.width} von ${g.flowWidth}`,
    );
    check('3 Spalten: kein Ueberlauf', g.overflowX !== null && g.overflowX <= 0, `${g.overflowX}px`);
    await ctx.close();
}

// ── Handy bleibt einspaltig, Desktop bleibt Raster ─────────────────────────────────────
{
    const { ctx, page } = await open(500);
    await show(page, { settings: { tabletBreakpoint: 1024, tabletCols: 2 } });
    const g = await geometry(page);
    check('500px: Fluss mit einer Spalte', g.mode === 'flow' && g.cols === 1, `${g.mode} ${g.cols}`);
    check(
        '500px: A ueber B, beide volle Breite',
        g.boxes.A.top < g.boxes.B.top && approx(g.boxes.A.width, g.flowWidth),
        `A ${g.boxes.A.width} von ${g.flowWidth}`,
    );
    check(
        '500px: kein span-Attribut groesser 1',
        Object.values(g.boxes).every((b) => b.span === 1),
        JSON.stringify(Object.values(g.boxes).map((b) => b.span)),
    );
    await ctx.close();
}
{
    const { ctx, page } = await open(1200);
    await show(page, { settings: { tabletBreakpoint: 1024, tabletCols: 2 } });
    const g = await geometry(page);
    check('1200px: Desktop-Raster', g.mode === 'grid', g.mode);
    await ctx.close();
}

// ── Aus: Breakpoint 0 oder unter dem mobilen -> Raster wie bisher ──────────────────────
{
    const { ctx, page } = await open(900);
    await show(page, { settings: { tabletBreakpoint: 0 } });
    let g = await geometry(page);
    check('tabletBreakpoint 0: Raster bei 900px', g.mode === 'grid', g.mode);
    await show(page, { settings: { tabletBreakpoint: 500 } });
    g = await geometry(page);
    check('tabletBreakpoint unter mobile: Raster bei 900px', g.mode === 'grid', g.mode);
    await ctx.close();
}

// ── Editor: das Tablet-Band greift nicht, das Raster bleibt bearbeitbar ─────────────────
{
    const { ctx, page } = await open(900);
    await show(page, { settings: { tabletBreakpoint: 1024, tabletCols: 2 }, editMode: true });
    const g = await geometry(page);
    check('Editor bei 900px: Raster statt Tablet-Fluss', g.mode === 'grid', g.mode);
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
