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
// Checked: the dialog opens from the panel, its tabs run "Modus" - "Zahlenformat" - "Serien" -
// "Werte" (both settings that apply to ALL series come before the series themselves, issue #600),
// the mode switch writes through, a single series overrides the number format for itself,
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
// Both value settings moved into the dialog — with it still closed, the panel must not show them.
check('nor the value switch', (await page.locator('label:text-is("Werte am Datenpunkt anzeigen")').count()) === 0);
check(
    'nor the stack percentage',
    (await page.locator('label:text-is("Prozentualen Anteil am Stapel anzeigen")').count()) === 0,
);
// The number format followed them into the dialog (issue #600) — it is the default of every
// series, so it belongs next to them and not in the panel behind the closed dialog.
check('nor the decimal places', (await page.locator('label:text-is("Dezimalstellen")').count()) === 0);
check('nor the thousands separator', (await page.locator('label:text-is("1000er")').count()) === 0);
await trigger.click();

const dlg = page.locator('.aura-config-modal');
const tab = (label) => dlg.locator(`button:text-is("${label}")`).first();
// The mode is picked on the explanation card itself — there is no separate button row any more.
const modeBtn = (label) => dlg.locator(`.aura-chart-mode button:has(p:text-is("${label}"))`);
await dlg.locator('button:text-is("Serie hinzufügen")').waitFor({ timeout: 10000 });
check('the dialog opened', await dlg.isVisible());

// ── Tab order ───────────────────────────────────────────────────────────────
// Mode and number format apply to every series, so they come FIRST — and each in its own tab, so
// that neither pushes the series list further down the dialog (issue #600).
{
    const labels = await dlg.locator('.aura-config-modal-tabs button').allTextContents();
    eq('the tabs run mode, format, series, values', labels, ['Modus', 'Zahlenformat', 'Serien (2)', 'Werte']);
}

// ── Mode tab ────────────────────────────────────────────────────────────────
// Switching invites a look into another mode. That must not cost anything: it used to rewrite
// every series' source, and one round trip flattened a configured chart — a JSON series came back
// reading history.
await tab('Modus').click();
await page.waitForTimeout(300);
check('the mode switch has its own tab', await modeBtn('Vergleich').isVisible());
check('the mode is chosen on the cards, no second button row', await modeBtn('Vergleich').count() === 1);
check(
    'with a tip for every mode',
    (await dlg.locator('p:has-text("Ein Balken je Datenpunkt")').count()) === 1 &&
        (await dlg.locator('p:has-text("Verlauf über die Zeit")').count()) === 1 &&
        (await dlg.locator('p:has-text("direkt aus einem JSON-Datenpunkt")').count()) === 1,
);
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
await tab('Serien (2)').click();
await page.waitForTimeout(300);
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
await dlg.locator('.aura-series-source button:text-is("Verlauf")').click();
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
await dlg.locator('.aura-series-source button:text-is("JSON")').click();
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

// ── "Werte" tab ─────────────────────────────────────────────────────────────
// Both settings moved out of the panel's global block: the widget default is what every series
// detail shows as "Auto (…)", and the stack percentage only exists once a series stacks — which
// is configured in this dialog, so the option used to appear behind the closed dialog.
{
    const valuesTab = dlg.locator('button:text-is("Werte")');
    check('the dialog has a "Werte" tab', (await valuesTab.count()) === 1);
    await valuesTab.click();
    await page.waitForTimeout(300);
    check(
        'the stack percentage is hidden while nothing stacks',
        (await dlg.locator('label:text-is("Prozentualen Anteil am Stapel anzeigen")').count()) === 0,
    );
    await dlg.locator('label:text-is("Werte am Datenpunkt anzeigen")').locator('xpath=../button').click();
    await page.waitForTimeout(400);
    check('toggling it writes the widget default', (await opts()).echartShowValues === true);

    // Stack one series — the percentage switch has to turn up without leaving the dialog.
    await dlg.locator('button:text-is("Serien (2)")').click();
    await dlg.locator('span:text-is("Ist")').first().click();
    await page.waitForTimeout(300);
    await dlg.locator('label:text-is("Stapeln")').locator('xpath=../button').click();
    await page.waitForTimeout(400);
    check('stacking a series is stored', (await opts()).echartSeries[0].stack === true);
    await valuesTab.click();
    await page.waitForTimeout(300);
    check(
        'and the stack percentage appears right there',
        (await dlg.locator('label:text-is("Prozentualen Anteil am Stapel anzeigen")').count()) === 1,
    );
    await dlg.locator('label:text-is("Prozentualen Anteil am Stapel anzeigen")').locator('xpath=../button').click();
    await page.waitForTimeout(400);
    check('it writes through too', (await opts()).echartShowStackPercent === true);
    await dlg.locator('button:text-is("Serien (2)")').click();
    await page.waitForTimeout(300);
}

