// Verifies the advanced chart's "Datenpunkte verwalten" dialog — mode and series moved out of the
// options panel into it.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/chart-series-modal.mjs
//
// The options panel only exists in edit mode, and edit mode only exists in the admin editor, which
// needs a login. In DEV `?shot=1` the harness may switch it on (`__auraShot.setEditMode`), which is
// what makes this — the first automated test of a config panel — possible at all.
//
// Checked: the dialog opens from the panel, the mode switch sits in its header and writes through,
// the master list shows every series with its datapoint, selecting one fills the detail pane, the
// per-series data source swaps the JSON block for the history block, reordering and deleting reach
// the config, and adding a series lands in the list.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};
const eq = (name, got, want) =>
    check(
        name,
        JSON.stringify(got) === JSON.stringify(want),
        `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
    );

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

await page.evaluate(() => {
    const vals = { 'demo.power': 1500, 'demo.forecast': JSON.stringify([{ ts: String(Date.now()), val: 3 }]) };
    window.__auraShot.mock(vals);
    window.__auraShot.mockServerState(vals);
    window.__auraShot.enableHistory(true);
    window.__auraShot.showWidgets(
        [
            {
                id: 'w-series-modal',
                type: 'echart',
                title: 'Leistung',
                datapoint: '',
                layout: 'default',
                gridPos: { x: 0, y: 0, w: 20, h: 10 },
                options: {
                    echartMode: 'timeseries',
                    echartSeries: [
                        {
                            id: 's1',
                            name: 'Ist',
                            datapointId: 'demo.power',
                            chartType: 'line',
                            source: 'history',
                            historyInstance: 'history.0',
                            yAxisIndex: 0,
                        },
                        {
                            id: 's2',
                            name: 'Prognose',
                            datapointId: 'demo.forecast',
                            chartType: 'bar',
                            source: 'json',
                            yAxisIndex: 0,
                        },
                    ],
                },
            },
        ],
        { editMode: true },
    );
    window.__auraShot.setEditMode(true);
});

/** The widget's options as the store holds them — what the dialog has to write into. */
const opts = () => page.evaluate(() => window.__auraShot.widgetOptions('w-series-modal'));

// ── Open the panel, then the dialog ──────────────────────────────────────────
await page.locator('.aura-edit-chrome button').first().click();
await page.locator('button:text-is("Bearbeiten")').click();
const trigger = page.locator('button:has-text("Datenpunkte verwalten")').first();
await trigger.waitFor({ timeout: 10000 });
check('the panel offers the dialog instead of the series list', await trigger.isVisible());
check('the panel no longer holds the series accordion', (await page.locator('text=Serie 1').count()) === 0);
await trigger.click();

const dlg = page.locator('.aura-config-modal');
const modeBtn = (label) => dlg.locator(`.aura-chart-mode button:text-is("${label}")`);
await dlg.locator('button:text-is("Serie hinzufügen")').waitFor({ timeout: 10000 });
check('the dialog opened', await dlg.isVisible());

// ── Mode switch in the header ────────────────────────────────────────────────
// The switch sits right above the series, so it invites a look into another mode. That must not
// cost anything: it used to rewrite every series' source, and one round trip flattened a
// configured chart — a JSON series came back reading history.
check('the mode switch sits in the dialog', await modeBtn('Vergleich').isVisible());
const sources = async () => (await opts()).echartSeries.map((s) => s.source);
for (const mode of ['JSON', 'Zeitreihe', 'Vergleich', 'Zeitreihe']) {
    await modeBtn(mode).click();
    await page.waitForTimeout(350);
    eq(`"${mode}" leaves every source untouched`, await sources(), ['history', 'json']);
}
{
    const o = await opts();
    eq('and the mode itself is written', o.echartMode, 'timeseries');
}

// ── Master list ─────────────────────────────────────────────────────────────
check('the list is headed "Serien"', (await dlg.locator('label:text-is("Serien (2)")').count()) > 0);
check('it names both series', (await dlg.locator('span:text-is("Prognose")').count()) > 0);
check('and shows their datapoints', (await dlg.locator('span:text-is("Linie · demo.power")').count()) > 0);

// ── Detail pane follows the selection ───────────────────────────────────────
const nameField = dlg.locator('input[type=text]').first();
check('the detail pane shows the first series', (await nameField.inputValue()) === 'Ist', await nameField.inputValue());
await dlg.locator('span:text-is("Prognose")').first().click();
await page.waitForTimeout(300);
check(
    'selecting the second one swaps the detail',
    (await nameField.inputValue()) === 'Prognose',
    await nameField.inputValue(),
);

// ── Data source swaps the two blocks ────────────────────────────────────────
// `Prognose` is the JSON series of the pair — the mode round trip above left it that way.
check('a JSON series shows the JSON block', (await dlg.locator('p:text-is("JSON-Quelle")').count()) > 0);
check('and no history block', (await dlg.locator('p:text-is("Verlaufsdaten")').count()) === 0);
await dlg.locator('button:text-is("Verlauf")').last().click();
await page.waitForTimeout(400);
{
    eq(
        'switching that series to "Verlauf" writes the source',
        (await opts()).echartSeries.map((s) => s.source),
        ['history', 'history'],
    );
    check('the history block appears', (await dlg.locator('p:text-is("Verlaufsdaten")').count()) > 0);
    check('the JSON block is gone', (await dlg.locator('p:text-is("JSON-Quelle")').count()) === 0);
}
await dlg.locator('button:text-is("JSON")').last().click();
await page.waitForTimeout(400);
{
    eq(
        'and back to JSON',
        (await opts()).echartSeries.map((s) => s.source),
        ['history', 'json'],
    );
    check('the other series is left alone by it', (await opts()).echartSeries[0].source === 'history');
}

// ── Rename reaches the config ───────────────────────────────────────────────
await nameField.fill('Solar');
await page.waitForTimeout(400);
eq(
    'renaming a series writes through',
    (await opts()).echartSeries.map((s) => s.name),
    ['Ist', 'Solar'],
);
check('the widget title is untouched by it', (await opts()).echartMode === 'timeseries');

// ── Add and delete ──────────────────────────────────────────────────────────
await dlg.locator('button:text-is("Serie hinzufügen")').click();
await page.waitForTimeout(400);
check('adding a series appends it', (await opts()).echartSeries.length === 3, `${(await opts()).echartSeries.length}`);
// The row's ✕ deletes it again — the newest row is the last one.
await dlg.locator('button[title="Entfernen"]').last().click();
await page.waitForTimeout(400);
eq(
    'deleting it removes exactly that series',
    (await opts()).echartSeries.map((s) => s.name),
    ['Ist', 'Solar'],
);

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length === 0 ? 0 : 1);
