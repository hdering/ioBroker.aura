// JSON table: a row click opens a popup that knows the clicked row (issue #858).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/jsontable-row-popup-ui.mjs
//
// The token builder has pure checks (tools/tests/jsontable-cell-format.mjs). Measured
// here is the wiring: rows are inert until an action is set, a click opens exactly one
// popup titled with the row's first cell, an HTML popup and a popup view both resolve
// {{row_<key>}} / {{rowtext_<key>}} of THAT row — hidden columns included — and the
// editor offers "Klick auf Zeile" without the role-derived "Automatisch".
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const MS_A = new Date(2024, 6, 10, 0, 0, 0).getTime();
const MS_B = new Date(2023, 0, 5, 0, 0, 0).getTime();
const ROWS = [
    { ts: MS_A, msg: 'Pumpe an', detail: 'Druck 2,1 bar' },
    { ts: MS_B, msg: 'Pumpe aus', detail: 'Trockenlauf' },
];
const COLUMNS = [
    { key: 'ts', order: 0, valueTimeFormat: 'date' },
    { key: 'msg', order: 1 },
    { key: 'detail', order: 2, hidden: true },
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
async function show(options = {}, editMode = false) {
    const id = `jtrp${++seq}`;
    const dp = `aura-selftest.0.jsontable-row-popup.d${seq}`;
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
                        title: 'Protokoll',
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
        [id, dp, ROWS, COLUMNS, options, editMode],
    );
    const sel = `.aura-widget-${id}`;
    await page.waitForSelector(`${sel} td`, { timeout: 15000 });
    await page.waitForTimeout(250);
    return { sel, id };
}

const popups = () => page.locator('[data-aura-click-popup]');
const popupText = async () => ((await popups().count()) > 0 ? await popups().first().innerText() : '');
const closePopup = async () => {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
};

// ── Unconfigured: rows stay inert ────────────────────────────────────────────────
{
    const { sel } = await show();
    await page.locator(`${sel} tbody tr`).nth(1).click();
    await page.waitForTimeout(300);
    check('without an action a row click opens nothing', (await popups().count()) === 0);
    const cursor = await page
        .locator(`${sel} tbody tr`)
        .nth(1)
        .evaluate((el) => getComputedStyle(el).cursor);
    check('and the row is no pointer target', cursor !== 'pointer', cursor);
}

// ── HTML popup: tokens of the clicked row ────────────────────────────────────────
{
    const { sel } = await show({
        rowClickAction: {
            kind: 'popup-html',
            html: '<p>T={{rowtext_ts}};R={{row_ts}};M={{row_msg}};D={{row_detail}};X={{row_unknown}}</p>',
        },
    });
    const row = page.locator(`${sel} tbody tr`).nth(1);
    check(
        'a configured row is a pointer target',
        (await row.evaluate((el) => getComputedStyle(el).cursor)) === 'pointer',
    );
    await row.click();
    await page.waitForTimeout(400);
    check('a row click opens exactly one popup', (await popups().count()) === 1, `${await popups().count()}`);
    const text = await popupText();
    check('the heading is the first cell as printed', text.trim().startsWith('05.01.2023'), text);
    check('{{rowtext_ts}} is the formatted date', text.includes('T=05.01.2023;'), text);
    check('{{row_ts}} is the raw timestamp', text.includes(`R=${MS_B};`), text);
    check('{{row_msg}} is the clicked row, not the first', text.includes('M=Pumpe aus;'), text);
    check('a hidden column is available too', text.includes('D=Trockenlauf;'), text);
    check('an unknown token stays visible', text.includes('X={{row_unknown}}'), text);
    await closePopup();
    check('Escape closes it', (await popups().count()) === 0);
}

// ── Popup view: the widgets inside resolve the tokens, and a popup title too ─────
{
    await page.evaluate(() =>
        window.__auraShot.popupViews([
            {
                id: 'pv-jtrp',
                name: 'Protokoll-Detail',
                widgets: [
                    {
                        id: 'pv-jtrp-w1',
                        type: 'value',
                        title: 'Detail: {{row_detail}}',
                        datapoint: 'aura-selftest.0.jsontable-row-popup.none',
                        layout: 'default',
                        gridPos: { x: 0, y: 0, w: 8, h: 3 },
                        options: {},
                    },
                ],
            },
        ]),
    );
    const { sel } = await show({
        rowClickAction: { kind: 'popup-view', viewId: 'pv-jtrp' },
        rowPopupTitle: 'Eintrag {{rowtext_ts}}',
    });
    await page.locator(`${sel} tbody tr`).nth(0).click();
    await page.waitForTimeout(500);
    const text = await popupText();
    check('a popup view resolves the row token', text.includes('Detail: Druck 2,1 bar'), text);
    check('the popup title resolves it too', text.includes('Eintrag 10.07.2024'), text);
    await closePopup();
}

// ── Editor: "Klick auf Zeile" without "Automatisch", token hint listed ──────────
{
    const { id } = await show({}, true);
    await page.locator('.aura-edit-chrome button').first().click();
    await page.locator('button:text-is("Bearbeiten")').click();
    const dlg = page.locator('.aura-widget-edit-modal');
    await dlg.waitFor({ timeout: 10000 });
    await page.evaluate(() =>
        document
            .querySelectorAll('.aura-widget-edit-modal details[data-aura-config-section]')
            .forEach((d) => (d.open = true)),
    );
    check('the panel offers "Klick auf Zeile"', (await dlg.locator('label:text-is("Klick auf Zeile")').count()) === 1);
    check('without "Automatisch"', (await dlg.locator('button:text-is("Automatisch")').count()) === 0);
    await dlg.locator('button:text-is("Eigene Aktion")').click();
    await page.waitForTimeout(300);
    const stored = await page.evaluate((w) => window.__auraShot.widgetOptions(w)?.rowClickAction, id);
    check(
        '"Eigene Aktion" starts from an HTML popup with every field',
        stored?.kind === 'popup-html' &&
            ['ts', 'msg', 'detail'].every((k) => stored.html.includes('{{rowtext_' + k + '}}')),
        JSON.stringify(stored),
    );
    const hint = (await dlg.locator('p.font-mono:has-text("{{row_ts}}")').count()) === 1;
    check('the hint lists the row tokens of the data', hint);
    if (process.env.AURA_SHOT_DIR)
        await dlg
            .locator('[data-aura-config-section="behavior"]')
            .last()
            .screenshot({ path: `${process.env.AURA_SHOT_DIR}/jsontable-row-click.png` });
}

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(failed.length === 0 ? '\nAll JSON table row popup checks OK' : `\n${failed.length} check(s) failed`);
process.exit(failed.length === 0 ? 0 : 1);
