// JSON table: the sort rule chain (#706), the same one the static list has.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/jsontable-default-sort.mjs
//
// The table used to open in the order of the data, so a log with the oldest entry
// first needed two header clicks every time to get the newest on top. Checked:
//  * sortRules order the rows on open, with and without sortable.
//  * mode 'time' reads dd.MM.yyyy as a date - as text, 2024 would beat 2026 in March.
//  * a second rule only breaks ties; empty cells stay at the end in both directions.
//  * on the leading column a click flips the direction and a second one returns
//    to the chain; another column cycles asc -> desc -> back to the chain, and the
//    chain keeps breaking its ties meanwhile.
//  * a rule on a column the data does not have is skipped.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

let failed = 0;
const check = (name, ok, detail = '') => {
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${ok || !detail ? '' : ` — ${detail}`}`);
    if (!ok) failed++;
};

// German dates: text order (by day) differs from date order on purpose.
const ROWS = [
    { date: '20.03.2024', name: 'b', kwh: 5 },
    { date: '15.01.2026', name: 'c', kwh: 2 },
    { date: '10.07.2025', name: 'a', kwh: 9 },
    { date: '15.01.2026', name: 'd', kwh: 7 },
    { date: '', name: 'e', kwh: 1 },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
await page.evaluate(() => window.__auraShot.captureWrites(true));

let seq = 0;
async function show(options, editMode = false) {
    const id = `jtds${++seq}`;
    const dp = `aura-selftest.0.jsontable-default-sort.d${seq}`;
    await page.evaluate(
        ([wid, dpId, rows, o, edit]) => {
            const json = JSON.stringify(rows);
            window.__auraShot.mock({ [dpId]: json });
            window.__auraShot.mockServerState({ [dpId]: json });
            window.__auraShot.showWidgets(
                [
                    {
                        id: wid,
                        type: 'jsontable',
                        title: 'Sort',
                        datapoint: dpId,
                        layout: 'default',
                        gridPos: { x: 0, y: 0, w: 8, h: 6 },
                        options: { showTitle: false, showIcon: false, ...o },
                    },
                ],
                { editMode: edit },
            );
            if (edit) window.__auraShot.setEditMode(true);
        },
        [id, dp, ROWS, options, editMode],
    );
    const sel = `.aura-widget-${id}`;
    await page.waitForSelector(`${sel} tbody td`);
    await page.waitForTimeout(150);
    return sel;
}
// Name column of every body row - unique, unlike the dates.
const names = (sel) =>
    page.$$eval(`${sel} tbody tr`, (trs) => trs.map((tr) => tr.querySelectorAll('td')[1]?.textContent).join(''));
const click = async (sel, label) => {
    await page.locator(`${sel} th`, { hasText: label }).click();
    await page.waitForTimeout(80);
};
const expect = async (label, sel, want) => {
    const got = await names(sel);
    check(label, got === want, `got ${got}, want ${want}`);
};
const DATE_DESC = { column: 'date', mode: 'time', order: 'desc' };
const KWH_DESC = { column: 'kwh', order: 'desc' };

let sel = await show({});
await expect('without rules the data order stays', sel, 'bcade');

sel = await show({ sortable: true, sortRules: [DATE_DESC, KWH_DESC] });
await expect('date as time, newest first, tie broken by kWh, empty last', sel, 'dcabe');
await click(sel, 'date');
await expect('click on the leading column flips to oldest first, kWh still breaks the tie', sel, 'badce');
await click(sel, 'date');
await expect('second click returns to the chain', sel, 'dcabe');
await click(sel, 'kwh');
await expect('another column sorts asc', sel, 'ecbda');
await click(sel, 'kwh');
await expect('and desc', sel, 'adbce');
await click(sel, 'kwh');
await expect('third click falls back to the chain', sel, 'dcabe');
await click(sel, 'name');
await expect('any other header sorts too', sel, 'abcde');

sel = await show({ sortRules: [{ column: 'date' }] });
await expect('auto mode compares dd.MM.yyyy as text (day first)', sel, 'acdbe');
sel = await show({ sortRules: [{ column: 'date', mode: 'time' }] });
await expect('time mode, asc by default, empty still last', sel, 'bacde');
await click(sel, 'date');
await expect('without sortable a click changes nothing', sel, 'bacde');
sel = await show({ sortRules: [{ column: 'date', mode: 'time', order: 'desc', empty: 'first' }, { column: 'name' }] });
await expect('empty first puts the blank date on top', sel, 'ecdab');

sel = await show({ sortable: true, sortRules: [{ column: 'gone', order: 'desc' }, KWH_DESC] });
await expect('a rule on a missing column is skipped', sel, 'adbce');

// ── The dialog in the editor writes the chain ───────────────────────────────────
sel = await show({}, true);
const wid = `jtds${seq}`;
await page.locator('.aura-edit-chrome button').first().click();
await page.locator('button:text-is("Bearbeiten")').click();
const panel = page.locator('.aura-widget-edit-modal');
await panel.waitFor({ timeout: 10000 });
await panel.locator('button:has-text("Sortierung")').click();
await page.locator('button:has-text("Kriterium hinzufügen")').click();
await page.waitForTimeout(150);
await page.locator('[data-testid="jsontable-sort-column"]').selectOption('date');
await page.locator('[data-testid="jsontable-sort-mode"]').selectOption('time');
await page.locator('button:text-is("Neueste zuerst")').click();
await page.waitForTimeout(250);
const stored = await page.evaluate((id) => window.__auraShot.widgetOptions(id)?.sortRules, wid);
check(
    'the dialog stores the rule',
    JSON.stringify(stored) === JSON.stringify([{ column: 'date', mode: 'time', order: 'desc' }]),
    JSON.stringify(stored),
);
const preview = await page
    .locator('[data-testid="jsontable-sort-preview"] li')
    .evaluateAll((lis) => lis.map((li) => li.querySelectorAll('span')[1]?.textContent));
check('the preview follows the chain', preview.join('|') === 'c|d|a|b|e', preview.join('|'));

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
await browser.close();
console.log(failed === 0 ? '\nJSON table sort rules OK' : `\n${failed} check(s) failed`);
process.exit(failed === 0 ? 0 : 1);
