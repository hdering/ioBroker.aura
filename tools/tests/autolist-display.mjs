// Verifies the dynamic list's list-wide "Darstellung" — the display every discovered
// row starts with, and the per-datapoint override of it.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/autolist-display.mjs
//
// The rows come from a filter and change on every sync, so the display is configured
// once for the whole list (options.entryDisplay, dialog tab "Darstellung") — same
// reasoning as the row icon next to it. An entry that picked a display of its own is
// configured completely on its own and ignores the list-wide block.
//
// Checked in the widget: the list-wide type reaches every row in every layout, the
// options of that type come with it, an entry's own type wins, and dropping the block
// puts every row back to the automatic display. Checked in the editor: the tab writes
// entryDisplay, an inheriting entry says so, an override lands on the entry alone, and
// the two reset buttons clear their own side.
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

const LAYOUTS = ['default', 'card', 'compact', 'minimal'];

/** Three rows: two inherit the list-wide display, the third brings its own. */
const listFor = (layout, y, options) => ({
    id: `ad-${layout}`,
    type: 'autolist',
    layout: layout === 'default' ? undefined : layout,
    title: layout,
    datapoint: '',
    gridPos: { x: 0, y, w: 14, h: 7 },
    options: {
        entries: [
            { id: 'demo.dev1.LEVEL', label: 'Eins' },
            { id: 'demo.dev2.LEVEL', label: 'Zwei' },
            { id: 'demo.dev3.LEVEL', label: 'Drei', displayType: 'value' },
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
        ([ls, opts]) =>
            window.__auraShot.showWidgets(
                ls.map((l, i) => {
                    const w = window.__auraShotListFor(l, i * 8, opts);
                    return w;
                }),
            ),
        [LAYOUTS, options],
    );

// The builder has to run in the page, so hand it over once.
await page.evaluate((src) => {
    window.__auraShotListFor = new Function(`return (${src})`)();
}, listFor.toString());

/** Toggles rendered in a widget — the switch display is the only thing with one. */
const toggles = (widget) =>
    page.evaluate((w) => document.querySelectorAll(`.aura-widget-${w} [aria-pressed]`).length, widget);

/** Visible text of the widget, whitespace-collapsed. */
const text = (widget) =>
    page.evaluate(
        (w) => (document.querySelector(`.aura-widget-${w}`)?.textContent ?? '').replace(/\s+/g, ' ').trim(),
        widget,
    );

// Values that are NOT boolean-ish (0/1), so the automatic display prints them as
// plain numbers — a forced switch is then visible in every layout, toggle or not.
await mock({ 'demo.dev1.LEVEL': 5, 'demo.dev2.LEVEL': 9, 'demo.dev3.LEVEL': 42 });

// ── no list-wide display: nothing changes ────────────────────────────────────
await show({});
await settle();
for (const layout of LAYOUTS) {
    const w = `ad-${layout}`;
    check(`${layout}: without a list-wide display the rows stay automatic`, (await toggles(w)) === 0, await text(w));
}

// ── the list-wide display reaches every row without one of its own ───────────
// The switch renders as a toggle in the row layouts and as a labelled button in the
// card/badge ones, so the shared evidence is the text: the raw value is gone.
const TOGGLE_LAYOUTS = ['default', 'compact'];
await show({ entryDisplay: { displayType: 'switch', switchStyle: 'slide' } });
await settle();
for (const layout of LAYOUTS) {
    const w = `ad-${layout}`;
    const txt = await text(w);
    check(
        `${layout}: the list-wide switch replaces the value on both rows without their own display`,
        !txt.includes('5') && !txt.includes('9'),
        txt,
    );
    check(`${layout}: the entry with its own display keeps the plain value`, txt.includes('42'), txt);
    if (TOGGLE_LAYOUTS.includes(layout)) {
        const n = await toggles(w);
        check(`${layout}: and it is a real toggle`, n === 2, `${n} toggles`);
    } else {
        // Card and badge rows put a labelled button there instead of the slide toggle.
        check(`${layout}: and it is the labelled switch button`, txt.includes('AN'), txt);
    }
}

// ── the options of that display come with it ─────────────────────────────────
// Not just the type: a list-wide "Wertzuordnung" has to hand its mappings down too,
// otherwise every row would render an empty mapping.
await show({
    entryDisplay: {
        displayType: 'states',
        states: [
            { value: 5, label: 'Eingeschaltet' },
            { value: 9, label: 'Ausgeschaltet' },
        ],
    },
});
await settle();
for (const layout of LAYOUTS) {
    const w = `ad-${layout}`;
    const txt = await text(w);
    check(
        `${layout}: the list-wide value mapping labels both inheriting rows`,
        txt.includes('Eingeschaltet') && txt.includes('Ausgeschaltet'),
        txt,
    );
    check(`${layout}: and leaves the overriding row alone`, txt.includes('42'), txt);
}

// ── the editor ───────────────────────────────────────────────────────────────
await page.evaluate(() => {
    window.__auraShot.showWidgets([window.__auraShotListFor('default', 0, {})], { editMode: true });
    window.__auraShot.setEditMode(true);
});

const opts = () => page.evaluate(() => window.__auraShot.widgetOptions('ad-default'));

await page.locator('.aura-edit-chrome button').first().click();
await page.locator('button:text-is("Bearbeiten")').click();
const trigger = page.locator('button:has-text("Datenpunkte verwalten")').first();
await trigger.waitFor({ timeout: 10000 });
await trigger.click();

const dlg = page.locator('.aura-config-modal');
// Every tab stays mounted while hidden (the search tab holds drafts), so a bare text
// locator would find the entry editor's twin of the same button. Scope: the list-wide
// panel by its own class, the per-entry editor by being the visible one.
const panel = dlg.locator('.aura-list-display');
const tab = (label) => dlg.locator(`button:text-is("${label}")`).first();
// The built-in tab carries the count: "Einträge (3)".
const entriesTab = dlg.locator('button:has-text("Einträge (")').first();
await tab('Darstellung').waitFor({ timeout: 10000 });
check('the dialog has a "Darstellung" tab', await tab('Darstellung').isVisible());

await tab('Darstellung').click();
check(
    'it says the display applies to the whole list',
    (await panel.locator('text=für alle Einträge der Liste').count()) > 0,
);
await panel.locator('button:text-is("Schalter")').click();
await page.waitForTimeout(300);
eq('picking a display writes options.entryDisplay', (await opts()).entryDisplay?.displayType, 'switch');
// The third entry brings its own display from the fixture; the other two must stay
// untouched — the list-wide block is not written onto the entries.
check(
    'and leaves the entries untouched',
    (await opts()).entries.slice(0, 2).every((e) => !e.displayType),
);

// The per-type options of the list-wide block go into it, not onto an entry.
await panel.locator('button:text-is("Icon")').click();
await page.waitForTimeout(300);
eq('its per-type options land in the same block', (await opts()).entryDisplay?.switchStyle, 'icon');

// ── an inheriting entry says so, an override wins ────────────────────────────
await entriesTab.click();
await dlg.locator('text=Eins').first().click();
await page.waitForTimeout(300);
check(
    'an entry without a display of its own names the inherited one',
    (await dlg.locator('button:has-text("Wie Liste (Schalter)"):visible').count()) > 0,
);
await dlg.locator('button:text-is("Wert"):visible').first().click();
await page.waitForTimeout(300);
const afterOverride = await opts();
eq('picking one for the entry overrides only that entry', afterOverride.entries[0].displayType, 'value');
eq('and keeps the list-wide block', afterOverride.entryDisplay?.displayType, 'switch');

// ── the two reset buttons clear their own side ───────────────────────────────
await tab('Darstellung').click();
await page.waitForTimeout(300);
const resetOwn = panel.locator('button:has-text("Eigene Darstellungen entfernen")');
check('the panel offers to drop the per-datapoint displays', (await resetOwn.count()) === 1);
await resetOwn.click();
await page.waitForTimeout(300);
check(
    'dropping them clears every entry display',
    ((await opts()).entries ?? []).every((e) => !e.displayType),
);

await panel.locator('button:has-text("Auto (keine Vorgabe)")').click();
await page.waitForTimeout(300);
eq('back to Auto removes the list-wide block entirely', (await opts()).entryDisplay, undefined);

check('no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
