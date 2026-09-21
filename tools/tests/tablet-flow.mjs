// Tablet-Modus (#413): zwischen Mobile- und Tablet-Breakpoint fliessen die Widgets in
// N Spalten statt ins Desktop-Raster (das dort waagerecht scrollt) oder in die
// Einspalten-Ansicht des Handys.
//
//   npm run dev            (oder AURA_BASE setzen)
//   node tools/tests/tablet-flow.mjs
//
// Geprueft wird im Browser, nicht an der Formel: Lage und Breite der Widget-Boxen,
// der Zweig (Raster oder Fluss), der waagerechte Ueberlauf des Scrollers und die
// Reihenfolge - inklusive Rueckfall der Tablet- auf die Mobile-Reihenfolge, der
// Baender (ein Widget in voller Breite unterbricht die Spalten) und der festen
// Zuordnung aus dem Panel (tabletCol / tabletWide).
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

/** Layout mit zwei Bereichen (damit das Bereichs-Menue erscheint) und fester Seitenleiste
 *  (240 px) links vom Dashboard; `tabletPlacement` ist die Menue-Platzierung im Tablet-Band. */
async function showWithSidebar(page, { settings, tabletPlacement = 'auto' }) {
    await page.evaluate(
        ([settings, widgets, tabletPlacement]) => {
            window.__auraShot.mock({ 'demo.t1': 21.5 });
            window.__auraShot.mockServerState({ 'demo.t1': 21.5 });
            window.__auraShot.setFrontend({
                mobileBreakpoint: 600,
                tabletBreakpoint: 0,
                tabletCols: 2,
                layoutDrawerEnabled: true,
                layoutDrawerPlacement: 'sidebar',
                layoutDrawerWidth: 240,
                layoutDrawerTabletPlacement: tabletPlacement,
                ...settings,
            });
            const tab = (id, ws) => ({ id, name: id, slug: id, widgets: ws });
            window.__auraShot.seed({
                layouts: [
                    {
                        id: 'l1',
                        name: 'L',
                        slug: 'l',
                        activeSectionId: 's1',
                        sections: [
                            { id: 's1', name: 'Eins', slug: 'eins', activeTabId: 't1', tabs: [tab('t1', widgets)] },
                            { id: 's2', name: 'Zwei', slug: 'zwei', activeTabId: 't2', tabs: [tab('t2', [])] },
                        ],
                    },
                ],
                activeLayoutId: 'l1',
            });
        },
        [settings, widgetDefs(), tabletPlacement],
    );
    await page.waitForSelector('[data-aura-widget="A"]', { timeout: 10000 });
    await page.waitForTimeout(400);
}
/** Die feste Seitenleiste ist ein <aside>; der Hamburger-Ersatz ist ein Knopf. */
const sidebarVisible = (page) => page.evaluate(() => !!document.querySelector('aside'));

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

// ── Baender: ein Widget in voller Breite beendet den Spaltenblock, darunter beginnt ein neuer ──
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
    const { A, B, C, D, E } = g.boxes;
    check(
        'A allein im ersten Block, links',
        A.left < g.flowWidth / 4 && C.top > A.top + A.height - 1,
        `A ${A.left}/${A.top} C ${C.top}`,
    );
    check(
        'C als Band ueber die volle Breite',
        C.span === 2 && approx(C.width, g.flowWidth),
        `${C.width} von ${g.flowWidth}`,
    );
    check(
        'D links und B rechts im Block unter dem Band',
        D.top > C.top && sameRow(D, B) && approx(D.left, A.left) && B.left > D.left,
        `D ${D.left}/${D.top} B ${B.left}/${B.top}`,
    );
    check('E stapelt unter D in derselben Spalte', approx(E.left, D.left) && E.top > D.top, `E ${E.left}/${E.top}`);
    await ctx.close();
}

// ── Feste Zuordnung aus dem Panel: tabletCol setzt die Spalte, tabletWide das Band ──────
{
    const { ctx, page } = await open(900);
    await show(page, {
        settings: { tabletBreakpoint: 1024, tabletCols: 2 },
        orders: {
            A: { tabletCol: 1 },
            B: { tabletCol: 0 },
            C: { tabletWide: false },
            D: { tabletWide: true },
        },
    });
    const g = await geometry(page);
    const { A, B, C, D, E } = g.boxes;
    check(
        'tabletCol: B links, A rechts (Rasterreihenfolge waere umgekehrt)',
        sameRow(A, B) && B.left < A.left,
        `B ${B.left} A ${A.left}`,
    );
    check(
        'tabletWide=false: C bleibt trotz voller Desktop-Breite eine Spalte',
        C.span === 1 && approx(C.left, B.left) && C.top > B.top,
        `C ${C.left}/${C.top} span ${C.span}`,
    );
    check(
        'tabletWide=true: D wird zum Band',
        D.span === 2 && approx(D.width, g.flowWidth) && D.top > C.top,
        `${D.width} von ${g.flowWidth}`,
    );
    check(
        'E ohne Zuordnung: neuer Block unter dem Band, linke Spalte',
        E.top > D.top && approx(E.left, B.left),
        `E ${E.left}/${E.top}`,
    );
    check('kein Ueberlauf', g.overflowX !== null && g.overflowX <= 0, `${g.overflowX}px`);
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

// ── Fensterbreite zaehlt, nicht die Dashboard-Breite: die feste Seitenleiste (240 px) ────
// verschiebt den Umbruch nicht (Nutzerbericht: "768 eingestellt, schaltet schon bei 1024").
{
    const { ctx, page } = await open(1024);
    await showWithSidebar(page, { settings: { tabletBreakpoint: 768 }, tabletPlacement: 'sidebar' });
    let g = await geometry(page);
    check('1024px Fenster + Seitenleiste, Breakpoint 768: Raster', g.mode === 'grid', g.mode);
    check('Seitenleiste steht (Desktop)', await sidebarVisible(page));

    await showWithSidebar(page, { settings: { tabletBreakpoint: 1100 }, tabletPlacement: 'sidebar' });
    g = await geometry(page);
    const keep = await sidebarVisible(page);
    check(
        'Breakpoint 1100, Platzierung "Seitenleiste": Fluss, Menue bleibt',
        g.mode === 'flow' && keep,
        `${g.mode}, aside ${keep}`,
    );
    check(
        'Fluss neben dem Menue ist schmaler als das Fenster',
        g.flowWidth > 0 && g.flowWidth < 1024 - 240,
        `${g.flowWidth}`,
    );

    await showWithSidebar(page, { settings: { tabletBreakpoint: 1100 }, tabletPlacement: 'auto' });
    g = await geometry(page);
    const gone = !(await sidebarVisible(page));
    check(
        'Breakpoint 1100, "Automatisch": Seitenleiste weicht dem Fluss',
        g.mode === 'flow' && gone,
        `${g.mode}, aside weg ${gone}`,
    );
    check('Fluss nutzt die volle Fensterbreite', g.flowWidth > 900, `${g.flowWidth}`);

    await showWithSidebar(page, { settings: { tabletBreakpoint: 0 }, tabletPlacement: 'auto' });
    g = await geometry(page);
    check(
        'Tablet-Modus aus: Raster und Seitenleiste wie bisher',
        g.mode === 'grid' && (await sidebarVisible(page)),
        g.mode,
    );
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
