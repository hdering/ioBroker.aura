// Verifies the dynamic list's "Schieberegler" display — the one display type the
// widget offered in its editor but never rendered (it fell through to the automatic
// path, so a slider only ever appeared when the datapoint name happened to look like
// a dimmer). Same check for "Wert", which shared the gap.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/autolist-slider.mjs
//
// Checked: the forced slider draws a range control in every layout that has controls,
// it starts at the datapoint value, dragging it writes that datapoint, a read-only
// datapoint gets the value text instead, the list-wide block reaches the rows that
// have no display of their own — and a slider row in the badge layout never turns into
// a toggle, no matter how boolean-ish its value looks.
//
// Datapoint values are injected into the in-memory cache via the screenshot harness
// (__auraShot.mock) — no socket write, no real datapoint is touched.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const eq = (name, got, want) =>
    check(
        name,
        JSON.stringify(got) === JSON.stringify(want),
        `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
    );

// The badge layout draws no controls at all, so it is checked separately below.
const LAYOUTS = ['default', 'card', 'compact'];
const ALL_LAYOUTS = [...LAYOUTS, 'minimal'];

// Deliberately not a LEVEL/DIMMER/BRIGHTNESS name: the automatic display picks a
// slider for those on its own, which would hide the very bug this test is about.
const AUTO_DP = 'demo.dev1.VOLUME';
const SLIDER_DP = 'demo.dev2.VOLUME';
const RO_DP = 'demo.dev3.VOLUME';

/** Three rows: one automatic, one forced to the slider, one read-only slider. */
const listFor = (layout, y, options) => ({
    id: `as-${layout}`,
    type: 'autolist',
    layout: layout === 'default' ? undefined : layout,
    title: layout,
    datapoint: '',
    gridPos: { x: 0, y, w: 14, h: 7 },
    options: {
        entries: [
            { id: 'demo.dev1.VOLUME', label: 'Auto' },
            { id: 'demo.dev2.VOLUME', label: 'Regler', displayType: 'slider' },
            { id: 'demo.dev3.VOLUME', label: 'Nur lesen', displayType: 'slider', writable: false },
        ],
        syncIntervalMin: 999,
        showTitle: false,
        hideFilterButton: true,
        showDividers: false,
        ...options,
    },
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1400 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

const settle = () => page.waitForTimeout(600);
// The list reads its entries through getState/subscribe, so the server-state mock has
// to answer as well — the cache alone only serves the widgets that read it.
const mock = (map) =>
    page.evaluate((m) => {
        window.__auraShot.mock(m);
        window.__auraShot.mockServerState(m);
    }, map);

const show = (options) =>
    page.evaluate(
        ([ls, opts]) => window.__auraShot.showWidgets(ls.map((l, i) => window.__auraShotListFor(l, i * 8, opts))),
        [ALL_LAYOUTS, options],
    );

// The builder has to run in the page, so hand it over once.
await page.evaluate((src) => {
    window.__auraShotListFor = new Function(`return (${src})`)();
}, listFor.toString());

/** The range inputs of one widget, with their current thumb positions. */
const ranges = (widget) =>
    page.evaluate(
        (w) => [...document.querySelectorAll(`.aura-widget-${w} input[type="range"]`)].map((el) => el.value),
        widget,
    );

/** Visible text of the widget, whitespace-collapsed. */
const text = (widget) =>
    page.evaluate(
        (w) => (document.querySelector(`.aura-widget-${w}`)?.textContent ?? '').replace(/\s+/g, ' ').trim(),
        widget,
    );

await mock({ [AUTO_DP]: 42, [SLIDER_DP]: 42, [RO_DP]: 42 });
await show({});
await settle();

// ── 1. The forced slider renders — and only for the row that asked for it ────
for (const layout of LAYOUTS) {
    const w = `as-${layout}`;
    const r = await ranges(w);
    eq(`${layout}: exactly one slider, on the row that forced it`, r, ['42']);
    check(`${layout}: the automatic row keeps its plain value`, (await text(w)).includes('42'), await text(w));
}

// ── 2. A read-only datapoint gets the value text, never a control ────────────
for (const layout of LAYOUTS) {
    const txt = await text(`as-${layout}`);
    check(`${layout}: the read-only slider row prints the value with its unit`, txt.includes('42%'), txt);
}

// ── 3. Dragging writes the datapoint ─────────────────────────────────────────
await page.evaluate(() => window.__auraShot.writes(true));
for (const layout of LAYOUTS) {
    await page.locator(`.aura-widget-as-${layout} input[type="range"]`).first().fill('80');
    await page.waitForTimeout(150);
    const last = await page.evaluate(() => window.__auraShot.lastWrite);
    eq(`${layout}: dragging the slider writes the datapoint`, last, { id: SLIDER_DP, val: 80 });
}

// ── 4. The list-wide display reaches the rows without one of their own ───────
// Step 3 left 80 on the dragged datapoint — put the fixture back first.
await mock({ [AUTO_DP]: 42, [SLIDER_DP]: 42, [RO_DP]: 42 });
await show({ entryDisplay: { displayType: 'slider' } });
await settle();
for (const layout of LAYOUTS) {
    const r = await ranges(`as-${layout}`);
    eq(`${layout}: the list-wide slider adds the automatic row's control`, r, ['42', '42']);
}

// ── 5. A non-numeric value still lands on the scale ──────────────────────────
await mock({ [AUTO_DP]: 42, [SLIDER_DP]: true, [RO_DP]: 42 });
await show({});
await settle();
for (const layout of LAYOUTS) {
    const r = await ranges(`as-${layout}`);
    eq(`${layout}: a boolean datapoint maps to the ends of the scale`, r, ['100']);
}

// ── 6. The badge layout: value, not a toggle ─────────────────────────────────
// A 0/1 value is what the automatic path reads as boolean-ish, so this is exactly the
// case where a slider row used to turn into a click-to-toggle badge.
await mock({ [AUTO_DP]: 1, [SLIDER_DP]: 1, [RO_DP]: 1 });
await show({});
await settle();
await page.evaluate(() => window.__auraShot.writes(true));
await page.locator('.aura-widget-as-minimal button', { hasText: 'Regler' }).first().click();
await page.waitForTimeout(200);
const badgeWrites = await page.evaluate(() => window.__auraShot.writes());
eq('minimal: clicking a slider badge never toggles the datapoint', badgeWrites, []);

// ── 7. "Wert" forces the plain value, whatever the row would have shown ──────
await mock({ [AUTO_DP]: 1, [SLIDER_DP]: 1, [RO_DP]: 1 });
await page.evaluate(
    ([ls]) =>
        window.__auraShot.showWidgets(
            ls.map((l, i) => {
                const w = window.__auraShotListFor(l, i * 8, {});
                w.options.entries = [{ id: 'demo.dev1.VOLUME', label: 'Wert', displayType: 'value' }];
                return w;
            }),
        ),
    [ALL_LAYOUTS],
);
await settle();
for (const layout of ALL_LAYOUTS) {
    const w = `as-${layout}`;
    const txt = await text(w);
    check(`${layout}: "Wert" prints the raw value instead of a switch`, txt.includes('1') && !/AN|AUS/.test(txt), txt);
    eq(`${layout}: and draws no control`, await ranges(w), []);
}

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) process.exit(1);
