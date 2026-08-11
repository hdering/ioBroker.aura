// Verifies the per-datapoint / list-wide "Wert-Umrechnung / Zeit" of both list widgets.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/list-value-transform.mjs
//
// Uses the screenshot harness (__auraShot) so datapoint values live in the
// in-memory cache only - no socket write, no real datapoint is touched. The same
// values are handed to mockServerState, otherwise the list's initial getState
// round-trip answers null for the fictional IDs and clears them again.
// Checked: factor/offset and time formatting reach the value text in every
// layout of both lists, the entry beats the list-wide default, an explicit
// 'none' switches that default off, the unit is dropped for a time output, the
// aggregate line counts in display units, and controls keep the raw value.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });

// 2026-08-11 14:32:07 local time - the value every time check formats.
const TS = Math.floor(new Date(2026, 7, 11, 14, 32, 7).getTime() / 1000);

/** Renders one list widget and returns the rendered text of that widget. */
async function show(type, layout, { entries, options = {}, values }) {
    const widget = {
        id: 'w-list',
        type,
        title: 'Testliste',
        datapoint: '',
        layout,
        gridPos: { x: 0, y: 0, w: 12, h: 8 },
        options: { entries, ...options },
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
    return page.evaluate(() => {
        const el = document.querySelector('.react-grid-item');
        return el ? el.innerText.replace(/\s+/g, ' ').trim() : 'NO WIDGET';
    });
}

const energyEntry = (patch = {}) => [
    {
        id: 'demo.energy',
        label: 'Zaehler',
        role: 'value.power.consumption',
        unit: 'Wh',
        displayType: 'value',
        ...patch,
    },
];
const ENERGY = { 'demo.energy': 1234 };

// ── 1. Per-DP conversion reaches the value text in every layout ──────────────
for (const type of ['list', 'autolist']) {
    for (const layout of ['default', 'card', 'compact', 'minimal']) {
        const text = await show(type, layout, {
            entries: energyEntry({ valueTransform: 'wh-kwh', valueFactor: 0.001, unit: 'kWh', decimals: 2 }),
            options: { decimals: 2 },
            values: ENERGY,
        });
        check(`${type}/${layout} shows the converted value`, text.includes('1.23'), text);
        check(`${type}/${layout} drops the raw value`, !text.includes('1234'), text);
    }
}

// ── 2. List-wide default applies to entries without their own setting ────────
for (const type of ['list', 'autolist']) {
    const text = await show(type, 'default', {
        entries: energyEntry({ unit: 'kWh' }),
        options: { valueTransform: 'wh-kwh', valueFactor: 0.001, decimals: 2 },
        values: ENERGY,
    });
    check(`${type} list-wide conversion applies`, text.includes('1.23'), text);
}

// ── 3. The entry beats the list-wide default, 'none' switches it off ─────────
{
    const own = await show('list', 'default', {
        entries: energyEntry({ valueTransform: 'custom', valueFactor: 2, unit: '', decimals: 0 }),
        options: { valueTransform: 'wh-kwh', valueFactor: 0.001, decimals: 2 },
        values: ENERGY,
    });
    check('entry conversion beats the list default', own.includes('2468'), own);

    const off = await show('list', 'default', {
        entries: energyEntry({ valueTransform: 'none', unit: '', decimals: 0 }),
        options: { valueTransform: 'wh-kwh', valueFactor: 0.001, decimals: 2 },
        values: ENERGY,
    });
    check("entry 'none' switches the list default off", off.includes('1234'), off);
}

// ── 4. Time formatting of a plain value, unit suppressed ─────────────────────
for (const type of ['list', 'autolist']) {
    const text = await show(type, 'default', {
        entries: [
            { id: 'demo.ts', label: 'Letzte Meldung', unit: 'Wh', displayType: 'value', valueTimeFormat: 'datetime' },
        ],
        values: { 'demo.ts': TS },
    });
    check(`${type} renders the timestamp as date+time`, text.includes('11.08.2026 14:32'), text);
    check(`${type} drops the unit for a time output`, !text.includes('Wh'), text);
}

// ── 5. Conversion feeds the Datum/Zeit display type too (minutes → ms) ───────
{
    const text = await show('list', 'default', {
        entries: [
            {
                id: 'demo.min',
                label: 'Weckzeit',
                displayType: 'time',
                timeFormat: 'time',
                valueTransform: 'custom',
                valueFactor: 60000,
            },
        ],
        // 14:32 as minutes since the epoch.
        values: { 'demo.min': Math.floor(new Date(2026, 7, 11, 14, 32, 0).getTime() / 60000) },
    });
    check('conversion runs before the Datum/Zeit display', text.includes('14:32'), text);
}

// ── 6. The aggregate line counts in display units ────────────────────────────
{
    const text = await show('list', 'default', {
        entries: [
            { id: 'demo.a', label: 'A', unit: 'kWh', displayType: 'value' },
            { id: 'demo.b', label: 'B', unit: 'kWh', displayType: 'value' },
        ],
        options: { showSum: true, valueTransform: 'wh-kwh', valueFactor: 0.001 },
        values: { 'demo.a': 1000, 'demo.b': 2000 },
    });
    check('sum is aggregated in display units', /Σ\s*3([.,]0+)?\s*kWh/.test(text), text);
    check('sum is not the raw total', !text.includes('3000'), text);
}

// ── 7. Controls keep the raw value - a display factor must never be written ──
{
    await show('list', 'default', {
        entries: [{ id: 'demo.level', label: 'Dimmer', role: 'level.dimmer', displayType: 'slider' }],
        options: { valueTransform: 'custom', valueFactor: 0.001 },
        values: { 'demo.level': 40 },
    });
    const raw = await page.evaluate(() => document.querySelector('input[type="range"]')?.value ?? null);
    check('slider renders', raw !== null);
    check('slider stays on the raw value', raw === '40', `value=${raw}`);
}

check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
