// JSON table: an HTML column stretched to the column width (#677).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/jsontable-html-fill.mjs
//
// The data is the bar chart from the issue: a <table> of coloured cells, one
// cell per step. Three things matter here:
//  * without the option the cell keeps shrinking to its content — an existing
//    HTML column must not move, whatever its width setting says.
//  * with the option the outermost element gets the full column width, which is
//    what ioBroker.vis paints and what makes the bar readable at all.
//  * the stretch must not depend on the number of cells: a 5-step row and an
//    8-step row have to end at the same x, otherwise the gradient lies.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const eq = (name, got, want) => check(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const bar = (colors) =>
    `<table border=0 cellpadding=0 cellspacing=1><tr>${colors
        .map((c) => `<td bgcolor=${c}>&nbsp;</td>`)
        .join('')}</tr></table>`;

const ROWS = [
    {
        'Monat:': 'September 2026',
        'Verbrauch:': '266.532 kWh',
        'Bar:': bar(['#10ff00', '#2EFE2E', '#64FE2E', '#9AFE2E', '#C8FE2E']),
    },
    {
        'Monat:': 'August 2026',
        'Verbrauch:': '438.737 kWh',
        'Bar:': bar(['#10ff00', '#2EFE2E', '#64FE2E', '#9AFE2E', '#C8FE2E', '#F7FE2E', '#FACC2E', '#FE9A2E']),
    },
];

const DP = 'aura-selftest.0.jsontable-fill.months';
const COL_W = 150;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1000, height: 800 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
await page.evaluate(() => window.__auraShot.captureWrites(true));

// Each mount gets its own widget id: the dev server has no ioBroker behind it,
// so a value injected after the mount would never arrive (see enum-select-size).
let seq = 0;
let SEL = '';

async function show(barCol) {
    const id = `jt${++seq}`;
    SEL = `.aura-widget-${id}`;
    await page.evaluate(
        ([wid, dp, rows, col, colW]) => {
            const json = JSON.stringify(rows);
            window.__auraShot.mock({ [dp]: json });
            window.__auraShot.mockServerState({ [dp]: json });
            window.__auraShot.showWidgets([
                {
                    id: wid,
                    type: 'jsontable',
                    title: 'SV Gesamt',
                    datapoint: dp,
                    layout: 'default',
                    gridPos: { x: 0, y: 0, w: 32, h: 18 },
                    options: {
                        columns: [
                            { key: 'Monat:', order: 0, width: 149 },
                            { key: 'Verbrauch:', order: 1, width: 100 },
                            { key: 'Bar:', order: 2, html: true, width: colW, wrap: false, ...col },
                        ],
                    },
                },
            ]);
        },
        [id, DP, ROWS, barCol, COL_W],
    );
    await page.waitForSelector(`${SEL} table.border-collapse tbody tr td table`, { timeout: 10000 });
    await page.waitForTimeout(300);
    return bars(SEL);
}

/** Width of the HTML bar and of the cell holding it, per row. */
const bars = (sel) =>
    page.evaluate((s) => {
        const rows = [...document.querySelectorAll(`${s} table.border-collapse > tbody > tr`)];
        return rows.map((tr) => {
            const td = tr.children[2];
            const inner = td.querySelector('table');
            const cs = getComputedStyle(td);
            const content = td.getBoundingClientRect().width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
            return {
                cols: [...tr.children].map((c) => Math.round(c.getBoundingClientRect().width)),
                cell: Math.round(td.getBoundingClientRect().width),
                content: Math.round(content),
                bar: inner ? Math.round(inner.getBoundingClientRect().width) : null,
                cells: inner ? inner.querySelectorAll('td').length : 0,
                monat: tr.children[0].textContent,
            };
        });
    }, sel);

// ── 1. Unchanged without the option ──────────────────────────────────────────
const plain = await show({});
eq('both rows render', plain.length, 2);
eq('the first bar has 5 steps', plain[0].cells, 5);
eq('the second bar has 8 steps', plain[1].cells, 8);
check(
    'without the option the bar keeps hugging its content',
    plain[0].bar < plain[0].content / 2,
    `bar ${plain[0].bar} px in ${plain[0].content} px of column`,
);
check(
    'and a longer bar is wider than a shorter one — the old behaviour',
    plain[1].bar > plain[0].bar,
    `5 steps ${plain[0].bar} px, 8 steps ${plain[1].bar} px`,
);

// ── 2. htmlFill hands the bar the whole column ───────────────────────────────
const filled = await show({ htmlFill: true });
check(
    'the bar now fills the column width',
    Math.abs(filled[0].bar - filled[0].content) <= 1,
    `bar ${filled[0].bar} px, column content ${filled[0].content} px`,
);
check(
    'a bar with more steps ends at the same place',
    Math.abs(filled[1].bar - filled[0].bar) <= 1,
    `5 steps ${filled[0].bar} px, 8 steps ${filled[1].bar} px`,
);
check(
    'the steps really did get wider instead of more numerous',
    filled[0].bar > plain[0].bar * 2,
    `plain ${plain[0].bar} px → filled ${filled[0].bar} px`,
);
eq('the step count is untouched', filled[0].cells, 5);

// ── 3. The column layout itself does not move ────────────────────────────────
// The widths stay hints for the auto table layout (a 100 %-wide table hands out
// the slack) — the option must not shift that, only the content inside the cell.
check(
    'the columns keep the widths they had without the option',
    filled[0].cols.join(' ') === plain[0].cols.join(' '),
    `plain [${plain[0].cols}] vs filled [${filled[0].cols}]`,
);

// ── 4. The class is the documented hook, not an inline style ─────────────────
const hook = await page.evaluate((sel) => {
    const span = document.querySelector(`${sel} .aura-html-fill`);
    return { found: !!span, inlineWidth: span ? span.style.width : null };
}, SEL);
check('the cell carries .aura-html-fill', hook.found === true);
eq('the width comes from the stylesheet, so CSS can override it', hook.inlineWidth, '');

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\njsontable-html-fill: ${results.length - failed.length}/${results.length} passed\n`);
process.exit(failed.length ? 1 : 0);
