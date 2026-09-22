// JSON table: a column formats its value in the running app (issue #697).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/jsontable-cell-format-ui.mjs
//
// The pure formatter has its own checks (tools/tests/jsontable-cell-format.mjs); what is
// measured here is the wiring: the configured format reaches the rendered cell, leaves the
// neighbouring column alone, keeps a suffix around the formatted text, still finds the row
// by its raw timestamp in the search, sorts by the raw value rather than the printed date —
// and the column card in the editor offers the f(x) popover with a live preview.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// 2024-07-10 / 2023-01-05 00:00 local time — the issue's example, plus an older row.
const MS_NEW = new Date(2024, 6, 10, 0, 0, 0).getTime();
const MS_OLD = new Date(2023, 0, 5, 0, 0, 0).getTime();
const ROWS = [
    { name: 'Heizung', ts: MS_NEW, wh: 1234 },
    { name: 'Keller', ts: MS_OLD, wh: 98765 },
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
await page.evaluate(() => window.__auraShot.captureWrites(true));

// A fresh widget id per mount: without an ioBroker behind the dev server a value
// injected after the mount would never reach the widget.
let seq = 0;
async function show(columns, options = {}, editMode = false) {
    const id = `jtcf${++seq}`;
    const dp = `aura-selftest.0.jsontable-cell-format.d${seq}`;
    await page.evaluate(
        ([wid, dpId, rows, cols, opts, edit]) => {
            const json = JSON.stringify(rows);
            window.__auraShot.mock({ [dpId]: json });
            window.__auraShot.mockServerState({ [dpId]: json });
            window.__auraShot.showWidgets(
                [
                    {
                        id: wid,
                        type: 'jsontable',
                        title: 'Format',
                        datapoint: dpId,
                        layout: 'default',
                        gridPos: { x: 0, y: 0, w: 30, h: 10 },
                        options: { columns: cols, ...opts },
                    },
                ],
                { editMode: edit },
            );
            if (edit) window.__auraShot.setEditMode(true);
        },
        [id, dp, ROWS, columns, options, editMode],
    );
    const sel = `.aura-widget-${id}`;
    await page.waitForSelector(`${sel} td`, { timeout: 15000 });
    await page.waitForTimeout(250);
    return sel;
}

/** Text of every body cell, row by row. */
const bodyText = (sel) =>
    page
        .locator(`${sel} tbody tr`)
        .evaluateAll((trs) => trs.map((tr) => [...tr.cells].map((c) => c.textContent.trim())));

// ── The value reaches the cell formatted ────────────────────────────────────────
{
    const sel = await show([
        { key: 'name', order: 0 },
        { key: 'ts', order: 1, valueTimeFormat: 'date' },
        { key: 'wh', order: 2 },
    ]);
    const cells = await bodyText(sel);
    check('ms timestamp prints as a date', cells[0][1] === '10.07.2024', cells[0][1]);
    check('the second row too', cells[1][1] === '05.01.2023', cells[1][1]);
    check('the untouched column stays raw', cells[0][2] === '1234', cells[0][2]);
    check('a text column stays text', cells[0][0] === 'Heizung', cells[0][0]);
}

// ── Conversion + decimals + suffix stack up ─────────────────────────────────────
{
    const sel = await show([
        { key: 'name', order: 0 },
        { key: 'ts', order: 1, valueTimeFormat: 'datetime' },
        { key: 'wh', order: 2, valueFactor: 0.001, decimals: 2, suffix: ' kWh' },
    ]);
    const cells = await bodyText(sel);
    check('Wh converts to kWh with its suffix', cells[0][2] === '1.23 kWh', cells[0][2]);
    check('date + time', cells[0][1] === '10.07.2024 00:00', cells[0][1]);
}

// ── Search and sort still work off the raw value ────────────────────────────────
{
    const sel = await show(
        [
            { key: 'name', order: 0 },
            { key: 'ts', order: 1, valueTimeFormat: 'date' },
        ],
        { showSearch: true, sortable: true },
    );
    const input = page.locator(`${sel} input[placeholder="Suchen…"]`).first();
    await input.fill('10.07.2024');
    await page.waitForTimeout(150);
    let rows = await bodyText(sel);
    check('the printed date is searchable', rows.length === 1 && rows[0][0] === 'Heizung', JSON.stringify(rows));
    await input.fill(String(MS_NEW));
    await page.waitForTimeout(150);
    rows = await bodyText(sel);
    check('the raw timestamp is searchable too', rows.length === 1 && rows[0][0] === 'Heizung', JSON.stringify(rows));
    await input.fill('');
    await page.waitForTimeout(150);

    // "05.01.2023" sorts after "10.07.2024" as text but before it as a number — an
    // ascending sort that puts Keller first proves the raw value is compared.
    await page.locator(`${sel} thead th`).nth(1).click();
    await page.waitForTimeout(200);
    rows = await bodyText(sel);
    check('sorting compares the raw value', rows[0][0] === 'Keller', JSON.stringify(rows));
}

// ── The editor offers the format popover ────────────────────────────────────────
{
    await show(
        [
            { key: 'name', order: 0 },
            { key: 'ts', order: 1 },
        ],
        {},
        true,
    );
    await page.locator('.aura-edit-chrome button').first().click();
    await page.locator('button:text-is("Bearbeiten")').click();
    const dlg = page.locator('.aura-widget-edit-modal');
    await dlg.waitFor({ timeout: 10000 });

    const fx = dlg.locator('button[title*="Umrechnung"]');
    check('every text column offers the f(x) button', (await fx.count()) === 2, `${await fx.count()}`);

    await fx.nth(1).click();
    const pop = page.locator('div:has(> div > span:text-is("Wert-Umrechnung / Zeit"))').last();
    await pop.waitFor({ timeout: 5000 });
    const timeSel = pop.locator('select').last();
    await timeSel.selectOption('date');
    await page.waitForTimeout(250);

    const preview = (await pop.locator('p:has-text("Vorschau:")').first().textContent()) ?? '';
    check('the popover previews the sample cell', preview.includes('10.07.2024'), preview.trim());

    const stored = await page.evaluate(() => window.__auraShot.widgetOptions('jtcf4')?.columns?.[1]);
    check('the pick lands on the column', stored?.valueTimeFormat === 'date', JSON.stringify(stored));
}

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(failed.length === 0 ? '\nAll JSON table format checks OK' : `\n${failed.length} check(s) failed`);
process.exit(failed.length === 0 ? 0 : 1);
