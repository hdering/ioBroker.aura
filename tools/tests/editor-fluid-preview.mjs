// UI test for the editor's fluid preview (#981 follow-up, settings.editorFluidPreview).
//
// With the fluid grid the frontend stretches columns (and rows in 'scale' / 'fill')
// to the window; the editor stays on the fixed design pitch. With the preview on,
// the editor lays the grid out like the frontend on the guidelines' target size —
// not on its own window — so a widget there is exactly as large as in the frontend
// on that device. Display only: the stored grid positions must not change.
//
//   AURA_IOBROKER_URL=http://127.0.0.1:9 npx vite --port 5199 --host 127.0.0.1   (or set AURA_BASE)
//   AURA_BASE=http://127.0.0.1:5199 node tools/tests/editor-fluid-preview.mjs
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://127.0.0.1:5199';
const TARGET = { width: 1000, height: 700 };
const GRID = { gridRowHeight: 20, gridSnapX: 20, gridGap: 10 };
const widgets = [
    {
        id: 'wa',
        type: 'value',
        title: 'A',
        datapoint: 'demo.temp',
        layout: 'default',
        options: {},
        gridPos: { x: 0, y: 0, w: 10, h: 4 },
    },
    {
        id: 'wb',
        type: 'value',
        title: 'B',
        datapoint: 'demo.temp',
        layout: 'default',
        options: {},
        gridPos: { x: 10, y: 0, w: 6, h: 6 },
    },
];
const designPx = (n, cell) => n * cell + (n - 1) * GRID.gridGap;

let passed = 0;
let failed = 0;
const check = (ok, label, detail = '') => {
    if (ok) passed++;
    else failed++;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
async function render({ viewport, editMode, preview, heightMode }) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
    await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
    await page.evaluate(
        ({ widgets, grid, editMode, preview, heightMode, target }) => {
            localStorage.setItem('aura-auth', JSON.stringify({ state: { sessionActive: true }, version: 0 }));
            window.__auraShot.mock({ 'demo.temp': 21 });
            window.__auraShot.setFrontend({
                showHeader: false,
                gridWidthMode: 'fluid',
                gridHeightMode: heightMode,
                fluidDesignWidth: 0,
                fluidMinScale: 0.6,
                fluidMaxScale: 0,
                guidelinesWidth: target.width,
                guidelinesHeight: target.height,
                editorFluidPreview: preview,
            });
            window.__auraShot.showWidgets(widgets, { editMode, ...grid });
        },
        { widgets, grid: GRID, editMode, preview, heightMode, target: TARGET },
    );
    await page.waitForSelector('.aura-widget-wb', { timeout: 15000 });
    let m = null;
    let prev = '';
    for (let i = 0; i < 20; i++) {
        await page.waitForTimeout(150);
        m = await page.evaluate(() => {
            const box = (id) => {
                const r = document
                    .querySelector(`.aura-widget-${id}`)
                    .closest('.react-grid-item')
                    .getBoundingClientRect();
                return { w: Math.round(r.width), h: Math.round(r.height) };
            };
            const sc = document.querySelector('.aura-scroll');
            return {
                a: box('wa'),
                b: box('wb'),
                mode: sc?.getAttribute('data-aura-grid-mode'),
                preview: sc?.hasAttribute('data-aura-fluid-preview'),
                posA: window.__auraShot.widgetGridPos('wa'),
                posB: window.__auraShot.widgetGridPos('wb'),
            };
        });
        const k = JSON.stringify(m);
        if (k === prev) break;
        prev = k;
    }
    await context.close();
    return m;
}

for (const heightMode of ['scale', 'fill']) {
    console.log(`\nHöhe: ${heightMode}`);
    const fe = await render({ viewport: TARGET, editMode: false, preview: false, heightMode });
    const ed = await render({ viewport: { width: 1500, height: 950 }, editMode: true, preview: true, heightMode });
    const off = await render({ viewport: { width: 1500, height: 950 }, editMode: true, preview: false, heightMode });

    check(fe.mode === 'fluid', 'Frontend: fließendes Raster', fe.mode);
    check(ed.mode === 'fluid' && ed.preview, 'Editor mit Vorschau: fließend', `${ed.mode} ${ed.preview}`);
    for (const k of ['a', 'b']) {
        check(
            Math.abs(ed[k].w - fe[k].w) <= 1 && Math.abs(ed[k].h - fe[k].h) <= 1,
            `Widget ${k.toUpperCase()}: Editor = Frontend auf ${TARGET.width} × ${TARGET.height}`,
            `${ed[k].w}×${ed[k].h} vs ${fe[k].w}×${fe[k].h}`,
        );
    }
    check(
        fe.a.w > designPx(10, GRID.gridSnapX) + 5,
        'Frontend wirklich gestreckt (sonst sagt der Vergleich nichts)',
        `${fe.a.w} > ${designPx(10, GRID.gridSnapX)}`,
    );
    check(off.mode === 'fixed' && !off.preview, 'Editor ohne Vorschau: festes Raster', off.mode);
    check(
        // The fixed grid spreads the leftover width over its columns, so only ≈ in x;
        // the rows are exactly the design pitch.
        Math.abs(off.a.w - designPx(10, GRID.gridSnapX)) <= 15 && off.a.h === designPx(4, GRID.gridRowHeight),
        'Editor ohne Vorschau: Design-Größe',
        `${off.a.w}×${off.a.h}`,
    );
    check(
        JSON.stringify(ed.posA) === JSON.stringify(widgets[0].gridPos) &&
            JSON.stringify(ed.posB) === JSON.stringify(widgets[1].gridPos),
        'Vorschau ändert keine gespeicherten Positionen',
        JSON.stringify([ed.posA, ed.posB]),
    );
}

await browser.close();
console.log(`\n${passed} ok, ${failed} fehlgeschlagen`);
process.exit(failed ? 1 : 0);
