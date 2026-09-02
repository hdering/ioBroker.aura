// Verifies the row cap on the widgets whose rows appear at runtime.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/list-max-rows.mjs
//
// A dynamic list and a status overview find their rows at runtime out of room,
// function and the discovered datapoints. Their height was therefore not a
// configuration value at all: on a dashboard that must not scroll, both widgets
// had to be left out. `maxRows` bounds them; `showMore` says what was cut.
//
// Checked here: the cap holds in every layout, the footer names the number that
// was dropped, switching the footer off leaves the rows alone, a cap above the
// row count changes nothing, and the count behind the title keeps reporting ALL
// rows — a cap must not quietly change what the widget claims to know.
//
// Datapoint values are injected through the screenshot harness (__auraShot.mock)
// — no socket write, no real datapoint is touched.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const eq = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}`);

const LAYOUTS = ['default', 'card', 'compact', 'minimal'];
const ROWS = 9;

const listFor = (layout, y, options) => ({
    id: `mr-${layout}`,
    type: 'autolist',
    layout: layout === 'default' ? undefined : layout,
    title: layout,
    datapoint: '',
    gridPos: { x: 0, y, w: 14, h: 9 },
    options: {
        entries: Array.from({ length: 9 }, (_, i) => ({ id: `demo.dev${i + 1}.LEVEL`, label: `Zeile ${i + 1}` })),
        syncIntervalMin: 999,
        showTitle: true,
        showCount: true,
        hideFilterButton: true,
        showDividers: false,
        ...options,
    },
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1600 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

const settle = () => page.waitForTimeout(600);
// The list reads its entries through getState/subscribe, so the server-state mock
// has to answer too — the cache alone only serves the widgets that read it.
const mock = (map) =>
    page.evaluate((m) => {
        window.__auraShot.mock(m);
        window.__auraShot.mockServerState(m);
    }, map);

await page.evaluate((src) => {
    window.__auraShotListFor = new Function(`return (${src})`)();
}, listFor.toString());

const show = (options) =>
    page.evaluate(
        ([ls, opts]) => window.__auraShot.showWidgets(ls.map((l, i) => window.__auraShotListFor(l, i * 10, opts))),
        [LAYOUTS, options],
    );

/** Rows actually drawn: every entry label that made it into the DOM. */
const rowCount = (widget) =>
    page.evaluate((w) => {
        const root = document.querySelector(`.aura-widget-${w}`);
        if (!root) return -1;
        const text = root.textContent ?? '';
        return (text.match(/Zeile \d+/g) ?? []).length;
    }, widget);

const moreText = (widget) =>
    page.evaluate((w) => {
        const root = document.querySelector(`.aura-widget-${w}`);
        const m = (root?.textContent ?? '').match(/\+\d+ weitere/);
        return m ? m[0] : null;
    }, widget);

const titleCount = (widget) =>
    page.evaluate((w) => {
        const root = document.querySelector(`.aura-widget-${w}`);
        const m = (root?.textContent ?? '').match(/\((\d+)\)/);
        return m ? Number(m[1]) : null;
    }, widget);

const values = Object.fromEntries(Array.from({ length: ROWS }, (_, i) => [`demo.dev${i + 1}.LEVEL`, i + 1]));
await mock(values);

// ── no cap: everything is drawn ──────────────────────────────────────────────
await show({});
await settle();
for (const layout of LAYOUTS) {
    eq(`${layout}: without a cap every row is drawn`, await rowCount(`mr-${layout}`), ROWS);
    eq(`${layout}: and no footer appears`, await moreText(`mr-${layout}`), null);
}

// ── the cap holds, and says what it cut ──────────────────────────────────────
await show({ maxRows: 4 });
await settle();
for (const layout of LAYOUTS) {
    const w = `mr-${layout}`;
    eq(`${layout}: the cap holds`, await rowCount(w), 4);
    eq(`${layout}: the footer names what was cut`, await moreText(w), `+${ROWS - 4} weitere`);
    // The count behind the title describes the data, not the visible slice — a
    // widget that says "(4)" while nine rows exist is worse than one that scrolls.
    eq(`${layout}: the count still reports every row`, await titleCount(w), ROWS);
}

// ── the footer can be switched off without changing the cap ──────────────────
await show({ maxRows: 4, showMore: false });
await settle();
for (const layout of LAYOUTS) {
    const w = `mr-${layout}`;
    eq(`${layout}: showMore off drops the footer`, await moreText(w), null);
    eq(`${layout}: and leaves the cap alone`, await rowCount(w), 4);
}

// ── a cap above the row count is not a cap ───────────────────────────────────
await show({ maxRows: 50 });
await settle();
for (const layout of LAYOUTS) {
    const w = `mr-${layout}`;
    eq(`${layout}: a cap above the row count changes nothing`, await rowCount(w), ROWS);
    eq(`${layout}: and shows no footer`, await moreText(w), null);
}

check('no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
    process.exit(1);
}
