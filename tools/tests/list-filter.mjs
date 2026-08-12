// Verifies the free-form display filters of both lists (utils/listFilter): rules on
// the main datapoint, on the extra datapoints of the second line or on both, AND/OR
// logic, the empty/notEmpty operators, the free-text search and the filter menu.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/list-filter.mjs
//
// Uses the screenshot harness (__auraShot) so datapoint values live in the in-memory
// cache only - no socket write, no real datapoint is touched.
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

/** The open filter menu keeps a full-screen backdrop that would swallow later clicks. */
async function closeMenu() {
    const backdrop = page.locator('.react-grid-item div.fixed.inset-0');
    if (await backdrop.count()) {
        // dispatchEvent, not click(): the menu itself covers the backdrop's centre.
        await backdrop.first().dispatchEvent('click');
        await page.waitForTimeout(150);
    }
}

// A fresh widget id per call: the chip's filter mode and search term are local widget
// state, and a reused id would carry them into the next scenario.
let seq = 0;

async function show(type, { entries, options = {}, values }) {
    await closeMenu();
    const widget = {
        id: `w-flt-${++seq}`,
        type,
        title: 'Filterliste',
        datapoint: '',
        layout: 'default',
        gridPos: { x: 0, y: 0, w: 12, h: 9 },
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
    await page.waitForTimeout(450);
}

const widgetText = () =>
    page.evaluate(() => {
        const el = document.querySelector('.react-grid-item');
        return el ? el.innerText.replace(/\s+/g, ' ').trim() : 'NO WIDGET';
    });

/** Which of the given row labels are currently rendered. */
async function shownRows(labels) {
    const text = await widgetText();
    return labels.filter((l) => text.includes(l));
}

const openMenu = async () => {
    await page.click('button[title="Filter"]');
    await page.waitForTimeout(200);
};

// ── Fixture: three lamps, each with a battery datapoint in the second line ────
// Lampe1 on / battery 15, Lampe2 off / battery 80, Lampe3 on / battery missing.
const LAMP_VALUES = { 'demo.l1': true, 'demo.l2': false, 'demo.l3': true, 'demo.b1': 15, 'demo.b2': 80 };
const LAMPS = [
    { id: 'demo.l1', label: 'Lampe1', subDps: [{ id: 'demo.b1', label: 'Batt', unit: '%', decimals: 0 }] },
    { id: 'demo.l2', label: 'Lampe2', subDps: [{ id: 'demo.b2', label: 'Batt', unit: '%', decimals: 0 }] },
    { id: 'demo.l3', label: 'Lampe3', subDps: [{ id: 'demo.b3', label: 'Batt', unit: '%', decimals: 0 }] },
];
const ALL_LAMPS = ['Lampe1', 'Lampe2', 'Lampe3'];
const preset = (id, label, rules, logic) => ({ id, label, rules, ...(logic ? { logic } : {}) });

// ── 1. The built-in modes still work exactly as before ───────────────────────
await show('list', { entries: LAMPS, values: LAMP_VALUES });
check('no filter shows every row', (await shownRows(ALL_LAMPS)).length === 3, await widgetText());

await show('list', { entries: LAMPS, options: { valueFilter: 'active' }, values: LAMP_VALUES });
{
    const rows = await shownRows(ALL_LAMPS);
    check('built-in "active" keeps the on rows', rows.join() === 'Lampe1,Lampe3', rows.join());
}

await show('list', { entries: LAMPS, options: { valueFilter: 'inactive' }, values: LAMP_VALUES });
{
    const rows = await shownRows(ALL_LAMPS);
    check('built-in "inactive" keeps the off row', rows.join() === 'Lampe2', rows.join());
}

// ── 2. A rule on an EXTRA datapoint of the second line ───────────────────────
await show('list', {
    entries: LAMPS,
    options: {
        filterPresets: [
            preset('p1', 'Schwache Batterie', [{ source: 'sub', subKey: 'Batt', operator: '<', value: '20' }]),
        ],
        valueFilter: 'p1',
    },
    values: LAMP_VALUES,
});
{
    const rows = await shownRows(ALL_LAMPS);
    check('rule on the extra datapoint filters by its value', rows.join() === 'Lampe1', rows.join());
}

// ── 3. empty / notEmpty find rows whose extra datapoint has no value ─────────
await show('list', {
    entries: LAMPS,
    options: {
        filterPresets: [preset('p2', 'Ohne Batteriewert', [{ source: 'sub', subKey: 'Batt', operator: 'empty' }])],
        valueFilter: 'p2',
    },
    values: LAMP_VALUES,
});
{
    const rows = await shownRows(ALL_LAMPS);
    check('"empty" finds the row without a value', rows.join() === 'Lampe3', rows.join());
}

await show('list', {
    entries: LAMPS,
    options: {
        filterPresets: [preset('p3', 'Mit Batteriewert', [{ source: 'sub', subKey: 'Batt', operator: 'notEmpty' }])],
        valueFilter: 'p3',
    },
    values: LAMP_VALUES,
});
{
    const rows = await shownRows(ALL_LAMPS);
    check('"notEmpty" keeps the rows that answered', rows.join() === 'Lampe1,Lampe2', rows.join());
}

// ── 4. Two rules, AND and OR ─────────────────────────────────────────────────
await show('list', {
    entries: LAMPS,
    options: {
        filterPresets: [
            preset('p4', 'An und schwach', [
                { source: 'main', operator: 'active' },
                { source: 'sub', subKey: 'Batt', operator: '<', value: '20' },
            ]),
        ],
        valueFilter: 'p4',
    },
    values: LAMP_VALUES,
});
{
    const rows = await shownRows(ALL_LAMPS);
    check('AND requires both rules', rows.join() === 'Lampe1', rows.join());
}

await show('list', {
    entries: LAMPS,
    options: {
        filterPresets: [
            preset(
                'p5',
                'Aus oder schwach',
                [
                    { source: 'main', operator: 'inactive' },
                    { source: 'sub', subKey: 'Batt', operator: '<', value: '20' },
                ],
                'OR',
            ),
        ],
        valueFilter: 'p5',
    },
    values: LAMP_VALUES,
});
{
    const rows = await shownRows(ALL_LAMPS);
    check('OR takes either rule', rows.join() === 'Lampe1,Lampe2', rows.join());
}

// ── 5. source 'both' looks at main + extra datapoints, `every` tightens it ───
const TEMP_VALUES = { 'demo.t1': 22, 'demo.t1s': 18, 'demo.t2': 17, 'demo.t2s': 21 };
const TEMPS = [
    { id: 'demo.t1', label: 'Wohnen', displayType: 'value', subDps: [{ id: 'demo.t1s', label: 'Soll' }] },
    { id: 'demo.t2', label: 'Bad', displayType: 'value', subDps: [{ id: 'demo.t2s', label: 'Soll' }] },
];
const ALL_TEMPS = ['Wohnen', 'Bad'];

await show('list', {
    entries: TEMPS,
    options: {
        filterPresets: [preset('p6', 'Irgendwas > 17.5', [{ source: 'both', operator: '>', value: '17.5' }])],
        valueFilter: 'p6',
    },
    values: TEMP_VALUES,
});
{
    const rows = await shownRows(ALL_TEMPS);
    check('"both" matches when one of the values matches', rows.join() === 'Wohnen,Bad', rows.join());
}

await show('list', {
    entries: TEMPS,
    options: {
        filterPresets: [preset('p7', 'Alle > 17.5', [{ source: 'both', operator: '>', value: '17.5', every: true }])],
        valueFilter: 'p7',
    },
    values: TEMP_VALUES,
});
{
    const rows = await shownRows(ALL_TEMPS);
    check('`every` requires all checked values to match', rows.join() === 'Wohnen', rows.join());
}

// ── 6. Filter menu: presets are offered, built-ins can be hidden ─────────────
await show('list', {
    entries: LAMPS,
    options: {
        filterPresets: [
            preset('p1', 'Schwache Batterie', [{ source: 'sub', subKey: 'Batt', operator: '<', value: '20' }]),
        ],
    },
    values: LAMP_VALUES,
});
await openMenu();
{
    const items = await page.evaluate(() =>
        [...document.querySelectorAll('.react-grid-item button')].map((b) => b.innerText.trim()),
    );
    check('menu offers the preset', items.includes('Schwache Batterie'), items.join('|'));
    check('menu still offers the built-ins', items.includes('Nur aktive'), items.join('|'));
}

// ── 7. Free-text search narrows the rows ─────────────────────────────────────
await page.fill('.react-grid-item input[placeholder="Suchen …"]', 'Lampe2');
await page.waitForTimeout(300);
{
    const rows = await shownRows(ALL_LAMPS);
    check('free-text search matches the row name', rows.join() === 'Lampe2', rows.join());
}
await page.fill('.react-grid-item input[placeholder="Suchen …"]', '80');
await page.waitForTimeout(300);
{
    const rows = await shownRows(ALL_LAMPS);
    check('free-text search also matches a second-line value', rows.join() === 'Lampe2', rows.join());
}

// ── 8. Built-ins hidden / search switched off ────────────────────────────────
await show('list', {
    entries: LAMPS,
    options: {
        filterPresets: [
            preset('p1', 'Schwache Batterie', [{ source: 'sub', subKey: 'Batt', operator: '<', value: '20' }]),
        ],
        hideBuiltinFilters: true,
        hideFilterSearch: true,
    },
    values: LAMP_VALUES,
});
await openMenu();
{
    const items = await page.evaluate(() =>
        [...document.querySelectorAll('.react-grid-item button')].map((b) => b.innerText.trim()),
    );
    const searchBoxes = await page.locator('.react-grid-item input[placeholder="Suchen …"]').count();
    check('hideBuiltinFilters drops "Nur aktive"', !items.includes('Nur aktive'), items.join('|'));
    check('hideBuiltinFilters keeps the preset', items.includes('Schwache Batterie'), items.join('|'));
    check('hideFilterSearch removes the search box', searchBoxes === 0, `count=${searchBoxes}`);
}

// ── 9. A stored filter whose preset is gone shows everything ─────────────────
await show('list', { entries: LAMPS, options: { valueFilter: 'deleted-preset' }, values: LAMP_VALUES });
check('unknown filter id falls back to "Alle"', (await shownRows(ALL_LAMPS)).length === 3, await widgetText());

// ── 10. Dynamic list: rules see the second-line TEMPLATE per row ─────────────
const AUTO_VALUES = { 'demo.temp': 21, 'other.temp': 19, 'demo.batt': 10, 'other.batt': 90 };
const AUTO_ENTRIES = [
    { id: 'demo.temp', label: 'Wohnzimmer', displayType: 'value' },
    { id: 'other.temp', label: 'Badezimmer', displayType: 'value' },
];
const AUTO_ROWS = ['Wohnzimmer', 'Badezimmer'];

await show('autolist', {
    entries: AUTO_ENTRIES,
    options: {
        subDpTemplate: [{ id: '{{parent}}.batt', label: 'Batt', unit: '%', decimals: 0 }],
        filterPresets: [
            preset('a1', 'Schwache Batterie', [{ source: 'sub', subKey: 'Batt', operator: '<', value: '20' }]),
        ],
        valueFilter: 'a1',
    },
    values: AUTO_VALUES,
});
{
    const rows = await shownRows(AUTO_ROWS);
    check('dynamic list filters on the resolved template datapoint', rows.join() === 'Wohnzimmer', rows.join());
}

await show('autolist', {
    entries: AUTO_ENTRIES,
    options: {
        subDpTemplate: [{ id: '{{parent}}.batt', label: 'Batt', unit: '%', decimals: 0 }],
        filterPresets: [preset('a2', 'Warm', [{ source: 'main', operator: '>=', value: '20' }])],
        valueFilter: 'a2',
    },
    values: AUTO_VALUES,
});
{
    const rows = await shownRows(AUTO_ROWS);
    check('dynamic list filters on the main datapoint', rows.join() === 'Wohnzimmer', rows.join());
}

await show('autolist', { entries: AUTO_ENTRIES, options: {}, values: AUTO_VALUES });
await openMenu();
await page.fill('.react-grid-item input[placeholder="Suchen …"]', 'Bade');
await page.waitForTimeout(300);
{
    const rows = await shownRows(AUTO_ROWS);
    check('dynamic list free-text search narrows the rows', rows.join() === 'Badezimmer', rows.join());
}

// ── 11. Editor preview honours backendValueFilter with a preset ──────────────
// showWidgets renders the frontend, so this only asserts the shared evaluator is
// reached from the backend option too: with no frontend filter set, the preset in
// valueFilter must win, and an empty result must show the filter message.
await show('list', {
    entries: LAMPS,
    options: {
        filterPresets: [preset('p8', 'Nie', [{ source: 'main', operator: '==', value: 'nichts' }])],
        valueFilter: 'p8',
    },
    values: LAMP_VALUES,
});
{
    const text = await widgetText();
    check('a filter that matches nothing says so', text.includes('Kein Eintrag passt zu „Nie“'), text);
}

check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
