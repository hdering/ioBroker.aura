// A JSON series on a TIMESERIES chart needs timestamp labels. With category labels ("01", "02")
// every entry is dropped, and until now that produced an empty chart and an empty explanation.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/chart-json-time-labels.mjs
//
// Checked: the widget names the reason instead of "Keine Daten", the series editor says so right
// at the datapoint (with the offending label), its button switches the widget to the category
// mode, and there the very same payload draws.
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

const MONTHS = JSON.stringify([
    { label: '01', value: '486.1276999999973' },
    { label: '02', value: '431.4953000000023' },
    { label: '03', value: '388.2' },
]);

await page.evaluate((months) => {
    const vals = { 'demo.months': months };
    window.__auraShot.mock(vals);
    window.__auraShot.mockServerState(vals);
    window.__auraShot.showWidgets(
        [
            {
                id: 'w-json-labels',
                type: 'echart',
                title: 'Monate',
                datapoint: '',
                layout: 'default',
                gridPos: { x: 0, y: 0, w: 20, h: 10 },
                options: {
                    echartMode: 'timeseries',
                    echartSeries: [
                        {
                            id: 's1',
                            name: 'Verbrauch',
                            datapointId: 'demo.months',
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
}, MONTHS);

const opts = () => page.evaluate(() => window.__auraShot.widgetOptions('w-json-labels'));
const widget = page.locator('.react-grid-item').first();

// ── The widget says WHY it is empty ─────────────────────────────────────────
await page.waitForTimeout(900);
check(
    'the empty chart names the reason',
    (await widget.locator('text=sind keine Zeitstempel').count()) > 0,
    await widget.innerText().catch(() => ''),
);
check('and does not just say "Keine Daten"', (await widget.locator('span:text-is("Keine Daten")').count()) === 0);

// ── The editor says it at the datapoint ─────────────────────────────────────
await page.locator('.aura-edit-chrome button').first().click();
await page.locator('button:text-is("Bearbeiten")').click();
await page.locator('button:has-text("Datenpunkte verwalten")').first().click();
const dlg = page.locator('.aura-config-modal');
await dlg.locator('button:text-is("Serie hinzufügen")').waitFor({ timeout: 10000 });
await dlg.locator('button:has-text("Serien")').first().click();
await page.waitForTimeout(400);
await dlg.locator('span:text-is("Verbrauch")').first().click();
await page.waitForTimeout(600);

const warn = dlg.locator('p:has-text("ist kein Zeitstempel")');
check('the series editor warns about the label', (await warn.count()) === 1);
check('and quotes the offending one', ((await warn.first().innerText()) || '').includes('01'));

// The warning has to stand ABOVE the JSON source section — that is the whole point of moving it.
const order = await dlg.evaluate((root) => {
    const w = [...root.querySelectorAll('p')].find((p) => p.textContent?.includes('ist kein Zeitstempel'));
    const sec = [...root.querySelectorAll('p')].find((p) => p.textContent?.trim() === 'JSON-Quelle');
    if (!w || !sec) return null;
    return w.compareDocumentPosition(sec) & Node.DOCUMENT_POSITION_FOLLOWING ? 'above' : 'below';
});
eq('it stands above the "JSON-Quelle" section', order, 'above');

// ── One click out of the dead end ───────────────────────────────────────────
// Scoped to the offer, not to the mode card of the "Modus" tab — the dialog keeps every tab's
// panel in the DOM, so a bare "Kategorien (JSON)" would match that card too.
const fix = dlg.locator('button:has-text("umstellen")');
check('it offers the category mode', (await fix.count()) === 1);
await fix.first().click();
await page.waitForTimeout(600);
eq('clicking it switches the widget mode', (await opts()).echartMode, 'json');
check('the warning is gone with it', (await dlg.locator('p:has-text("ist kein Zeitstempel")').count()) === 0);

await dlg
    .locator('button[aria-label="Schließen"], .aura-config-modal button:has-text("×")')
    .first()
    .click({ trial: true })
    .catch(() => {});
await page.keyboard.press('Escape');
await page.waitForTimeout(800);
check(
    'and the same payload draws in that mode',
    (await widget.locator('canvas').count()) > 0 && (await widget.locator('text=sind keine Zeitstempel').count()) === 0,
);

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
await browser.close();
process.exit(failed.length ? 1 : 0);
