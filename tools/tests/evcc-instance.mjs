// The evcc instance picker in the widget's config panel, and the prefix field
// underneath it.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/evcc-instance.mjs
//
// Two bugs are pinned here. The prefix field wrote `e.target.value || 'evcc.0'`,
// so clearing it snapped the old value straight back and the next keystrokes
// landed BEHIND it — typing a fresh prefix the natural way produced
// "evcc.0fronius.0". And there was no way to see which evcc instances exist;
// on an ioBroker without one the field just sat there claiming "evcc.0".
//
// getObjectView is stubbed through the screenshot harness
// (`__auraShot.mockObjectView`), so the test does not depend on an evcc adapter
// being installed — including the case where none is.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const eq = (name, got, want) => check(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

const dlg = page.locator('.aura-widget-edit-modal');
const select = dlg.locator('select.aura-evcc-instance');
const field = dlg.locator('input.aura-evcc-prefix');
const opts = () => page.evaluate(() => window.__auraShot.widgetOptions('evcc'));

/** Reopen the widget's edit dialog with `rows` as the instances ioBroker reports. */
async function open(rows, widgetOptions = {}) {
    await page.keyboard.press('Escape');
    await page.evaluate(
        ([rows, widgetOptions]) => {
            window.__auraShot.mockObjectView({ instance: rows });
            window.__auraShot.showWidgets(
                [
                    {
                        id: 'evcc',
                        type: 'evcc',
                        title: 'Wallbox',
                        datapoint: '',
                        gridPos: { x: 0, y: 0, w: 12, h: 8 },
                        options: { evccPrefix: 'evcc.0', loadpointCount: 1, showBattery: true, ...widgetOptions },
                    },
                ],
                { editMode: true },
            );
            window.__auraShot.setEditMode(true);
        },
        [rows, widgetOptions],
    );
    await page.waitForTimeout(400);
    await page.locator('.aura-edit-chrome button').first().click();
    await page.locator('button:text-is("Bearbeiten")').click();
    await dlg.waitFor({ timeout: 10000 });
    await page.waitForTimeout(500);
}

const inst = (n, enabled = true) => ({ id: `system.adapter.evcc.${n}`, value: { common: { enabled } } });

// ── an ioBroker with two evcc instances ──────────────────────────────────────
await open([inst(0), inst(1, false), { id: 'system.adapter.sma.0', value: { common: { enabled: true } } }]);

check('the instances are offered as a dropdown', (await select.count()) > 0);
const options = await select.locator('option').allTextContents();
check('both evcc instances are listed', options.includes('evcc.0'), options.join(' | '));
check('a disabled one says so', options.some((o) => o.includes('evcc.1') && o.includes('deaktiviert')), options.join(' | '));
check('an unrelated adapter is NOT offered', !options.some((o) => o.startsWith('sma.')), options.join(' | '));
check('and there is a way out to a hand-typed prefix', options.some((o) => o.includes('Anderer Präfix')));
eq('the configured instance is the selected one', await select.inputValue(), 'evcc.0');
eq('with an instance picked the text field is out of the way', await field.count(), 0);

await select.selectOption('evcc.1');
await page.waitForTimeout(400);
eq('picking another instance writes the prefix', (await opts()).evccPrefix, 'evcc.1');

// ── the escape hatch: a renamed or remote instance ───────────────────────────
await select.selectOption('__custom__');
await page.waitForTimeout(400);
eq('choosing "other" clears the prefix for typing', (await opts()).evccPrefix, '');
eq('… and brings the text field back', await field.count(), 1);
await field.click();
await page.keyboard.type('meinevcc.2');
await page.waitForTimeout(400);
eq('what is typed there is what is stored', (await opts()).evccPrefix, 'meinevcc.2');

// ── an ioBroker WITHOUT evcc — the reported case ─────────────────────────────
await open([]);
eq('with no instance found there is no dropdown', await select.count(), 0);
check('the panel says so instead of pretending', (await dlg.locator('text=Keine evcc-Instanz gefunden').count()) > 0);
eq('and the prefix field is there', await field.count(), 1);

// ── the prefix field itself: clearing it must not snap back ──────────────────
eq('it starts on the configured prefix', await field.inputValue(), 'evcc.0');
await field.click();
await page.keyboard.press('Control+a');
await page.keyboard.press('Backspace');
await page.waitForTimeout(400);
eq('clearing it leaves it cleared', await field.inputValue(), '');
await page.keyboard.type('fronius.0');
await page.waitForTimeout(400);
eq('so a fresh prefix is what lands in the field', await field.inputValue(), 'fronius.0');
eq('… and in the options', (await opts()).evccPrefix, 'fronius.0');

// Selecting everything and typing over it worked before too — keep it working.
await field.click();
await page.keyboard.press('Control+a');
await page.keyboard.type('sma.0');
await page.waitForTimeout(400);
eq('typing over a selection still works', (await opts()).evccPrefix, 'sma.0');

// ── an empty prefix must not reach the widget as an empty subscription ───────
await open([], { evccPrefix: '' });
const subscribed = await page.evaluate(() => {
    const box = document.querySelector('.aura-widget-evcc');
    return !!box && box.textContent.length > 0;
});
check('a widget saved with an empty prefix still renders', subscribed);

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
    console.log('FAILED:');
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
    process.exit(1);
}
