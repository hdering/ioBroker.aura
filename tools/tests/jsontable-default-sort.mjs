// JSON table: a preset sort column and direction (#706).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/jsontable-default-sort.mjs
//
// The table used to open in the order of the data, so a log with the oldest entry
// first needed two header clicks every time to get the newest on top. Checked:
//  * defaultSortKey/defaultSortDir order the rows on open, with and without sortable.
//  * on the default column a click flips the direction and a second one returns
//    to the default - "off" there is the default, not the data order.
//  * another column cycles asc -> desc -> back to the default.
//  * a key that is not in the data leaves the order alone.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

let failed = 0;
const check = (name, ok, detail = '') => {
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${ok || !detail ? '' : ` — ${detail}`}`);
    if (!ok) failed++;
};

const ROWS = [
    { date: '2024-03-01', name: 'b', kwh: 5 },
    { date: '2026-01-15', name: 'c', kwh: 2 },
    { date: '2025-07-10', name: 'a', kwh: 9 },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
await page.evaluate(() => window.__auraShot.captureWrites(true));

let seq = 0;
async function show(options) {
    const id = `jtds${++seq}`;
    const dp = `aura-selftest.0.jsontable-default-sort.d${seq}`;
    await page.evaluate(
        ([wid, dpId, rows, o]) => {
            const json = JSON.stringify(rows);
            window.__auraShot.mock({ [dpId]: json });
            window.__auraShot.mockServerState({ [dpId]: json });
            window.__auraShot.showWidgets([
                {
                    id: wid,
                    type: 'jsontable',
                    title: 'Sort',
                    datapoint: dpId,
                    layout: 'default',
                    gridPos: { x: 0, y: 0, w: 8, h: 6 },
                    options: { showTitle: false, showIcon: false, ...o },
                },
            ]);
        },
        [id, dp, ROWS, options],
    );
    const sel = `.aura-widget-${id}`;
    await page.waitForSelector(`${sel} tbody td`);
    await page.waitForTimeout(150);
    return sel;
}
// First column of every body row = the date.
const dates = (sel) => page.$$eval(`${sel} tbody tr`, (trs) => trs.map((tr) => tr.querySelector('td')?.textContent));
const click = async (sel, label) => {
    await page.locator(`${sel} th`, { hasText: label }).click();
    await page.waitForTimeout(80);
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const NEWEST = ['2026-01-15', '2025-07-10', '2024-03-01'];
const OLDEST = [...NEWEST].reverse();
const DATA = ROWS.map((r) => r.date);

let sel = await show({});
check('without a default the data order stays', same(await dates(sel), DATA), JSON.stringify(await dates(sel)));

sel = await show({ sortable: true, defaultSortKey: 'date', defaultSortDir: 'desc' });
check('default date desc puts the newest on top', same(await dates(sel), NEWEST), JSON.stringify(await dates(sel)));
await click(sel, 'date');
check('click on the default column flips to asc', same(await dates(sel), OLDEST), JSON.stringify(await dates(sel)));
await click(sel, 'date');
check('second click returns to the default', same(await dates(sel), NEWEST), JSON.stringify(await dates(sel)));
await click(sel, 'kwh');
check(
    'another column sorts asc',
    same(await dates(sel), ['2026-01-15', '2024-03-01', '2025-07-10']),
    JSON.stringify(await dates(sel)),
);
await click(sel, 'kwh');
check('and desc', same(await dates(sel), ['2025-07-10', '2024-03-01', '2026-01-15']), JSON.stringify(await dates(sel)));
await click(sel, 'kwh');
check('third click falls back to the default', same(await dates(sel), NEWEST), JSON.stringify(await dates(sel)));

sel = await show({ defaultSortKey: 'date' });
check(
    'default applies without sortable, asc by default',
    same(await dates(sel), OLDEST),
    JSON.stringify(await dates(sel)),
);
await click(sel, 'date');
check('without sortable a click changes nothing', same(await dates(sel), OLDEST), JSON.stringify(await dates(sel)));

sel = await show({ sortable: true, defaultSortKey: 'gone', defaultSortDir: 'desc' });
check('an unknown key leaves the data order', same(await dates(sel), DATA), JSON.stringify(await dates(sel)));

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
await browser.close();
console.log(failed === 0 ? '\nJSON table default sort OK' : `\n${failed} check(s) failed`);
process.exit(failed === 0 ? 0 : 1);
