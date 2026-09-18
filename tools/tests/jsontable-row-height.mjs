// JSON table: the row box follows the configured font size (#678).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/jsontable-row-height.mjs
//
// A row used to reserve 2.3 × its font size for a line of text that is 1.35 × tall:
// the document's paragraph leading (1.5) plus 0.35 em of padding above and below.
// A single 16 px row therefore needed a 37 px content box — more than a small tile
// has — and the card's scroller cut the letters in half, descenders first. The row
// now takes the font's own line box (`normal`) and 0.25 em of padding: 1.85 ×.
//
// Four groups of checks, all measured, none of them a fixed pixel number:
//  * a row grows with the font and stays inside 1.3…2.0 × of it.
//  * a row is the line box plus its padding — no leading on top of that.
//  * a text with descenders paints lower than one without (nothing cuts the "g").
//  * the widget from the report — one 16 px row — shows its full text in a card
//    that the old row height overflowed.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const CAPS = 'TOTAL 1078 KWH';
const DESC = 'Total: 1078 Tage gjpqy';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 900, height: 700 } });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
await page.evaluate(() => window.__auraShot.captureWrites(true));

// A fresh widget id per mount: the dev server has no ioBroker behind it, so a
// value injected after the mount would never reach the widget.
let seq = 0;
async function show(text, fontSize, opts = { gridRowHeight: 20, gridSnapX: 20, gridGap: 10 }, h = 10) {
    const id = `jtrh${++seq}`;
    const dp = `aura-selftest.0.jsontable-row-height.d${seq}`;
    await page.evaluate(
        ([wid, dpId, rows, fs, showOpts, gridH]) => {
            const json = JSON.stringify(rows);
            window.__auraShot.mock({ [dpId]: json });
            window.__auraShot.mockServerState({ [dpId]: json });
            window.__auraShot.showWidgets(
                [
                    {
                        id: wid,
                        type: 'jsontable',
                        title: 'Row height',
                        datapoint: dpId,
                        layout: 'default',
                        gridPos: { x: 0, y: 0, w: 30, h: gridH },
                        options: {
                            showTitle: false,
                            showIcon: false,
                            showHeader: false,
                            striped: false,
                            columns: [{ key: 'Total:', order: 0 }],
                            fontSize: fs,
                        },
                    },
                ],
                showOpts,
            );
        },
        [id, dp, [{ 'Total:': text }], fontSize, opts, h],
    );
    const sel = `.aura-widget-${id}`;
    await page.waitForSelector(`${sel} td`);
    await page.waitForTimeout(250);
    return sel;
}

// Ink rows of an element screenshot: the first and last row that carries a pixel
// clearly off the card background. Analysed in a second page so the dashboard
// stays untouched.
const film = await ctx.newPage();
await film.setContent('<body style="margin:0"></body>');
async function inkBox(sel) {
    const shot = (await page.locator(sel).screenshot()).toString('base64');
    return film.evaluate(async (b64) => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const g = c.getContext('2d');
        g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, c.width, c.height).data;
        // Background = the most frequent colour of the whole card.
        const counts = new Map();
        for (let i = 0; i < d.length; i += 4) {
            const k = `${d[i]},${d[i + 1]},${d[i + 2]}`;
            counts.set(k, (counts.get(k) ?? 0) + 1);
        }
        const bg = [...counts.entries()]
            .sort((a, b) => b[1] - a[1])[0][0]
            .split(',')
            .map(Number);
        let top = -1;
        let bottom = -1;
        for (let y = 0; y < c.height; y++) {
            let n = 0;
            for (let x = 0; x < c.width; x++) {
                const i = (y * c.width + x) * 4;
                if (Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) > 150) n++;
            }
            // A single stray pixel is the card border/rounding, not a letter.
            if (n > 3) {
                if (top < 0) top = y;
                bottom = y;
            }
        }
        return { top, bottom, height: c.height };
    }, shot);
}

async function cellBox(sel) {
    return page.evaluate((s) => {
        const td = document.querySelector(`${s} td`);
        const cs = getComputedStyle(td);
        // The real line box, not the computed keyword: `normal` tells us nothing
        // about the pixels, and that is exactly what has to scale with the font.
        const range = document.createRange();
        range.selectNodeContents(td);
        return {
            h: td.getBoundingClientRect().height,
            lineBox: range.getBoundingClientRect().height,
            padTop: parseFloat(cs.paddingTop),
            padBottom: parseFloat(cs.paddingBottom),
        };
    }, sel);
}

