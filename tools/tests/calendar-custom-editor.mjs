// Verifies the editor side of the Kalender custom layout (#608): picking a per-event
// field must reveal the "Termin" number and write the indexed key (summary → summary2),
// while a widget-wide field like "Anzahl Termine" stays unindexed.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/calendar-custom-editor.mjs
//
// The rendered result of those keys is covered by tools/tests/calendar-custom-fields.mjs.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};
const eq = (name, got, want) => check(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });

await page.evaluate(() => {
    window.__auraShot.showWidgets(
        [
            {
                id: 'w-cal-cfg',
                type: 'calendar',
                title: 'Termine',
                datapoint: '',
                layout: 'custom',
                gridPos: { x: 0, y: 0, w: 8, h: 10 },
                options: {
                    calendars: [],
                    customGrid: { cols: 2, rows: 1, cells: [{ type: 'empty' }, { type: 'empty' }] },
                },
            },
        ],
        { editMode: true },
    );
    window.__auraShot.setEditMode(true);
});

const cells = () => page.evaluate(() => window.__auraShot.widgetOptions('w-cal-cfg').customGrid.cells);

await page.locator('.aura-edit-chrome button').first().click();
await page.locator('button:text-is("Bearbeiten")').click();

const dlg = page.locator('.aura-widget-edit-modal');
await dlg.waitFor({ timeout: 10000 });
const grid = dlg.locator('div:has(> p:has-text("Raster-Konfiguration"))').first();
await grid.waitFor({ timeout: 10000 });

// Cell 1/1 — the buttons of the cell map are labelled "<type> <row>/<col>".
await grid.locator('button:has-text("1/1")').first().click();
await page.waitForTimeout(200);

const contentSel = dlg.locator('label:text-is("Inhalt") + select');
await contentSel.selectOption('field');
await page.waitForTimeout(300);

const fieldSel = dlg.locator('label:text-is("Widget-Feld") + select');
check('the cell offers the calendar fields', (await fieldSel.count()) === 1);
check(
    'the per-event number is hidden until a per-event field is picked',
    (await dlg.locator('label:text-is("Termin") + input').count()) === 0,
);

await fieldSel.selectOption('summary');
await page.waitForTimeout(300);
eq('a plain pick writes the unindexed key', (await cells())[0].fieldKey, 'summary');

const eventNr = dlg.locator('label:text-is("Termin") + input');
check('picking a per-event field reveals the "Termin" number', (await eventNr.count()) === 1);
eq('it starts at the next event', await eventNr.inputValue(), '1');

await eventNr.fill('2');
await page.waitForTimeout(400);
eq('raising it writes the indexed key', (await cells())[0].fieldKey, 'summary2');

// The number survives a field change within the per-event set …
await fieldSel.selectOption('timespan');
await page.waitForTimeout(300);
eq('switching the field keeps the event number', (await cells())[0].fieldKey, 'timespan2');

// … and a widget-wide field drops it, because there is no count2.
await fieldSel.selectOption('count');
await page.waitForTimeout(300);
eq('a widget-wide field stays unindexed', (await cells())[0].fieldKey, 'count');
check(
    'the "Termin" number disappears for a widget-wide field',
    (await dlg.locator('label:text-is("Termin") + input').count()) === 0,
);

// Back to 1 must restore the plain key, so grids stay readable.
await fieldSel.selectOption('summary');
await page.waitForTimeout(300);
await dlg.locator('label:text-is("Termin") + input').fill('3');
await page.waitForTimeout(400);
eq('event 3 is written', (await cells())[0].fieldKey, 'summary3');
await dlg.locator('label:text-is("Termin") + input').fill('1');
await page.waitForTimeout(400);
eq('event 1 drops the number again', (await cells())[0].fieldKey, 'summary');

// ── the calendar icon is per event too ───────────────────────────────────────

await grid.locator('button:has-text("1/2")').first().click();
await page.waitForTimeout(200);
await dlg.locator('label:text-is("Inhalt") + select').selectOption('component');
await page.waitForTimeout(300);
await dlg.locator('label:text-is("Aktion / Icon") + select').selectOption('cal-icon');
await page.waitForTimeout(300);
eq('the icon starts unindexed', (await cells())[1].componentKey, 'cal-icon');
await dlg.locator('label:text-is("Termin") + input').fill('2');
await page.waitForTimeout(400);
eq('the icon follows its event', (await cells())[1].componentKey, 'cal-icon2');

// The widget icon is not per event and must not offer the number.
await dlg.locator('label:text-is("Aktion / Icon") + select').selectOption('icon');
await page.waitForTimeout(300);
eq('the widget icon stays unindexed', (await cells())[1].componentKey, 'icon');
check(
    'the widget icon offers no "Termin" number',
    (await dlg.locator('label:text-is("Termin") + input').count()) === 0,
);

// ── summary ─────────────────────────────────────────────────────────────────

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
    for (const f of failed) console.log(`  FAIL ${f.name} - ${f.detail}`);
    process.exit(1);
}
