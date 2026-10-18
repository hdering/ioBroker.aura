// Verifies JSON-path entries and the expression conversion of the static list (issue #794).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/list-json-expr.mjs
//
// Uses the screenshot harness (__auraShot): values live in the in-memory cache only, no
// datapoint is touched. Checked: an entry `id?path` shows the addressed field of a JSON
// datapoint, two entries can read two fields of the same datapoint, a JSON-path entry is
// read-only, the expression conversion reaches the value text (per entry and list-wide),
// and the aggregate line counts the converted values.
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

async function show(entries, values, options = {}) {
    const widget = {
        id: 'w-list',
        type: 'list',
        title: 'Testliste',
        datapoint: '',
        layout: 'default',
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
    await page.waitForTimeout(500);
    return page.evaluate(() => {
        const el = document.querySelector('.react-grid-item');
        return el ? el.innerText.replace(/\s+/g, ' ').trim() : 'NO WIDGET';
    });
}

const AKKU = { 'demo.akku': JSON.stringify({ objektName: 12.5, soc: 81, devices: [{ temp: 23.4 }] }) };

// ── 1. JSON path on the entry id ─────────────────────────────────────────────
{
    const text = await show(
        [
            { id: 'demo.akku?soc', label: 'Ladung', unit: '%', displayType: 'value', decimals: 0 },
            { id: 'demo.akku?devices[0].temp', label: 'Temperatur', unit: '°C', displayType: 'value', decimals: 1 },
        ],
        AKKU,
    );
    check('JSON field is shown', text.includes('81'), text);
    check('second field of the same datapoint is shown', text.includes('23.4'), text);
    check('raw JSON is not shown', !text.includes('objektName'), text);
}

// ── 2. JSON-path entry is read-only: clicking its switch writes nothing ────────
// The plain entry is the control — the same click there must write, or the check
// would pass on a selector that hits nothing.
await page.evaluate(() => window.__auraShot.captureWrites(true));
for (const [id, wantWrite] of [
    ['demo.plain', true],
    ['demo.akku?on', false],
]) {
    await show([{ id, label: 'Ein', displayType: 'switch' }], {
        'demo.akku': JSON.stringify({ on: true }),
        'demo.plain': true,
    });
    await page.evaluate(() => window.__auraShot.writes(true));
    const box = page.locator('.react-grid-item').first();
    const targets = box.locator('button[aria-pressed]');
    const n = await targets.count();
    for (let i = 0; i < n; i++)
        await targets
            .nth(i)
            .click({ force: true, timeout: 2000 })
            .catch(() => {});
    const writes = await page.evaluate(() => window.__auraShot.writes());
    check(
        `${id}: switch ${wantWrite ? 'writes' : 'writes nothing'}`,
        wantWrite ? writes.length > 0 : writes.length === 0,
        `${n} control(s), writes ${JSON.stringify(writes)}`,
    );
}

// ── 3. Expression per entry: the issue's example ─────────────────────────────
{
    const text = await show(
        [
            {
                id: 'demo.akku',
                label: 'Leistung',
                unit: 'kW',
                displayType: 'value',
                valueTransform: 'expr',
                valueExpr: 'dp.objektName * 0.4 | fixed(2)',
            },
        ],
        AKKU,
    );
    check('expression result is shown', text.includes('5.00'), text);
    check('unit stays after an expression', text.includes('kW'), text);
}

// ── 4. Expression on a JSON-path entry, list-wide ─────────────────────────────
{
    const text = await show([{ id: 'demo.akku?soc', label: 'Ladung', displayType: 'value', decimals: 0 }], AKKU, {
        valueTransform: 'expr',
        valueExpr: 'dp >= 80 ? "voll" : "laedt"',
    });
    check('list-wide expression applies to a JSON-path entry', text.includes('voll'), text);
}

// ── 5. Aggregate line counts the converted value ─────────────────────────────
{
    const text = await show(
        [
            { id: 'demo.a', label: 'A', displayType: 'value', valueTransform: 'expr', valueExpr: 'dp * 10' },
            { id: 'demo.b', label: 'B', displayType: 'value', valueTransform: 'expr', valueExpr: 'dp * 10' },
        ],
        { 'demo.a': 1, 'demo.b': '2' },
        { showSum: true, decimals: 0 },
    );
    check('converted values are shown (numeric text included)', text.includes('10') && text.includes('20'), text);
    check('sum counts in converted units', /Σ\s*30/.test(text), text);
}

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
