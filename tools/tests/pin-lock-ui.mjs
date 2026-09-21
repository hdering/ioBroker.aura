// Verifies the PIN gate as the viewer meets it: a protected section / tab shows
// the keypad instead of its widgets, the right code lets them through, a wrong one
// does not, and an unlocked entry falls shut again on leaving.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/pin-lock-ui.mjs
//
// The dashboard is seeded through the screenshot harness — no real config, no
// datapoint is touched.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail && !ok ? ` — ${detail}` : ''}`);
};
const eq = (name, got, want) =>
    check(
        name,
        JSON.stringify(got) === JSON.stringify(want),
        `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
    );

const widget = (id, title) => ({
    id,
    type: 'info',
    title,
    datapoint: '',
    layout: 'default',
    gridPos: { x: 0, y: 0, w: 10, h: 6 },
    options: { showTitle: true },
});

// free → no PIN anywhere · office → section PIN · cellar → free section, locked tab
const LAYOUT = {
    id: 'l-pin',
    name: 'Pin',
    slug: 'pin',
    activeSectionId: 'sec-free',
    // Docked sidebar: the section menu is on screen without a tap, so the padlock checks can read it.
    settings: { layoutDrawerEnabled: true, layoutDrawerShowSingle: true, layoutDrawerPlacement: 'sidebar' },
    sections: [
        {
            id: 'sec-free',
            name: 'Wohnen',
            slug: 'wohnen',
            activeTabId: 't-free',
            tabs: [{ id: 't-free', name: 'Übersicht', slug: 'uebersicht', widgets: [widget('w-free', 'FREI')] }],
        },
        {
            id: 'sec-office',
            name: 'Büro',
            slug: 'buero',
            activeTabId: 't-office',
            pin: '1234',
            pinLength: 4,
            // Two tabs: with a single tab the bar hides anyway, which would make the
            // "tabs disappear while locked" checks pass for the wrong reason.
            tabs: [
                { id: 't-office', name: 'Schreibtisch', slug: 'tisch', widgets: [widget('w-office', 'BÜRO')] },
                { id: 't-office2', name: 'Ablage', slug: 'ablage', widgets: [widget('w-office2', 'ABLAGE')] },
            ],
        },
        {
            id: 'sec-same',
            name: 'Werkstatt',
            slug: 'werkstatt',
            activeTabId: 't-same',
            pin: '55',
            pinLength: 2,
            tabs: [
                {
                    id: 't-same',
                    name: 'Bank',
                    slug: 'bank',
                    pin: '55',
                    pinLength: 2,
                    widgets: [widget('w-same', 'WERK')],
                },
            ],
        },
        {
            id: 'sec-diff',
            name: 'Tresor',
            slug: 'tresor',
            activeTabId: 't-diff',
            pin: '11',
            pinLength: 2,
            tabs: [
                {
                    id: 't-diff',
                    name: 'Fach',
                    slug: 'fach',
                    pin: '22',
                    pinLength: 2,
                    widgets: [widget('w-diff', 'TRESOR')],
                },
            ],
        },
        {
            // Same gate, no badge: the entry stays gated but wears no padlock (#692).
            id: 'sec-quiet',
            name: 'Diskret',
            slug: 'diskret',
            activeTabId: 't-quiet',
            pin: '33',
            pinLength: 2,
            pinHideLock: true,
            tabs: [{ id: 't-quiet', name: 'Still', slug: 'still', widgets: [widget('w-quiet', 'STILL')] }],
        },
        {
            id: 'sec-cellar',
            name: 'Keller',
            slug: 'keller',
            activeTabId: 't-water',
            tabs: [
                { id: 't-water', name: 'Wasser', slug: 'wasser', widgets: [widget('w-water', 'WASSER')] },
                {
                    id: 't-heat',
                    name: 'Heizung',
                    slug: 'heizung',
                    pin: '77',
                    pinLength: 2,
                    widgets: [widget('w-heat', 'HEIZUNG')],
                },
                {
                    id: 't-hush',
                    name: 'Leise',
                    slug: 'leise',
                    pin: '88',
                    pinLength: 2,
                    pinHideLock: true,
                    widgets: [widget('w-hush', 'LEISE')],
                },
            ],
        },
    ],
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1000, height: 760 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
await page.evaluate((layout) => window.__auraShot.seed({ layouts: [layout] }), LAYOUT);

const PROMPT = '.aura-pin-prompt';
const goto = async (path) => {
    await page.evaluate((p) => {
        window.location.hash = `#${p}`;
    }, path);
    await page.waitForTimeout(250);
};
/** Tap a code on the keypad. */
const typeCode = async (code) => {
    for (const d of code)
        await page
            .locator(`${PROMPT} button`, { hasText: new RegExp(`^${d}$`) })
            .first()
            .click();
    await page.waitForTimeout(200);
};
const visible = async (sel) =>
    page
        .locator(sel)
        .first()
        .isVisible()
        .catch(() => false);
const state = async () => ({
    prompt: await visible(PROMPT),
    scope: await page
        .locator(PROMPT)
        .first()
        .getAttribute('data-pin-scope')
        .catch(() => null),
});

