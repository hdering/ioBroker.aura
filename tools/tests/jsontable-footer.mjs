// JSON table: the last row as a footer (#938) - a sum row under a printer log.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/jsontable-footer.mjs
//
// The sum row is an ordinary data row, so painting it alone was not enough: sort,
// search and maxRows would move, hide or cut it. Checked:
//  * off: the last row stays in the body, no tfoot.
//  * on: the last row moves to the tfoot with its colours, bold by default, italic on
//    request, and the column format (suffix, decimals) still applies.
//  * a sort rule, a header click, maxRows and a search never touch the footer; the
//    match counter leaves it out.
//  * a single row stays a data row.
//  * pinned: the footer sits at the bottom edge of the scroller; transparent unpins it.
//  * the editor switch (Optik, not "Sichtbare Felder") writes footerRow and opens the
//    sub-options; the header switch and its colours sit next to it.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

let failed = 0;
const check = (name, ok, detail = '') => {
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${ok || !detail ? '' : ` — ${detail}`}`);
    if (!ok) failed++;
};

const ROWS = [
    { job: 'b', g: 12.5 },
    { job: 'c', g: 3 },
    { job: 'a', g: 30.25 },
    { job: 'd', g: 7 },
    { job: 'Σ', g: 52.75 },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
await page.evaluate(() => window.__auraShot.captureWrites(true));

let seq = 0;
async function show(options, { rows = ROWS, editMode = false, h = 6 } = {}) {
    const id = `jtft${++seq}`;
    const dp = `aura-selftest.0.jsontable-footer.d${seq}`;
    await page.evaluate(
        ([wid, dpId, r, o, edit, height]) => {
            const json = JSON.stringify(r);
            window.__auraShot.mock({ [dpId]: json });
            window.__auraShot.mockServerState({ [dpId]: json });
            window.__auraShot.showWidgets(
                [
                    {
                        id: wid,
                        type: 'jsontable',
                        title: 'Footer',
                        datapoint: dpId,
                        layout: 'default',
                        gridPos: { x: 0, y: 0, w: 8, h: height },
                        options: { showTitle: false, showIcon: false, ...o },
                    },
                ],
                { editMode: edit },
            );
            if (edit) window.__auraShot.setEditMode(true);
        },
        [id, dp, rows, options, editMode, h],
    );
    const sel = `.aura-widget-${id}`;
    await page.waitForSelector(`${sel} tbody td`);
    await page.waitForTimeout(150);
    return sel;
}
const bodyJobs = (sel) =>
    page.$$eval(`${sel} tbody tr`, (trs) => trs.map((tr) => tr.querySelector('td')?.textContent).join(''));
const footerTexts = (sel) => page.$$eval(`${sel} tfoot td`, (tds) => tds.map((td) => td.textContent));

let sel = await show({});
check('off: the sum row stays in the body', (await bodyJobs(sel)) === 'bcadΣ', await bodyJobs(sel));
check('off: no tfoot', (await page.$(`${sel} tfoot`)) === null);

const COLS = [{ key: 'job' }, { key: 'g', decimals: 1, suffix: ' g' }];
sel = await show({
    footerRow: true,
    footerBg: 'rgb(10, 20, 30)',
    footerColor: 'rgb(200, 100, 50)',
    footerItalic: true,
    columns: COLS,
});
check('on: the body loses the sum row', (await bodyJobs(sel)) === 'bcad', await bodyJobs(sel));
const ft = await footerTexts(sel);
check(
    'on: the footer holds it, column format applied',
    ft.join('|') === 'Σ|52.8 g' || ft.join('|') === 'Σ|52,8 g',
    ft.join('|'),
);
const st = await page.$eval(`${sel} tfoot td:nth-child(2)`, (td) => {
    const c = getComputedStyle(td);
    return { bg: c.backgroundColor, color: c.color, weight: c.fontWeight, style: c.fontStyle, pos: c.position };
});
check('footer background', st.bg === 'rgb(10, 20, 30)', st.bg);
check('footer text colour', st.color === 'rgb(200, 100, 50)', st.color);
check('bold by default', Number(st.weight) >= 600, st.weight);
check('italic on request', st.style === 'italic', st.style);
check('pinned by default', st.pos === 'sticky', st.pos);

sel = await show({ footerRow: true, footerBold: false });
const w = await page.$eval(`${sel} tfoot td`, (td) => getComputedStyle(td).fontWeight);
check('footerBold false drops the weight', Number(w) < 600, w);

sel = await show({ footerRow: true, sortable: true, sortRules: [{ column: 'g', order: 'desc' }] });
check('a sort rule leaves the footer alone', (await bodyJobs(sel)) === 'abdc', await bodyJobs(sel));
check('…and the footer stays Σ', (await footerTexts(sel))[0] === 'Σ');
await page.locator(`${sel} th`, { hasText: 'job' }).click();
await page.waitForTimeout(80);
check('a header click sorts only the body', (await bodyJobs(sel)) === 'abcd', await bodyJobs(sel));
check('…footer still Σ', (await footerTexts(sel))[0] === 'Σ');

sel = await show({ footerRow: true, maxRows: 2 });
check('maxRows caps the body only', (await bodyJobs(sel)) === 'bc', await bodyJobs(sel));
check('…the footer survives the cap', (await footerTexts(sel))[0] === 'Σ');

sel = await show({ footerRow: true, showSearch: true });
await page.locator(`${sel} input[placeholder="Suchen…"]`).fill('a');
await page.waitForTimeout(150);
check('search filters the body', (await bodyJobs(sel)) === 'a', await bodyJobs(sel));
check('search keeps the footer', (await footerTexts(sel))[0] === 'Σ');
const counter = await page.locator(`${sel} p`, { hasText: '/' }).last().textContent();
check('the counter leaves the footer out', counter?.trim() === '1 / 4', counter ?? '');

sel = await show({ footerRow: true }, { rows: [{ job: 'x', g: 1 }] });
check('a single row stays a data row', (await bodyJobs(sel)) === 'x', await bodyJobs(sel));
check('…and no footer', (await page.$(`${sel} tfoot`)) === null);

// Pinned: a long table in a small tile, the footer sits at the scroller's bottom edge.
const MANY = [...Array.from({ length: 30 }, (_, i) => ({ job: `r${i}`, g: i })), { job: 'Σ', g: 435 }];
sel = await show({ footerRow: true }, { rows: MANY, h: 3 });
const gap = await page.$eval(`${sel} tfoot td`, (td) => {
    const scroller = td.closest('.overflow-auto');
    return scroller ? Math.round(scroller.getBoundingClientRect().bottom - td.getBoundingClientRect().bottom) : 999;
});
check('pinned footer sits at the bottom of the scroller', Math.abs(gap) <= 1, `gap ${gap}px`);
sel = await show({ footerRow: true, transparent: true }, { rows: MANY, h: 3 });
const pos = await page.$eval(`${sel} tfoot td`, (td) => getComputedStyle(td).position);
check('transparent unpins the footer', pos !== 'sticky', pos);

// ── The editor switch ────────────────────────────────────────────────────────────
sel = await show({}, { editMode: true });
const wid = `jtft${seq}`;
await page.locator('.aura-edit-chrome button').first().click();
await page.locator('button:text-is("Bearbeiten")').click();
const panel = page.locator('.aura-widget-edit-modal');
await panel.waitFor({ timeout: 10000 });
// The settings sit in folded sections - unfold them all.
await page.evaluate(() =>
    document
        .querySelectorAll('.aura-widget-edit-modal details[data-aura-config-section]')
        .forEach((d) => (d.open = true)),
);
const footerBox = panel.locator('[data-testid="jsontable-footer"]');
await footerBox.locator('button[role="switch"]').first().click();
await page.waitForTimeout(250);
const stored = await page.evaluate((id) => window.__auraShot.widgetOptions(id)?.footerRow, wid);
check('the switch stores footerRow', stored === true, String(stored));
check(
    'the sub-options open',
    (await footerBox.locator('text=Kursiv').count()) === 1 &&
        (await panel.locator('text=Fußzeile Hintergrund').count()) === 1,
);

const headerBox = panel.locator('[data-testid="jsontable-header"]');
check(
    'header colours shown while the header is on',
    (await headerBox.locator('text=Header-Hintergrund').count()) === 1,
);
await headerBox.locator('button[role="switch"]').first().click();
await page.waitForTimeout(250);
const header = await page.evaluate((id) => window.__auraShot.widgetOptions(id)?.showHeader, wid);
check('the header switch sits under Optik and stores showHeader', header === false, String(header));
check('its colours fold away while it is off', (await headerBox.locator('text=Header-Hintergrund').count()) === 0);
check(
    '"Sichtbare Felder" no longer holds the header switch',
    (await panel.locator('[data-aura-vis-key="showHeader"]').count()) === 0,
);

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
await browser.close();
console.log(failed === 0 ? '\nJSON table footer OK' : `\n${failed} check(s) failed`);
process.exit(failed === 0 ? 0 : 1);
