// Spalten nach Hoehe fuellen (#939) im echten Frontend: Masonry ('height') und
// 'compact' (so wenige Spalten wie noetig, Block zentriert). Dazu: Eine Hoehenaenderung
// nach der Einschwingphase verteilt nicht um.
//
//   npm run dev            (oder AURA_BASE setzen)
//   node tools/tests/flow-fill.mjs
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5173';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const browser = await chromium.launch();

/** lang – kurz – kurz – lang, alle schmal (3 von 12 Rasterspalten). */
const WIDGETS = [
    { id: 'A', h: 12 },
    { id: 'B', h: 5 },
    { id: 'C', h: 5 },
    { id: 'D', h: 12 },
].map((w, i) => ({
    id: w.id,
    type: 'value',
    title: `Widget ${w.id}`,
    datapoint: 'demo.t1',
    gridPos: { x: i * 3, y: 0, w: 3, h: w.h },
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

async function show(page, settings, widgets = WIDGETS) {
    await page.evaluate(
        ([settings, widgets]) => {
            window.__auraShot.mock({ 'demo.t1': 21.5 });
            window.__auraShot.mockServerState({ 'demo.t1': 21.5 });
            window.__auraShot.setFrontend({
                mobileBreakpoint: 600,
                mobileCols: 1,
                tabletBreakpoint: 1600,
                tabletCols: 4,
                gridRowHeight: 20,
                ...settings,
            });
            window.__auraShot.showWidgets(widgets, {});
        },
        [settings, widgets],
    );
    await page.waitForSelector('[data-aura-widget="A"]', { timeout: 10000 });
    await page.waitForTimeout(600);
}

/** Spalten des ersten Blocks als id-Listen, dazu slots und Raender des Blocks. */
const layout = (page) =>
    page.evaluate(() => {
        const band = document.querySelector('[data-aura-flow-band]');
        const cols = [...band.querySelectorAll(':scope > [data-aura-flow-col]')].map((c) =>
            [...c.querySelectorAll(':scope > [data-aura-widget]')].map((w) => w.getAttribute('data-aura-widget')),
        );
        const outer = band.getBoundingClientRect();
        const kids = [...band.querySelectorAll(':scope > [data-aura-flow-col]')].map((c) => c.getBoundingClientRect());
        const left = kids.length ? Math.min(...kids.map((k) => k.left)) - outer.left : 0;
        const right = kids.length ? outer.right - Math.max(...kids.map((k) => k.right)) : 0;
        return {
            cols,
            slots: Number(band.getAttribute('data-aura-flow-band-slots') ?? 0),
            left: Math.round(left),
            right: Math.round(right),
            colWidth: kids.length ? Math.round(kids[0].width) : 0,
            bandWidth: Math.round(outer.width),
        };
    });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

{
    const { ctx, page, pageErrors } = await open(1200);

    await show(page, { flowFill: 'count' });
    let l = await layout(page);
    check('count: vier Spalten wie bisher', same(l.cols, [['A'], ['B'], ['C'], ['D']]), JSON.stringify(l.cols));

    await show(page, { flowFill: 'height', tabletCols: 3 });
    l = await layout(page);
    check('height: D unter die kurze B', same(l.cols, [['A'], ['B', 'D'], ['C']]), JSON.stringify(l.cols));

    await show(page, { flowFill: 'compact' });
    l = await layout(page);
    check('compact: lang | kurz+kurz | lang', same(l.cols, [['A'], ['B', 'C'], ['D']]), JSON.stringify(l.cols));
    check('compact: slots 4', l.slots === 4, String(l.slots));
    check('compact: zentriert', Math.abs(l.left - l.right) <= 2, `links ${l.left} rechts ${l.right}`);
    const quarter = (l.bandWidth - 3 * 10) / 4;
    check('compact: Spaltenbreite = Viertel', Math.abs(l.colWidth - quarter) <= 2, `${l.colWidth} vs ${quarter}`);

    // Nach der Einschwingphase waechst eine Karte: es wird NICHT umverteilt.
    await page.mouse.click(5, 5);
    await page.waitForTimeout(1700);
    await page.evaluate(() => {
        const box = document.querySelector('[data-aura-widget="B"]');
        box.style.height = '600px';
    });
    await page.waitForTimeout(600);
    l = await layout(page);
    check('kein Umverteilen nach Hoehenaenderung', same(l.cols, [['A'], ['B', 'C'], ['D']]), JSON.stringify(l.cols));

    check('keine Seitenfehler', pageErrors.length === 0, pageErrors.join(' | '));
    await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} ok`);
process.exit(failed ? 1 : 0);
