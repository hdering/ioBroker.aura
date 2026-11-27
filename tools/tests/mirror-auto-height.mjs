// Widget mirror and "Höhe automatisch an Inhalt anpassen" (#1041): a mirror follows
// its source's content height like the source does. Unset it takes the source's
// setting; its own autoHeight true/false overrides that for the mirror alone. The
// mirror measures under its own id, so a narrower mirror of reflowing content grows
// on its own without touching the source's height.
//
//   AURA_IOBROKER_URL=http://127.0.0.1:9 npx vite --host 127.0.0.1 --port 5197
//   AURA_BASE=http://127.0.0.1:5197 node tools/tests/mirror-auto-height.mjs
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
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1400 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });

const blocks = (n) =>
    `<html><head><style>body{margin:0}div{height:40px}</style></head><body>${'<div>x</div>'.repeat(n)}</body></html>`;
const prose =
    '<html><head><style>body{margin:0;font:16px/20px sans-serif}</style></head><body><p style="margin:0">' +
    'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(30) +
    '</p></body></html>';

let scenario = 0;
async function show({ srcOptions, mirrorOptions = {}, srcW = 6, mirrorW = 6, rows = 30 }) {
    scenario += 1;
    const src = `w-mah-src-${scenario}`;
    const mir = `w-mah-mir-${scenario}`;
    await page.evaluate(
        (cfgs) => window.__auraShot.showWidgets(cfgs),
        [
            {
                id: src,
                type: 'html',
                title: 'HTML',
                gridPos: { x: 0, y: 0, w: srcW, h: rows },
                options: { showTitle: false, showIcon: false, ...srcOptions },
            },
            {
                id: mir,
                type: 'mirror',
                title: 'Spiegel',
                gridPos: { x: srcW, y: 0, w: mirrorW, h: rows },
                options: { targetWidgetId: src, ...mirrorOptions },
            },
        ],
    );
    await page.waitForTimeout(1500);
    return page.evaluate(
        ([s, m]) => {
            const h = (id) => {
                const card = document.querySelector(`[data-aura-widget="${id}"]`);
                const item = card?.closest('.react-grid-item') ?? card;
                return item ? Math.round(item.getBoundingClientRect().height) : -1;
            };
            const fr = (id) => {
                const f = document.querySelector(`[data-aura-widget="${id}"] iframe`);
                return f ? Math.round(f.getBoundingClientRect().height) : -1;
            };
            return { src: h(s), mir: h(m), srcFrame: fr(s), mirFrame: fr(m), mirId: m };
        },
        [src, mir],
    );
}

// ── 1. unset: the mirror follows the source's setting ──────────────────────
const follow = await show({ srcOptions: { htmlContent: blocks(10), autoHeight: true } });
check('source on: source shrinks to content', follow.src < boxPx(30), `${follow.src}px`);
check('unset mirror follows the source', follow.mir === follow.src, `${follow.mir} vs ${follow.src}`);
check('mirror frame at content height', follow.mirFrame === 400, `${follow.mirFrame}px`);

const bothOff = await show({ srcOptions: { htmlContent: blocks(10) } });
check('source off: unset mirror keeps its box', bothOff.mir === boxPx(30), `${bothOff.mir}px`);

// ── 2. own setting overrides the source ────────────────────────────────────
const ownOff = await show({
    srcOptions: { htmlContent: blocks(10), autoHeight: true },
    mirrorOptions: { autoHeight: false },
});
check('mirror off: keeps its own box', ownOff.mir === boxPx(30), `${ownOff.mir}px`);
check('mirror off: source still sized to content', ownOff.src < boxPx(30), `${ownOff.src}px`);

const ownOn = await show({
    srcOptions: { htmlContent: blocks(10), autoHeight: false },
    mirrorOptions: { autoHeight: true },
});
check('mirror on: sized to content', ownOn.mir < boxPx(30) && ownOn.mirFrame === 400, `${ownOn.mir}px`);
check('mirror on: source keeps its box', ownOn.src === boxPx(30), `${ownOn.src}px`);

// ── 3. measured apart: a narrower mirror grows on its own ──────────────────
const apart = await show({ srcOptions: { htmlContent: prose, autoHeight: true }, srcW: 8, mirrorW: 3 });
check('narrow mirror taller than its source', apart.mir > apart.src * 1.5, `${apart.src} → ${apart.mir}px`);
const alone = await show({ srcOptions: { htmlContent: prose, autoHeight: true }, srcW: 8, mirrorW: 8 });
check('source height not taken over by the mirror', apart.src === alone.src, `${apart.src} vs ${alone.src}`);

// ── 4. editor: the mirror offers the switch, showing the source's value ────
const ed = await show({ srcOptions: { htmlContent: blocks(10), autoHeight: true } });
await page.evaluate(() => window.__auraShot.setEditMode(true));
await page.waitForTimeout(600);
const card = page.locator(`[data-aura-widget="${ed.mirId}"]`);
await card.hover();
await card.locator('.aura-edit-chrome button').first().click();
await page.locator('button:text-is("Bearbeiten")').click();
await page.waitForTimeout(600);
await page.evaluate(() => window.__auraShot.unfoldSections?.());
await page.waitForTimeout(300);
const dlg = page.locator('.aura-widget-edit-modal');
const toggle = dlg.locator('[data-auto-height-option]');
check('mirror dialog offers the switch', (await toggle.count()) === 1, `${await toggle.count()}`);
if ((await toggle.count()) === 1) {
    const onBg = await toggle.evaluate((el) => el.style.background);
    check('switch shows the inherited "on"', onBg.includes('accent'), onBg);
    await toggle.evaluate((b) => b.click());
    await page.waitForTimeout(300);
    const offBg = await toggle.evaluate((el) => el.style.background);
    check('one click turns it off for the mirror', !offBg.includes('accent'), offBg);
}
await page.keyboard.press('Escape');
await page.evaluate(() => window.__auraShot.setEditMode(false));

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
