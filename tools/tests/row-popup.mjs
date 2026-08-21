// Verifies the row-click detail popups of the list widgets (issue #524).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/row-popup.mjs
//
// Uses the screenshot harness (__auraShot) so datapoint values live in the
// in-memory cache only - no socket write, no real datapoint is touched.
// Checked: the popup opens per row, the view is picked from the row's role, a
// control inside the row keeps its own click, and rowClickAction 'none' switches
// the whole thing off.
//
// A row click needs rowClickAction 'auto' (or an explicit action) - unset means
// off. And the type-specific built-in views are no longer seeded into fresh
// installations, so the role -> view chain is exercised twice: once as the
// harness boots (generic datapoint view for every role) and once after
// __auraShot.popupBuiltins() has restored a pre-existing installation.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const ROWS = [
    { id: 'demo.light', label: 'Licht Wohnzimmer', role: 'switch.light' },
    // displayType slider so the row carries a real interactive control (test 3).
    { id: 'demo.dim', label: 'Dimmer Flur', role: 'level.dimmer', displayType: 'slider' },
    { id: 'demo.temp', label: 'Temperatur Bad', role: 'value.temperature' },
];

function listWidget(options = {}) {
    return {
        id: 'w-list',
        type: 'list',
        title: 'Testliste',
        datapoint: '',
        layout: 'default',
        gridPos: { x: 0, y: 0, w: 12, h: 8 },
        options: {
            // Unset means "rows are inert" - every role test needs 'auto'.
            rowClickAction: 'auto',
            entries: ROWS.map((r) => ({ ...r })),
            ...options,
        },
    };
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });

const popup = page.locator('div[class*="z-[300]"]').first();
const settle = () => page.waitForTimeout(350);
const popupCount = () => page.locator('div[class*="z-[300]"]').count();
const popupText = async () => ((await popup.count()) > 0 ? ((await popup.innerText()) ?? '') : '');
const gridItems = () => popup.locator('.react-grid-item').count();

async function closePopup() {
    await page.keyboard.press('Escape');
    await settle();
}

async function show(options) {
    await page.evaluate(
        ([w, values]) => {
            window.__auraShot.mock(values);
            window.__auraShot.showWidgets([w]);
        },
        [listWidget(options), { 'demo.light': true, 'demo.dim': 42, 'demo.temp': 21.5 }],
    );
    await settle();
}

// Clicks a row on its label, i.e. deliberately NOT on the control at the right.
const clickRowLabel = async (label) => {
    await page.locator(`text=${label}`).first().click();
    await settle();
};

// ── 0. Fresh install: no type-specific built-ins, so every role falls back ───
// The shipped dimmer/switch/... views are not set up any more; 'auto' resolves
// through the (empty) type defaults and lands on the generic datapoint view,
// which is the only one that prints the datapoint id.
await show();
await clickRowLabel('Licht Wohnzimmer');
check('fresh install: a row click still opens a popup', (await popupCount()) === 1, `count=${await popupCount()}`);
check('fresh install: switch role falls back to the datapoint view', (await popupText()).includes('demo.light'));
await closePopup();

// Everything below is the pre-existing installation that still has them.
await page.evaluate(() => window.__auraShot.popupBuiltins());
await settle();

// ── 1. Row click opens exactly one popup, titled with the row label ───────────
await show();
await clickRowLabel('Licht Wohnzimmer');
check('row click opens a popup', (await popupCount()) === 1, `count=${await popupCount()}`);
check('popup heading is the row label', (await popupText()).includes('Licht Wohnzimmer'));

// switch.json ships exactly one widget - dimmer/datapoint views ship two.
check('switch role opens the built-in switch view', (await gridItems()) === 1, `cells=${await gridItems()}`);
await closePopup();
check('Escape closes the popup', (await popupCount()) === 0);

// ── 2. Role decides which built-in view opens ────────────────────────────────
await clickRowLabel('Dimmer Flur');
check('dimmer role opens the built-in dimmer view', (await popupText()).includes('Helligkeit'));
await closePopup();

await clickRowLabel('Temperatur Bad');
// The generic datapoint view lists the DP id (showId) - no other view does.
check('value role falls back to the generic datapoint view', (await popupText()).includes('demo.temp'));
await closePopup();

// ── 3. A control inside the row keeps its own click ──────────────────────────
// The dimmer row renders a range slider; operating it must not open a popup.
const slider = page.locator('input[type="range"]').first();
check('dimmer row renders its slider', (await slider.count()) === 1);
await slider.click();
await settle();
check('a click on the row control opens no popup', (await popupCount()) === 0, `count=${await popupCount()}`);

// ── 4. Never two popups (widget action + row action) ─────────────────────────
await show({ clickAction: { kind: 'popup-html', html: '<b>WIDGET-POPUP</b>' } });
await clickRowLabel('Licht Wohnzimmer');
check('row popup suppresses the widget popup', (await popupCount()) === 1, `count=${await popupCount()}`);
check('the row popup is the one shown', !(await popupText()).includes('WIDGET-POPUP'));
await closePopup();

// ── 5. Switching it off ──────────────────────────────────────────────────────
await show({ rowClickAction: { kind: 'none' } });
await clickRowLabel('Temperatur Bad');
check('rowClickAction none opens nothing', (await popupCount()) === 0, `count=${await popupCount()}`);

// ── 6. Per-entry override wins over the list setting ─────────────────────────
await page.evaluate(
    ([values]) => {
        window.__auraShot.mock(values);
        window.__auraShot.showWidgets([
            {
                id: 'w-list',
                type: 'list',
                title: 'Testliste',
                datapoint: '',
                layout: 'default',
                gridPos: { x: 0, y: 0, w: 12, h: 8 },
                options: {
                    rowClickAction: { kind: 'none' },
                    entries: [
                        { id: 'demo.temp', label: 'Temperatur Bad', role: 'value.temperature', clickAction: 'auto' },
                    ],
                },
            },
        ]);
    },
    [{ 'demo.temp': 21.5 }],
);
await settle();
await clickRowLabel('Temperatur Bad');
check('entry override re-enables the popup', (await popupCount()) === 1, `count=${await popupCount()}`);
await closePopup();

// ── 7. popup-dps renders (fabricated demo DPs are not in the real cache, so the
//        empty state is the expected content here - what matters is it mounts) ──
await show({ rowClickAction: { kind: 'popup-dps', scope: 'parent' } });
await clickRowLabel('Temperatur Bad');
check('popup-dps opens', (await popupCount()) === 1, `count=${await popupCount()}`);
check('popup-dps renders a body', (await popupText()).length > 0);
await closePopup();

check('no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