// ── a free view is untouched ──────────────────────────────────────────────────
console.log('\n── free view ──');
await goto('/view/pin/s/wohnen/tab/uebersicht');
eq('no prompt without a PIN', await state(), { prompt: false, scope: null });
check('the widget renders', await visible('.aura-widget-w-free'));

// ── a locked section ──────────────────────────────────────────────────────────
console.log('\n── locked section ──');
await goto('/view/pin/s/buero/tab/tisch');
eq('the section prompt is up', await state(), { prompt: true, scope: 'section' });
check('its widget is not mounted', !(await visible('.aura-widget-w-office')));
check('the section name is shown', await page.locator(PROMPT).getByText('Büro').first().isVisible());
check('its tabs are gone from the tab bar', (await page.getByText('Schreibtisch').count()) === 0);

await typeCode('12');
check('a partial code does not open', await visible(PROMPT));
await typeCode('99');
check('a wrong code is rejected', await visible(PROMPT));
check('the error is shown', await page.locator(PROMPT).getByText('Falsche PIN').first().isVisible());

await typeCode('1234');
check('the right code opens the section', !(await visible(PROMPT)));
check('the widget renders once unlocked', await visible('.aura-widget-w-office'));
check('the tab bar is back', (await page.getByText('Schreibtisch').count()) > 0);

// ── relock on leaving ─────────────────────────────────────────────────────────
console.log('\n── relock ──');
await goto('/view/pin/s/wohnen/tab/uebersicht');
await goto('/view/pin/s/buero/tab/tisch');
eq('coming back asks again', await state(), { prompt: true, scope: 'section' });

// ── a locked tab inside a free section ────────────────────────────────────────
console.log('\n── locked tab ──');
await goto('/view/pin/s/keller/tab/wasser');
check('the free tab of that section opens', await visible('.aura-widget-w-water'));
await goto('/view/pin/s/keller/tab/heizung');
eq('the tab prompt is up', await state(), { prompt: true, scope: 'tab' });
check('its widget is not mounted', !(await visible('.aura-widget-w-heat')));
check('the tab bar stays visible', (await page.getByText('Wasser').count()) > 0);

// Cancel returns to the last view the viewer was allowed to see.
await page.locator(PROMPT).getByText('Abbruch').first().click();
await page.waitForTimeout(300);
check('cancel goes back to the free tab', await visible('.aura-widget-w-water'));

await goto('/view/pin/s/keller/tab/heizung');
await typeCode('77');
check('the right code opens the tab', await visible('.aura-widget-w-heat'));

// ── a section PIN plus a tab PIN inside it ────────────────────────────────────
// The same code must not be asked for twice in a row; a different one still is.
console.log('\n── section + tab ──');
await goto('/view/pin/s/werkstatt/tab/bank');
eq('the section asks first', await state(), { prompt: true, scope: 'section' });
await typeCode('55');
check('the same code opens the tab too', await visible('.aura-widget-w-same'));

await goto('/view/pin/s/tresor/tab/fach');
eq('a different pair asks for the section', await state(), { prompt: true, scope: 'section' });
await typeCode('11');
eq('and then for the tab', await state(), { prompt: true, scope: 'tab' });
await typeCode('22');
check('the second code opens the tab', await visible('.aura-widget-w-diff'));

// A reload always re-locks — the unlock map is never persisted.
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
await page.evaluate((layout) => window.__auraShot.seed({ layouts: [layout] }), LAYOUT);
await goto('/view/pin/s/keller/tab/heizung');
eq('a reload re-locks', await state(), { prompt: true, scope: 'tab' });

// ── the padlock badge (#692) ─────────────────────────────
// Cosmetics: hiding the badge must leave the gate exactly where it was.
console.log('\n── padlock ──');
const locks = (scope) => page.locator(`[data-aura-pin-lock="${scope}"]`).count();
// A fresh load so nothing from the checks above is still unlocked.
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
await page.evaluate((layout) => window.__auraShot.seed({ layouts: [layout] }), LAYOUT);
await goto('/view/pin/s/wohnen/tab/uebersicht');
check('locked sections wear a padlock in the menu', (await locks('section')) > 0);
const badgedSections = await page
    .locator('[data-aura-pin-lock="section"]')
    .evaluateAll((els) => els.map((el) => el.closest('button')?.textContent ?? ''));
check(
    'the section with pinHideLock wears none',
    !badgedSections.some((txt) => txt.includes('Diskret')),
    badgedSections.join(' | '),
);
await goto('/view/pin/s/diskret/tab/still');
eq('it is gated all the same', await state(), { prompt: true, scope: 'section' });
await typeCode('33');
check('and opens with its code', await visible('.aura-widget-w-quiet'));

await goto('/view/pin/s/keller/tab/wasser');
check('the locked tab wears a padlock', (await locks('tab')) === 1, String(await locks('tab')));
check('the tab with pinHideLock is still listed', (await page.getByText('Leise').count()) > 0);
await goto('/view/pin/s/keller/tab/leise');
eq('that tab is gated all the same', await state(), { prompt: true, scope: 'tab' });
await typeCode('88');
check('and opens with its code', await visible('.aura-widget-w-hush'));

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
    failed.forEach((f) => console.log(`  FAIL ${f.name} — ${f.detail}`));
    process.exit(1);
}
