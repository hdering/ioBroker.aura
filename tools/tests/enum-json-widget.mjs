// Verifies the Auswahlfeld widget really builds its dropdown from a JSON datapoint
// (issue #577) — the parser itself is covered by tools/tests/enum-json-entries.mjs.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/enum-json-widget.mjs
//
// Uses the screenshot harness (__auraShot) so datapoint values live in the in-memory
// cache only - no socket write, no real datapoint is touched.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail && !ok ? ` - ${detail}` : ''}`);
};
const eq = (name, got, want) =>
    check(
        name,
        JSON.stringify(got) === JSON.stringify(want),
        `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
    );

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });

// The list DP holds JSON as a string — how ioBroker usually stores it.
const MODES = JSON.stringify([
    { value: 0, label: 'Aus', color: '#ef4444' },
    { value: 1, label: 'Heizen', color: '#f59e0b' },
    { value: 2, label: 'Kühlen', color: '#3b82f6' },
]);

let seq = 0;

/** Mount one Auswahlfeld widget and hand back its root locator. */
async function show(options, values) {
    const widget = {
        id: `w-enum-${++seq}`,
        type: 'enum',
        title: 'Modus',
        datapoint: 'demo.mode',
        layout: 'default',
        gridPos: { x: 0, y: 0, w: 12, h: 6 },
        options,
    };
    await page.evaluate(
        ([w, vals]) => {
            window.__auraShot.mock(vals);
            window.__auraShot.mockServerState(vals);
            window.__auraShot.showWidgets([w]);
        },
        [widget, values],
    );
    await page.waitForTimeout(400);
}

/** Texts of the open dropdown's options. */
async function openOptions() {
    await page.locator('.aura-widget-action button').first().click();
    await page.waitForTimeout(200);
    const texts = await page.locator('.z-\\[9999\\] button').allInnerTexts();
    await page.keyboard.press('Escape');
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.waitForTimeout(150);
    return texts.map((t) => t.trim());
}

const currentLabel = () => page.locator('.aura-widget-value').first().innerText();

// ── entries from the JSON datapoint ───────────────────────────────────────────

await show({ entriesSource: 'json', entriesDp: 'demo.modes' }, { 'demo.mode': 1, 'demo.modes': MODES });
eq('current value maps to the JSON label', (await currentLabel()).trim(), 'Heizen');
eq('dropdown lists every JSON entry', await openOptions(), ['Aus', 'Heizen', 'Kühlen']);

// A new DP value must repaint the label — the JSON list is subscribed, not snapshotted.
await page.evaluate(() => window.__auraShot.mock({ 'demo.mode': 2 }));
await page.waitForTimeout(300);
eq('label follows the datapoint', (await currentLabel()).trim(), 'Kühlen');

// Changing the JSON itself must rebuild the list.
await page.evaluate(() => window.__auraShot.mock({ 'demo.modes': JSON.stringify({ 0: 'Zu', 1: 'Auf' }) }));
await page.waitForTimeout(300);
eq('map form rebuilds the list live', await openOptions(), ['Zu', 'Auf']);

// ── JSON path into a nested payload ───────────────────────────────────────────

await show(
    { entriesSource: 'json', entriesDp: 'demo.nested?data.modes' },
    { 'demo.mode': 0, 'demo.nested': JSON.stringify({ data: { modes: [{ id: 0, name: 'Halt' }] } }) },
);
eq('JSON path selects the nested list', await openOptions(), ['Halt']);
eq('auto-detected field names label the entry', (await currentLabel()).trim(), 'Halt');

// ── manual mode is untouched ──────────────────────────────────────────────────

await show(
    {
        entries: [
            { value: '0', label: 'Manuell A' },
            { value: '1', label: 'Manuell B' },
        ],
    },
    { 'demo.mode': 0 },
);
eq('manual entries still win when no source is set', await openOptions(), ['Manuell A', 'Manuell B']);

await show(
    {
        entriesSource: 'manual',
        entriesDp: 'demo.modes',
        entries: [{ value: '0', label: 'Manuell A' }],
    },
    { 'demo.mode': 0, 'demo.modes': MODES },
);
eq('a configured JSON DP is ignored in manual mode', await openOptions(), ['Manuell A']);

// ── a broken payload must not break the widget ────────────────────────────────

await show({ entriesSource: 'json', entriesDp: 'demo.broken' }, { 'demo.mode': 1, 'demo.broken': '{ not json' });
eq('unparsable JSON falls back to the raw value', (await currentLabel()).trim(), '1');

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
    console.log('FAILED:');
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
    process.exit(1);
}
