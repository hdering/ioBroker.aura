// Popup-view editor: a "Fill tab" widget covers the whole canvas (#865).
//
//   AURA_IOBROKER_URL=http://127.0.0.1:9 npx vite --port 5199
//   AURA_BASE=http://localhost:5199 node tools/tests/popup-editor-fill-tab.mjs
//
// The popup stretches the single fillTab widget over its body; the editor showed it in
// its grid slot instead, so the preview did not match. Asserted: with fillTab the widget
// covers the canvas, without it keeps its grid size.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const VIEW_ID = 'pv-editor-fill-test';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail && !ok ? ` — ${detail}` : ''}`);
};

const slideshow = (fillTab) => ({
    id: 'pw-slides',
    type: 'slideshow',
    title: 'Diashow',
    datapoint: '',
    gridPos: { x: 0, y: 0, w: 4, h: 3 },
    options: fillTab ? { fillTab: true } : {},
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'domcontentloaded' });
await page.evaluate(() =>
    localStorage.setItem('aura-auth', JSON.stringify({ state: { sessionActive: true }, version: 0 })),
);
await page.goto('about:blank');
await page.goto(`${BASE}/?shot=1#/admin/popups/${VIEW_ID}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, null, { timeout: 60000 });

async function measure(fillTab) {
    await page.evaluate(
        ([id, w]) => window.__auraShot.popupViews([{ id, name: 'Fill', widgets: [w] }]),
        [VIEW_ID, slideshow(fillTab)],
    );
    await page.waitForTimeout(800);
    return page.evaluate(() => {
        const canvas = document.querySelector('[data-aura-scale]');
        const widget = document.querySelector('.aura-widget-pw-slides');
        if (!canvas || !widget) return null;
        const cs = getComputedStyle(canvas);
        const r = widget.getBoundingClientRect();
        return {
            w: Math.round(r.width),
            h: Math.round(r.height),
            cw: Math.round(canvas.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)),
            ch: Math.round(canvas.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)),
        };
    });
}

const near = (a, b) => Math.abs(a - b) <= 2;
const filled = await measure(true);
check(
    'Tab ausfüllen: Widget deckt die Arbeitsfläche',
    !!filled && near(filled.w, filled.cw) && near(filled.h, filled.ch),
    JSON.stringify(filled),
);
const grid = await measure(false);
check('ohne Tab ausfüllen: Rastergröße', !!grid && grid.w < grid.cw / 2 && grid.h < grid.ch / 2, JSON.stringify(grid));
check('keine Seitenfehler', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
