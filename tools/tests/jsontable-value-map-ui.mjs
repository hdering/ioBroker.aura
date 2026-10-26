// JSON table: a column maps values to icon / text / colour (issue #852).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/jsontable-value-map-ui.mjs
//
// The matching itself has pure checks (tools/tests/jsontable-cell-format.mjs). Measured
// here is the wiring: a call list's type 1/2/3 shows the entry's icon in its colour, an
// entry with text prints the text, an unmapped value stays as it was, the search finds
// the entry text — and the column card offers the "Zuordnung" switch with its popup.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const ROWS = [
    { name: 'Anna', type: 1, ok: true },
    { name: 'Bernd', type: 2, ok: false },
    { name: 'Carla', type: 3, ok: true },
    { name: 'Dora', type: 9, ok: true },
];
const MAP = [
    { value: '1', label: '', icon: 'mdi:phone-incoming', color: '#22c55e' },
    { value: '2', label: 'entgangen', icon: 'mdi:phone-missed', color: '#ef4444' },
    { value: '3', label: 'raus', color: '#3b82f6' },
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
await page.evaluate(() => window.__auraShot.captureWrites(true));

let seq = 0;
async function show(columns, options = {}, editMode = false) {
    const id = `jtvm${++seq}`;
    const dp = `aura-selftest.0.jsontable-value-map.d${seq}`;
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
                        title: 'Anrufe',
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
    return { sel, id };
}

const bodyText = (sel) =>
    page
        .locator(`${sel} tbody tr`)
        .evaluateAll((trs) => trs.map((tr) => [...tr.cells].map((c) => c.textContent.trim())));

// ── The mapping reaches the cells ────────────────────────────────────────────────
{
    const { sel } = await show(
        [
            { key: 'name', order: 0 },
            { key: 'type', order: 1, mapValues: true, valueMap: MAP },
            { key: 'ok', order: 2, mapValues: true, valueMap: [{ value: 'false', label: 'nein', color: '#ef4444' }] },
        ],
        { showSearch: true },
    );
    const cells = await bodyText(sel);
    const typeCell = (r) => page.locator(`${sel} tbody tr`).nth(r).locator('td').nth(1);

    const icon0 = typeCell(0).locator('.aura-jsontable-mapped svg');
    check('icon-only entry draws its icon', (await icon0.count()) === 1);
    check('and no text', cells[0][1] === '', JSON.stringify(cells[0][1]));
    const col0 = await typeCell(0)
        .locator('.aura-jsontable-mapped')
        .evaluate((el) => getComputedStyle(el).color);
    check('in the entry colour', col0 === 'rgb(34, 197, 94)', col0);

    check('icon + text entry prints its text', cells[1][1] === 'entgangen', cells[1][1]);
    check('next to its icon', (await typeCell(1).locator('.aura-jsontable-mapped svg').count()) === 1);

    check('text-only entry replaces the value', cells[2][1] === 'raus', cells[2][1]);
    const col2 = await typeCell(2)
        .locator('span')
        .first()
        .evaluate((el) => getComputedStyle(el).color);
    check('coloured too', col2 === 'rgb(59, 130, 246)', col2);

    check('an unmapped value stays as it was', cells[3][1] === '9', cells[3][1]);
    check('a boolean meets "false"', cells[1][2] === 'nein', cells[1][2]);
    check('an unmapped boolean keeps its tick', cells[0][2] === '✓', cells[0][2]);

    const input = page.locator(`${sel} input[placeholder="Suchen…"]`).first();
    await input.fill('entgangen');
    await page.waitForTimeout(150);
    const rows = await bodyText(sel);
    check('the entry text is searchable', rows.length === 1 && rows[0][0] === 'Bernd', JSON.stringify(rows));
}

// ── Switch off: the cells print the raw value again, the entries stay ───────────
{
    const { sel } = await show([
        { key: 'name', order: 0 },
        { key: 'type', order: 1, mapValues: false, valueMap: MAP },
    ]);
    const cells = await bodyText(sel);
    check('switched off, the raw value prints', cells[1][1] === '2', cells[1][1]);
}

// ── The editor: switch + popup ───────────────────────────────────────────────────
{
    const { id } = await show(
        [
            { key: 'name', order: 0 },
            { key: 'type', order: 1, iconify: true },
        ],
        {},
        true,
    );
    await page.locator('.aura-edit-chrome button').first().click();
    await page.locator('button:text-is("Bearbeiten")').click();
    const dlg = page.locator('.aura-widget-edit-modal');
    await dlg.waitFor({ timeout: 10000 });
    await page.evaluate(() =>
        document
            .querySelectorAll('.aura-widget-edit-modal details[data-aura-config-section]')
            .forEach((d) => (d.open = true)),
    );

    const cards = dlg.locator('div:has(> div > label > span:text-is("Zuordnung"))');
    check('every text column offers the switch', (await cards.count()) === 2, `${await cards.count()}`);
    const card = cards.nth(1);
    check('no edit button while off', (await card.locator('button:has-text("Zuordnungen bearbeiten")').count()) === 0);

    await card.locator('label:has(span:text-is("Zuordnung"))').click();
    await page.waitForTimeout(250);
    const opts = () => page.evaluate((w) => window.__auraShot.widgetOptions(w)?.columns?.[1], id);
    let col = await opts();
    check('the switch lands on the column', col?.mapValues === true, JSON.stringify(col));
    check('and hides the Icons switch', (await card.locator('label:has(span:text-is("Icons"))').count()) === 0);

    await card.locator('button:has-text("Zuordnungen bearbeiten (0)")').click();
    await page.locator('text=Zuordnung: type').waitFor({ timeout: 5000 });
    await page.locator('button:has-text("Eintrag hinzufügen")').last().click();
    await page.waitForTimeout(150);
    await page.locator('input[placeholder="Wert"]').last().fill('2');
    await page.waitForTimeout(350);
    col = await opts();
    check(
        'an entry added in the popup lands on the column',
        col?.valueMap?.length === 1 && col.valueMap[0].value === '2',
        JSON.stringify(col?.valueMap),
    );

    // Import from common.states of the table's datapoint (prefilled): the existing "2"
    // gets its text, 1 and 3 are appended.
    await page.evaluate(
        (dp) =>
            window.__auraShot.mockObject({
                [dp]: {
                    _id: dp,
                    type: 'state',
                    common: { name: 'Anrufe', states: '1:eingehend;2:entgangen;3:ausgehend' },
                },
            }),
        `aura-selftest.0.jsontable-value-map.d${seq}`,
    );
    await page.locator('button:text-is("Importieren")').click();
    await page.waitForTimeout(400);
    col = await opts();
    check(
        'common.states import merges into the list',
        JSON.stringify(col?.valueMap?.map((e) => [e.value, e.label])) ===
            JSON.stringify([
                ['2', 'entgangen'],
                ['1', 'eingehend'],
                ['3', 'ausgehend'],
            ]),
        JSON.stringify(col?.valueMap),
    );
    const status = (await page.locator('p:has-text("neu hinzugefügt")').count()) === 1;
    check('and reports what it added', status);
    if (process.env.AURA_SHOT_DIR)
        await page.screenshot({ path: `${process.env.AURA_SHOT_DIR}/jsontable-value-map.png` });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    check(
        'the button counts the entries',
        (await card.locator('button:has-text("Zuordnungen bearbeiten (3)")').count()) === 1,
    );

    // Picking Bild switches the mapping off, the entries survive.
    await card.locator('label:has(span:text-is("Bild"))').click();
    await page.waitForTimeout(250);
    col = await opts();
    check(
        'Bild switches the mapping off, entries kept',
        col?.mapValues === false && col?.valueMap?.length === 3,
        JSON.stringify(col),
    );
}

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(failed.length === 0 ? '\nAll JSON table value map checks OK' : `\n${failed.length} check(s) failed`);
process.exit(failed.length === 0 ? 0 : 1);
