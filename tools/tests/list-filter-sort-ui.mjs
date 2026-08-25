// Verifies the list filter/sort additions from issue #572 in the rendered widget.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/list-filter-sort-ui.mjs
//
// The pure test covers the rules; this one covers the wiring: that the comparator
// really reaches a datapoint of the second line, and that a name rule filters the
// RENDERED name — the one a `[[dp]]` token in the name pattern produced.
//
// It also covers the sort chain that replaced the two fixed sort slots: that the
// widget honours `sortRules`, that a stored `sortBy` still sorts the same, and that
// a chain wins over it.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const eq = (name, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    check(name, ok, ok ? '' : `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};

const entry = (k, label) => ({
    id: `demo.${k}.STATE`,
    label,
    displayType: 'value',
    subDps: [{ id: `demo.${k}.BATTERY`, label: 'Akku' }],
});

const widget = (options) => ({
    id: 'fs-list',
    type: 'list',
    title: 'Sortieren',
    datapoint: '',
    gridPos: { x: 0, y: 0, w: 14, h: 12 },
    options: {
        entries: [entry('a', 'Alpha'), entry('b', 'Beta Offline'), entry('c', 'Gamma')],
        showDividers: false,
        ...options,
    },
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });

const settle = () => page.waitForTimeout(600);
const mock = (map) =>
    page.evaluate((m) => {
        window.__auraShot.mock(m);
        window.__auraShot.mockServerState(m);
    }, map);

const show = async (options) => {
    await page.evaluate((w) => window.__auraShot.showWidgets([w]), widget(options));
    await settle();
};

/** The row labels in render order. */
const order = () =>
    page.evaluate(() => {
        const names = ['Alpha', 'Beta Offline', 'Gamma'];
        const text = document.querySelector('.aura-widget-fs-list')?.innerText ?? '';
        return names
            .map((n) => ({ n, at: text.indexOf(n) }))
            .filter((x) => x.at >= 0)
            .sort((a, b) => a.at - b.at)
            .map((x) => x.n);
    });

await mock({
    'demo.a.STATE': 1,
    'demo.b.STATE': 1,
    'demo.c.STATE': 1,
    'demo.a.BATTERY': 80,
    'demo.b.BATTERY': 12,
    'demo.c.BATTERY': 45,
});

// ── sorting by a datapoint of the second line ────────────────────────────────
await show({});
eq('unsorted: configured order', await order(), ['Alpha', 'Beta Offline', 'Gamma']);

await show({ sortBy: 'sub:Akku', sortOrder: 'asc' });
eq('sorted by the second line, ascending', await order(), ['Beta Offline', 'Gamma', 'Alpha']);

await show({ sortBy: 'sub:Akku', sortOrder: 'desc' });
eq('sorted by the second line, descending', await order(), ['Alpha', 'Gamma', 'Beta Offline']);

// The key may also be the last segment of the datapoint id.
await show({ sortBy: 'sub:BATTERY', sortOrder: 'asc' });
eq('the id segment works as a key too', await order(), ['Beta Offline', 'Gamma', 'Alpha']);

// A live value change re-sorts.
await mock({ 'demo.a.BATTERY': 1 });
await settle();
eq('sorting follows the datapoint', await order(), ['Alpha', 'Beta Offline', 'Gamma']);

// ── the sort chain ───────────────────────────────────────────────────────────
await mock({ 'demo.a.BATTERY': 80 });

await show({ sortRules: [{ source: 'sub', subKey: 'Akku' }] });
eq('chain: a sub criterion sorts the rendered list', await order(), ['Beta Offline', 'Gamma', 'Alpha']);

await show({ sortRules: [{ source: 'sub', subKey: 'Akku', order: 'desc' }] });
eq('chain: descending', await order(), ['Alpha', 'Gamma', 'Beta Offline']);

// Equal main values, so the second criterion is the one that orders the rows.
await show({ sortRules: [{ source: 'value' }, { source: 'name', order: 'desc' }] });
eq('chain: the second criterion breaks the tie', await order(), ['Gamma', 'Beta Offline', 'Alpha']);

// A hand-written order over a text datapoint — alphabetically this would be A/B/G.
await mock({ 'demo.a.STATE': 'OK', 'demo.b.STATE': 'ERROR', 'demo.c.STATE': 'WARN' });
await show({ sortRules: [{ source: 'value', mode: 'custom', values: ['ERROR', 'WARN', 'OK'] }] });
eq('chain: a hand-written value order', await order(), ['Beta Offline', 'Gamma', 'Alpha']);

// A chain overrides a stored legacy setting instead of adding to it.
await show({ sortBy: 'sub:Akku', sortOrder: 'asc', sortRules: [{ source: 'name', order: 'desc' }] });
eq('chain: wins over the old sortBy pair', await order(), ['Gamma', 'Beta Offline', 'Alpha']);

await mock({ 'demo.a.STATE': 1, 'demo.b.STATE': 1, 'demo.c.STATE': 1 });

// ── excluding rows by name ───────────────────────────────────────────────────
const preset = {
    id: 'online',
    label: 'Online',
    logic: 'AND',
    rules: [{ source: 'name', operator: 'notContains', value: 'Offline' }],
};

await show({ filterPresets: [preset], valueFilter: 'all' });
eq('filter off: every row', await order(), ['Alpha', 'Beta Offline', 'Gamma']);

await show({ filterPresets: [preset], valueFilter: 'online' });
eq('a name rule hides the matching row', await order(), ['Alpha', 'Gamma']);

check('no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