// ── 1. the row grows with the font ────────────────────────────────────────────
const rows = {};
for (const fs of [12, 16, 24]) {
    const sel = await show(DESC, fs);
    rows[fs] = await cellBox(sel);
    console.log(`  fontSize ${fs}: row ${rows[fs].h.toFixed(1)} px, line box ${rows[fs].lineBox.toFixed(1)} px`);
}
check(
    'row height grows with the font size',
    rows[24].h > rows[16].h && rows[16].h > rows[12].h,
    `12→${rows[12].h.toFixed(1)}, 16→${rows[16].h.toFixed(1)}, 24→${rows[24].h.toFixed(1)}`,
);
for (const fs of [12, 16, 24]) {
    const ratio = rows[fs].h / fs;
    check(
        `row at ${fs} px stays inside 1.3…2.0 × the font size`,
        ratio >= 1.3 && ratio <= 2.0,
        `ratio ${ratio.toFixed(2)}`,
    );
}
// The regression this guards: with the inherited leading the line box was the same
// absolute number at every font size.
const boxRatio = rows[24].lineBox / rows[12].lineBox;
check(
    'the line box scales with the font size',
    Math.abs(boxRatio - 2) <= 0.15,
    `12 px → ${rows[12].lineBox.toFixed(1)}, 24 px → ${rows[24].lineBox.toFixed(1)} (ratio ${boxRatio.toFixed(2)})`,
);

// ── 2. no dead leading: the row is the line box plus its padding ─────────────
for (const fs of [12, 16, 24]) {
    const r = rows[fs];
    check(
        `row at ${fs} px is the line box plus its padding`,
        Math.abs(r.h - (r.lineBox + r.padTop + r.padBottom)) <= 1.5,
        `row ${r.h.toFixed(1)}, line box ${r.lineBox.toFixed(1)}, padding ${r.padTop}+${r.padBottom}`,
    );
    check(
        `the line box at ${fs} px carries no dead leading`,
        r.lineBox <= fs * 1.45,
        `line box ${r.lineBox.toFixed(1)} px at font ${fs} px`,
    );
}

// ── 3. descenders are painted, not cut ───────────────────────────────────────
const capsSel = await show(CAPS, 24);
const capsInk = await inkBox(capsSel);
const descSel = await show(DESC, 24);
const descInk = await inkBox(descSel);
check(
    'a descender paints below the baseline',
    descInk.bottom - capsInk.bottom >= 3,
    `caps end at ${capsInk.bottom}, descenders at ${descInk.bottom}`,
);
check(
    'both texts start at the same height',
    Math.abs(descInk.top - capsInk.top) <= 1,
    `caps ${capsInk.top}, descenders ${descInk.top}`,
);

// ── 4. the widget from the report ────────────────────────────────────────────
// One 16 px row on a fine grid (10 px cells, 10 px gaps) with a small card padding:
// four grid rows give a 32 px content box. The old row wanted 33 px and was cut,
// the new one needs 29.5 px and fits.
const TIGHT = { gridRowHeight: 5, gridSnapX: 5, gridGap: 10, widgetPadding: 8 };
const refSel = await show(DESC, 16);
const refInk = await inkBox(refSel);
const tightSel = await show(DESC, 16, TIGHT, 4);
const tightInk = await inkBox(tightSel);
const tightBox = await page.evaluate((s) => {
    const el = document.querySelector(`${s} .overflow-auto`);
    return { visible: el.clientHeight, needed: el.scrollHeight };
}, tightSel);
check(
    'a 16 px row fits the small card',
    tightBox.needed <= tightBox.visible,
    `row needs ${tightBox.needed} px, card offers ${tightBox.visible} px`,
);
check(
    'the text is painted in full there',
    tightInk.bottom - tightInk.top === refInk.bottom - refInk.top,
    `tight card ${tightInk.bottom - tightInk.top + 1} px of ink, roomy card ${refInk.bottom - refInk.top + 1} px`,
);

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
