// HTML widget with "Höhe automatisch an Inhalt anpassen" (#884): the sandboxed
// document reports its own height (utils/htmlBridge SIZE_SCRIPT), the iframe takes
// it and the Dashboard sizes the grid item — growing and shrinking with the content,
// also with htmlApi off. A sandbox without scripts leaves the option without effect
// and greys the toggle out.
//
//   AURA_IOBROKER_URL=http://127.0.0.1:9 npx vite --host 127.0.0.1 --port 5197
//   AURA_BASE=http://127.0.0.1:5197 node tools/tests/html-auto-height.mjs
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const ROW = 20; // gridRowHeight of the harness layout
const GAP = 10;
const boxPx = (rows) => rows * ROW + (rows - 1) * GAP;

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });

/** `n` blocks of 40 px, no body margin: the document is exactly n × 40 px tall. */
const blocks = (n) =>
    `<html><head><style>body{margin:0}div{height:40px}</style></head><body>${'<div>x</div>'.repeat(n)}</body></html>`;
const prose =
    '<html><head><style>body{margin:0;font:16px/20px sans-serif}</style></head><body><p style="margin:0">' +
    'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(30) +
    '</p></body></html>';

let scenario = 0;
async function show(options, { rows = 6, w = 6 } = {}) {
    scenario += 1;
    const id = `w-html-ah-${scenario}`;
    await page.evaluate(
        ([cfg]) => window.__auraShot.showWidgets([cfg]),
        [
            {
                id,
                type: 'html',
                title: 'HTML',
                gridPos: { x: 0, y: 0, w, h: rows },
                options: { showTitle: false, showIcon: false, ...options },
            },
        ],
    );
    await page.waitForTimeout(1500);
    const m = await page.evaluate((wid) => {
        const card = document.querySelector(`[data-aura-widget="${wid}"]`);
        const item = card?.closest('.react-grid-item') ?? card;
        const frame = card?.querySelector('iframe');
        return {
            item: item ? Math.round(item.getBoundingClientRect().height) : -1,
            frame: frame ? Math.round(frame.getBoundingClientRect().height) : -1,
        };
    }, id);
    return { id, ...m };
}

// ── 1. off keeps the box; on follows the document, both directions ─────────
const off = await show({ htmlContent: blocks(10), autoHeight: false }, { rows: 30 });
check('off keeps the stored box', off.item === boxPx(30), `${off.item}px`);
const tall = await show({ htmlContent: blocks(10), autoHeight: true }, { rows: 30 });
check('on: frame is as tall as the document', tall.frame === 400, `${tall.frame}px`);
check('on: shrinks a too-tall box', tall.item > 400 && tall.item < boxPx(30), `${tall.item}px`);
const short = await show({ htmlContent: blocks(10), autoHeight: true }, { rows: 1 });
check('on: grows a too-short box', short.item >= 400, `${short.item}px`);
check('same content, same height', Math.abs(short.item - tall.item) <= 1, `${short.item} vs ${tall.item}`);

// ── 2. more content → taller; htmlApi off still reports ───────────────────
const more = await show({ htmlContent: blocks(20), autoHeight: true });
check('more content, taller frame', more.frame === 800, `${more.frame}px`);
const noApi = await show({ htmlContent: blocks(5), autoHeight: true, htmlApi: false });
check('htmlApi false: still sized to content', noApi.frame === 200, `${noApi.frame}px`);

// ── 3. reflowing text: narrower tile, taller frame ─────────────────────────
const wide = await show({ htmlContent: prose, autoHeight: true }, { w: 12 });
const narrow = await show({ htmlContent: prose, autoHeight: true }, { w: 3 });
check('narrow tile grows with the reflowed text', narrow.frame > wide.frame * 2, `${wide.frame} → ${narrow.frame}px`);
check('no inner scrollbar at fit height', narrow.item >= narrow.frame, `${narrow.item} / ${narrow.frame}`);

// ── 4. live content change resizes the same widget ─────────────────────────
await page.evaluate(
    (m) => {
        window.__auraShot.mockServerState(m);
        window.__auraShot.mock(m);
    },
    { 'test.html': { val: blocks(4) } },
);
const live = await show({ htmlDatapoint: 'test.html', autoHeight: true });
check('datapoint content sized', live.frame === 160, `${live.frame}px`);

// ── 5. sandbox without scripts: no effect, toggle greyed out ───────────────
const noScripts = await show(
    { htmlContent: blocks(10), autoHeight: true, sandboxPreset: 'custom', sandboxCustom: 'allow-forms' },
    { rows: 30 },
);
check('no scripts: keeps the stored box', noScripts.item === boxPx(30), `${noScripts.item}px`);

await page.evaluate(() => window.__auraShot.setEditMode(true));
await page.waitForTimeout(600);
const card = page.locator(`[data-aura-widget="${noScripts.id}"]`);
await card.hover();
await card.locator('.aura-edit-chrome button').first().click();
await page.locator('button:text-is("Bearbeiten")').click();
await page.waitForTimeout(600);
await page.evaluate(() => window.__auraShot.unfoldSections?.());
await page.waitForTimeout(300);
const dlg = page.locator('.aura-widget-edit-modal');
const greyed = await dlg.locator('fieldset[disabled] [data-auto-height-option]').count();
check('no scripts: toggle greyed out with reason', greyed === 1, `${greyed}`);
await page.keyboard.press('Escape');
await page.evaluate(() => window.__auraShot.setEditMode(false));

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
