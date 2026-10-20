// Verifies that the automatic unit (850 Wh / 1.25 kWh) reaches the rendered text of the value
// widget, both lists in every layout, a second-line datapoint and a custom dp cell.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/value-auto-unit-render.mjs
//
// Uses the screenshot harness (__auraShot): values live in the in-memory cache only.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

let failed = 0;
const check = (name, ok, detail = '') => {
    if (!ok) failed++;
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });

let seq = 0;
async function show(widget, values) {
    await page.evaluate(
        ([w, vals]) => {
            window.__auraShot.mock(vals);
            window.__auraShot.mockServerState(vals);
            window.__auraShot.showWidgets([w]);
        },
        [{ id: `w-auto-${++seq}`, title: 'Test', gridPos: { x: 0, y: 0, w: 12, h: 8 }, ...widget }, values],
    );
    await page.waitForTimeout(400);
    return page.evaluate(() => {
        const el = document.querySelector('.react-grid-item');
        return el ? el.innerText.replace(/\s+/g, ' ').trim() : 'NO WIDGET';
    });
}

// ── Value widget ──────────────────────────────────────────────────────────────
const valueWidget = (extra = {}) => ({
    type: 'value',
    datapoint: 'demo.energy',
    layout: 'default',
    options: { unit: 'Wh', decimals: 0, valueAutoUnit: true, valueAutoUnitDecimals: 2, ...extra },
});
let text = await show(valueWidget(), { 'demo.energy': 850 });
check('value: 850 Wh', /850\s*Wh/.test(text), text);
text = await show(valueWidget(), { 'demo.energy': 1250 });
check('value: 1250 → 1.25 kWh', /1[.,]25\s*kWh/.test(text), text);
text = await show(valueWidget({ valueAutoUnit: false }), { 'demo.energy': 1250 });
check('value: switched off → 1250 Wh', /1250\s*Wh/.test(text), text);
text = await show(valueWidget({ unit: 'kWh', decimals: 2 }), { 'demo.energy': 0.4 });
check('value: 0.4 kWh → 400 Wh', /400[.,]00\s*Wh/.test(text), text);

// ── Lists ─────────────────────────────────────────────────────────────────────
const entries = [{ id: 'demo.energy', label: 'Zaehler', unit: 'Wh', displayType: 'value' }];
for (const type of ['list', 'autolist']) {
    for (const layout of ['default', 'card', 'compact', 'minimal']) {
        text = await show(
            {
                type,
                layout,
                datapoint: '',
                options: { entries, decimals: 0, valueAutoUnit: true, valueAutoUnitDecimals: 1 },
            },
            { 'demo.energy': 2345 },
        );
        check(`${type}/${layout}: 2345 Wh → 2.3 kWh`, /2[.,]3\s*kWh/.test(text) && !/Wh\b.*2345/.test(text), text);
    }
}
text = await show(
    {
        type: 'list',
        layout: 'default',
        datapoint: '',
        options: { entries: [{ ...entries[0], valueAutoUnit: false }], decimals: 0, valueAutoUnit: true },
    },
    { 'demo.energy': 2345 },
);
check('list: entry opts out of list setting', /2345([.,]0+)?\s*Wh/.test(text), text);

// Second line inherits the list-wide setting
text = await show(
    {
        type: 'list',
        layout: 'default',
        datapoint: '',
        options: {
            entries: [{ ...entries[0], subDps: [{ id: 'demo.power', unit: 'W' }] }],
            decimals: 0,
            valueAutoUnit: true,
            valueAutoUnitDecimals: 1,
        },
    },
    { 'demo.energy': 500, 'demo.power': 4200 },
);
check('list: second line 4200 W → 4.2 kW', /4[.,]2\s*kW/.test(text), text);

// ── Custom dp cell: the suffix is the unit ───────────────────────────────────
text = await show(
    {
        type: 'value',
        datapoint: 'demo.energy',
        layout: 'custom',
        options: {
            customGrid: {
                cols: 1,
                rows: 1,
                cells: [
                    {
                        type: 'dp',
                        dpId: 'demo.energy',
                        suffix: ' Wh',
                        decimals: 0,
                        valueAutoUnit: true,
                        valueAutoUnitDecimals: 2,
                    },
                ],
            },
        },
    },
    { 'demo.energy': 1250 },
);
check('custom dp cell: 1250 " Wh" → 1.25 kWh', /1[.,]25 kWh/.test(text), text);

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