// ── Number format: chart-wide in its own tab, overridable per series ────────
// The tab holds the default for ALL series, which is why it sits in front of them — the series
// details show its value as the one they inherit (issue #600).
{
    await tab('Zahlenformat').click();
    await page.waitForTimeout(300);
    const head = dlg.locator('.aura-chart-format');
    check('the format tab carries the chart-wide setting', await head.isVisible());
    // The column is sized by its content: the button next to the field carries a label ("Global",
    // "Diagramm") and used to eat the field it belongs to.
    const numberWidth = async (scope) => (await scope.locator('input[type=number]').boundingBox()).width;
    check('its number field is wide enough to read', (await numberWidth(head)) >= 40, `${await numberWidth(head)}`);
    // Untouched, the decimals field is disabled and follows the global default.
    check('its decimals start on the global default', await head.locator('input[type=number]').isDisabled());
    await head.locator('button:text-is("Global")').click();
    await page.waitForTimeout(300);
    await head.locator('input[type=number]').fill('3');
    await page.waitForTimeout(400);
    check('typing decimals writes the widget option', (await opts()).decimals === 3, `${(await opts()).decimals}`);
    await head.locator('select').selectOption('de');
    await page.waitForTimeout(400);
    check('and the separator too', (await opts()).numberFormat === 'de', `${(await opts()).numberFormat}`);

    // Per series: the same row in the detail pane, inheriting the chart's setting until touched.
    await tab('Serien (2)').click();
    await page.waitForTimeout(300);
    await dlg.locator('span:text-is("Ist")').first().click();
    await page.waitForTimeout(300);
    const row = dlg.locator('.aura-series-format');
    check('a series offers its own format', (await row.count()) === 1);
    check('inheriting the chart while untouched', await row.locator('input[type=number]').isDisabled());
    eq('so nothing is stored yet', (await opts()).echartSeries[0].decimals, undefined);
    check(
        'and the button names the chart as the source',
        (await row.locator('button:text-is("Diagramm")').count()) === 1,
    );
    check(
        'colour, decimals and separator share one row',
        (await row.locator('input[type=color], input[type=text]').count()) >= 1 &&
            (await row.locator('input[type=number]').count()) === 1 &&
            (await row.locator('select').count()) === 1,
    );
    check(
        'the series field stays readable next to the longer label',
        (await numberWidth(row)) >= 40,
        `${await numberWidth(row)}`,
    );
    check(
        'showing the chart value it inherits',
        (await row.locator('input[type=number]').inputValue()) === '3',
        await row.locator('input[type=number]').inputValue(),
    );
    await row.locator('button:text-is("Diagramm")').click();
    await page.waitForTimeout(300);
    await row.locator('input[type=number]').fill('0');
    await page.waitForTimeout(400);
    check('overriding writes it onto the series', (await opts()).echartSeries[0].decimals === 0);
    await row.locator('select').selectOption('space');
    await page.waitForTimeout(400);
    check('separator included', (await opts()).echartSeries[0].numberFormat === 'space');
    check('the other series is untouched', (await opts()).echartSeries[1].decimals === undefined);
    check('and the chart-wide value stays', (await opts()).decimals === 3);
    // Back to inheriting — the override has to be removable, not just changeable.
    await row.locator('button:text-is("Diagramm")').click();
    await page.waitForTimeout(400);
    eq('the "Diagramm" button drops the override', (await opts()).echartSeries[0].decimals, undefined);
}

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
