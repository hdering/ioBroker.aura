// popup.close datapoints (issue #861) against the dev server.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/popup-close-dp.mjs
//
// Values are injected through the screenshot harness — no socket write, the
// self-reset to false is blocked in screenshot mode. Asserted:
//
//   1. A stacked widget-click popup (two levels) closes completely.
//   2. A popup opened by a datapoint trigger closes.
//   3. The per-client datapoint closes; another client's does not.
//   4. false leaves an open popup alone.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const CLIENT = 'shot-close';
const GLOBAL_DP = 'aura.0.popup.close';
const CLIENT_DP = `aura.0.clients.${CLIENT}.popup.close`;
const TRIGGER_DP = 'demo.popupCloseTrigger';

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
        widgets: [valueWidget('nest', 'Weiter', { kind: 'popup-view', viewId: 'pv-b' })],
    },
    { id: 'pv-b', name: 'Zweite Ebene', widgets: [valueWidget('leaf', 'Ende', null)] },
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
                ],
            },
        ],
    },
];

const TRIGGER = {
    id: 'pt-close',
    name: 'Test',
    enabled: true,
    clause: { datapoint: TRIGGER_DP, operator: 'true', value: '' },
    host: {
        id: 'ptw-close',
        type: 'value',
        title: 'Trigger-Popup',
        datapoint: TRIGGER_DP,
        gridPos: { x: 0, y: 0, w: 1, h: 1 },
        options: { clickAction: { kind: 'popup-html', html: '<b>TRIGGER-OPEN</b>' } },
    },
    resetDp: false,
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

const settle = () => page.waitForTimeout(350);
const popups = () => page.locator('[data-aura-click-popup]').count();
const setDp = (id, val) => page.evaluate(([i, v]) => window.__auraShot.mock({ [i]: v }), [id, val]);

await page.goto(`${BASE}/?shot=1&client=${CLIENT}#/view/zuhause/tab/start`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 60000 });
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

async function openStack() {
    await page.click('.aura-widget-opener');
    await settle();
    await page.locator('[data-aura-popup-widget="nest"]').last().click();
    await settle();
}

// ── 1. Stacked widget-click popups ────────────────────────────────────────────
await openStack();
check('two stacked popups are open', (await popups()) === 2);
await setDp(GLOBAL_DP, true);
await settle();
check('popup.close = true closes the whole stack', (await popups()) === 0);
await setDp(GLOBAL_DP, false);

// ── 2. Trigger popup (runtime slot) ───────────────────────────────────────────
await page.evaluate(
    ([dp, rule]) => {
        window.__auraShot.mock({ [dp]: false });
        window.__auraShot.dpTriggers([rule]);
    },
    [TRIGGER_DP, TRIGGER],
);
await settle();
await setDp(TRIGGER_DP, true);
await settle();
const triggerOpen = await page
    .locator('text=TRIGGER-OPEN')
    .first()
    .isVisible()
    .catch(() => false);
check('trigger popup opened', triggerOpen);
await setDp(GLOBAL_DP, true);
await settle();
check('popup.close closes the trigger popup', (await page.locator('text=TRIGGER-OPEN').count()) === 0);
await setDp(GLOBAL_DP, false);
await page.evaluate(() => window.__auraShot.dpTriggers(false));

// ── 3. Per-client datapoint ───────────────────────────────────────────────────
await openStack();
await setDp('aura.0.clients.someone-else.popup.close', true);
await settle();
check("another client's popup.close leaves this one open", (await popups()) === 2);
await setDp(CLIENT_DP, true);
await settle();
check('clients.<id>.popup.close closes this device', (await popups()) === 0);
await setDp(CLIENT_DP, false);

// ── 4. false is no command ────────────────────────────────────────────────────
await openStack();
await setDp(GLOBAL_DP, false);
await settle();
check('popup.close = false leaves the popup open', (await popups()) === 2);
await setDp(GLOBAL_DP, true);
await settle();
await setDp(GLOBAL_DP, false);

// ── 5. Recipe without popup.close: second condition + closeOnFalse ────────────
// open DP == true AND close DP != true; setting the close DP closes the popup.
const CLOSE_DP = 'demo.popupCloseFlag';
await page.evaluate(
    ([dp, closeDp, rule]) => {
        window.__auraShot.mock({ [dp]: false, [closeDp]: false });
        window.__auraShot.dpTriggers([rule]);
    },
    [
        TRIGGER_DP,
        CLOSE_DP,
        {
            ...TRIGGER,
            closeOnFalse: true,
            extraClauses: [{ datapoint: CLOSE_DP, operator: '!=', value: 'true', join: 'AND' }],
        },
    ],
);
await settle();
await setDp(TRIGGER_DP, true);
await settle();
check('recipe: trigger popup opens', (await page.locator('text=TRIGGER-OPEN').count()) > 0);
await setDp(CLOSE_DP, true);
await settle();
check('recipe: close DP = true closes it', (await page.locator('text=TRIGGER-OPEN').count()) === 0);

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
