// Cells lying on a spanning cell are painted above it — floor-plan layout: an image
// cell spans the whole grid and lamps/values sit on top of it.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/custom-grid-overlay.mjs
//
// Before, a span was lifted to z-index 1 and a plain 1x1 cell on it disappeared
// behind the image (only allowOverflow text or another span got through).
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const ID = 'cgo1';
const DP = 'daikin-cloud.0.aura-selftest-overlay.light';
const img = `data:image/svg+xml;base64,${Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#7dd3fc"/></svg>',
).toString('base64')}`;
const cells = Array.from({ length: 16 }, () => ({ type: 'empty' }));
cells[0] = { type: 'image', imageUrl: img, objectFit: 'fill', colSpan: 4, rowSpan: 4 };
cells[5] = { type: 'state-icon', dpId: DP, trueIcon: 'Lightbulb', falseIcon: 'Lightbulb', fontSize: 20 };
cells[10] = { type: 'text', text: 'Popup', clickAction: { kind: 'popup-html', html: '<p>Overlay-Popup</p>' } };
cells[15] = { type: 'switch', dpId: DP, controlMode: 'icon', trueIcon: 'Lock', falseIcon: 'LockOpen', fontSize: 20 };
const widget = {
    id: ID,
    type: 'image',
    title: 'Overlay',
    layout: 'custom',
    gridPos: { x: 0, y: 0, w: 16, h: 14 },
    options: { showTitle: false, customGrid: { cols: 4, rows: 4, cells } },
};

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1000, height: 800 } })).newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, null, { timeout: 90000 });
await page.evaluate((dp) => {
    window.__auraShot.captureWrites(true);
    window.__auraShot.mockServerState({ [dp]: true });
    window.__auraShot.mock({ [dp]: true });
}, DP);
await page.evaluate((w) => window.__auraShot.showWidgets([w]), widget);
await page.waitForSelector(`.aura-widget-${ID}`, { timeout: 15000 });
await page.waitForTimeout(600);

// The topmost element at the centre of a cell must belong to that cell, not to the image.
const hit = (i) =>
    page.evaluate(
        ({ id, i }) => {
            const el = document.querySelector(`.aura-widget-${id} .aura-custom-cell-${i}`);
            if (!el) return 'missing';
            const r = el.getBoundingClientRect();
            const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
            return el.contains(top) ? 'cell' : (top?.tagName ?? 'none');
        },
        { id: ID, i },
    );
check('1x1 state icon lies above the image', (await hit(5)) === 'cell', await hit(5));
check('1x1 text cell lies above the image', (await hit(10)) === 'cell', await hit(10));
check('1x1 switch lies above the image', (await hit(15)) === 'cell', await hit(15));

await page.locator(`.aura-widget-${ID} .aura-custom-cell-10`).first().click();
await page.waitForTimeout(500);
check('click action of a cell on the image opens', (await page.locator('text=Overlay-Popup').count()) > 0);
await page.keyboard.press('Escape');

// Empty cells stay beneath: the image still answers there.
check('empty slot shows the image', (await hit(6)) !== 'cell', await hit(6));

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
