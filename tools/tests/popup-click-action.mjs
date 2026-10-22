// Click actions of widgets inside a popup view (issue #829) against the dev server.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/popup-click-action.mjs
//
// Popup views render their widgets bare (no WidgetFrame), so a click action set on
// such a widget used to do nothing at all. Asserted here:
//
//   1. A tab jump runs and closes the popup — the jump happens behind the dialog.
//   2. A popup action stacks a second popup on top; Escape closes only that one.
//   3. The stack is capped at MAX_POPUP_DEPTH (3): a view that opens itself swaps
//      the top popup's content instead of piling up dialogs.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const valueWidget = (id, title, clickAction, x = 0) => ({
    id,
    type: 'value',
    title,
    datapoint: 'demo.value',
    gridPos: { x, y: 0, w: 3, h: 2 },
    options: clickAction ? { clickAction } : {},
});

const VIEWS = [
    {
        id: 'pv-a',
        name: 'Erste Ebene',
        widgets: [
            valueWidget('nav', 'Sprung', { kind: 'link-tab', layoutId: 'lay-test', tabId: 'tab-ziel' }),
            valueWidget('nest', 'Weiter', { kind: 'popup-view', viewId: 'pv-b' }, 3),
            valueWidget('plain', 'Ohne Aktion', null, 6),
        ],
    },
    {
        id: 'pv-b',
        name: 'Zweite Ebene',
        widgets: [valueWidget('self', 'Nochmal', { kind: 'popup-view', viewId: 'pv-b' })],
    },
];

const LAYOUTS = [
    {
        id: 'lay-test',
        name: 'Zuhause',
        slug: 'zuhause',
        activeSectionId: 'sec-main',
        sections: [
            {
                id: 'sec-main',
                name: 'Haupt',
                slug: 'haupt',
                activeTabId: 'tab-start',
                tabs: [
                    {
                        id: 'tab-start',
                        name: 'Start',
                        slug: 'start',
                        widgets: [valueWidget('opener', 'Öffner', { kind: 'popup-view', viewId: 'pv-a' })],
                    },
                    { id: 'tab-ziel', name: 'Ziel', slug: 'ziel', widgets: [] },
                ],
            },
        ],
    },
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

const settle = () => page.waitForTimeout(350);
const popups = () => page.locator('[data-aura-click-popup]').count();
const cell = (id) => page.locator(`[data-aura-popup-widget="${id}"]`).last();
const hash = () => page.evaluate(() => location.hash);

async function start() {
    await page.goto('about:blank');
    await page.goto(`${BASE}/?shot=1#/view/zuhause/tab/start`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
    await page.evaluate(
        ([ls, vs]) => {
            window.__auraShot.mock({ 'demo.value': { val: 21.5, unit: '°C' } });
            window.__auraShot.popupViews(vs);
            window.__auraShot.seed({ layouts: ls, activeLayoutId: ls[0].id });
        },
        [LAYOUTS, VIEWS],
    );
    await page.waitForSelector('.aura-widget-opener', { timeout: 10000 });
    await settle();
    await page.click('.aura-widget-opener');
    await settle();
}

// ── 1. Tab jump from inside the popup ─────────────────────────────────────────
await start();
check('Öffner zeigt ein Popup', (await popups()) === 1);
check(
    'Zelle mit Aktion zeigt den Zeiger',
    (await cell('nav').evaluate((el) => getComputedStyle(el).cursor)) === 'pointer',
);
check(
    'Zelle ohne Aktion bleibt beim Pfeil',
    (await cell('plain').evaluate((el) => getComputedStyle(el).cursor)) !== 'pointer',
);
await cell('plain').click();
await settle();
check('Klick ohne Aktion lässt das Popup stehen', (await popups()) === 1);
await cell('nav').click();
await settle();
let h = await hash();
check('Tab-Sprung aus dem Popup navigiert', h.endsWith('/tab/ziel'), h);
check('Tab-Sprung schließt das Popup', (await popups()) === 0);

// ── 2. Popup on popup, Escape closes the top one only ─────────────────────────
await start();
await cell('nest').click();
await settle();
check('Popup-Aktion stapelt ein zweites Popup', (await popups()) === 2);
await page.keyboard.press('Escape');
await settle();
check('Escape schließt nur das oberste Popup', (await popups()) === 1);
await page.keyboard.press('Escape');
await settle();
check('zweites Escape schließt das letzte', (await popups()) === 0);

// ── 3. Depth cap: a self-opening view swaps instead of stacking ───────────────
await start();
await cell('nest').click();
await settle();
await cell('self').click();
await settle();
check('dritte Ebene geht noch auf', (await popups()) === 3);
await cell('self').click();
await settle();
check('über der Grenze bleibt es bei drei Popups', (await popups()) === 3);
check(
    'ersetzt statt gestapelt: zwei Ebenen mit dieser View',
    (await page.locator('[data-aura-popup-widget="self"]').count()) === 2,
);
await page.keyboard.press('Escape');
await settle();
check('Escape nach dem Ersetzen schließt eine Ebene', (await popups()) === 2);

check('keine Seitenfehler', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} Checks ok`);
process.exit(failed.length ? 1 : 0);
