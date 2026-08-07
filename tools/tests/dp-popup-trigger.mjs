// Verifies the datapoint-driven popup triggers (issue #523) against the dev server.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/dp-popup-trigger.mjs
//
// Uses the screenshot harness (__auraShot) so datapoint values are injected into
// the in-memory cache only — no socket write, no real datapoint is touched.
// Checked: no fire while priming, fire on the rising edge, no re-fire while the
// condition stays true, re-fire after a real false→true cycle, closeOnFalse.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const DP = 'demo.popupTrigger';
const MARKER = 'TRIGGER-OK';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

function trigger(overrides = {}) {
    return {
        id: 'pt-test',
        name: 'Test',
        enabled: true,
        clause: { datapoint: DP, operator: 'true', value: '' },
        host: {
            id: 'ptw-test',
            type: 'value',
            title: 'Trigger-Popup',
            datapoint: DP,
            gridPos: { x: 0, y: 0, w: 1, h: 1 },
            options: { clickAction: { kind: 'popup-html', html: `<b>${MARKER}</b>` } },
        },
        // Reset writes are blocked in screenshot mode anyway; keep it off so the
        // popup does not immediately close itself via closeOnFalse tests.
        resetDp: false,
        ...overrides,
    };
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });

const popupVisible = () =>
    page
        .locator(`text=${MARKER}`)
        .first()
        .isVisible({ timeout: 500 })
        .catch(() => false);
const settle = () => page.waitForTimeout(400);

// ── 1. Priming must not fire ──────────────────────────────────────────────────
// The DP already sits at `true` when the rule starts watching — exactly the
// page-reload case that must stay silent.
await page.evaluate(
    ([dp, rule]) => {
        window.__auraShot.mock({ [dp]: true });
        window.__auraShot.dpTriggers([rule]);
    },
    [DP, trigger()],
);
await settle();
check('no popup while priming on an already-true datapoint', !(await popupVisible()));

// ── 2. Rising edge fires ──────────────────────────────────────────────────────
await page.evaluate((dp) => window.__auraShot.mock({ [dp]: false }), DP);
await settle();
await page.evaluate((dp) => window.__auraShot.mock({ [dp]: true }), DP);
await settle();
check('popup opens on the false→true edge', await popupVisible());

// ── 3. Repeated true does not re-fire ────────────────────────────────────────
await page.locator('.fixed.inset-0 button').first().click();
await settle();
check('popup closes via its close button', !(await popupVisible()));
await page.evaluate((dp) => window.__auraShot.mock({ [dp]: true }), DP);
await settle();
check('no re-open while the datapoint stays true', !(await popupVisible()));

// ── 4. Full cycle re-fires ───────────────────────────────────────────────────
await page.evaluate((dp) => window.__auraShot.mock({ [dp]: false }), DP);
await settle();
await page.evaluate((dp) => window.__auraShot.mock({ [dp]: true }), DP);
await settle();
check('popup re-opens after a full false→true cycle', await popupVisible());

// ── 5. closeOnFalse ──────────────────────────────────────────────────────────
await page.evaluate(
    ([dp, rule]) => {
        window.__auraShot.dpTriggers(false);
        window.__auraShot.mock({ [dp]: false });
        window.__auraShot.dpTriggers([rule]);
    },
    [DP, trigger({ closeOnFalse: true })],
);
await settle();
await page.evaluate((dp) => window.__auraShot.mock({ [dp]: true }), DP);
await settle();
const openedForClose = await popupVisible();
await page.evaluate((dp) => window.__auraShot.mock({ [dp]: false }), DP);
await settle();
check('closeOnFalse closes the popup again', openedForClose && !(await popupVisible()));

// ── 6. Disabled rule stays silent ────────────────────────────────────────────
await page.evaluate(
    ([dp, rule]) => {
        window.__auraShot.dpTriggers(false);
        window.__auraShot.mock({ [dp]: false });
        window.__auraShot.dpTriggers([rule]);
    },
    [DP, trigger({ enabled: false })],
);
await settle();
await page.evaluate((dp) => window.__auraShot.mock({ [dp]: true }), DP);
await settle();
check('disabled rule never opens a popup', !(await popupVisible()));

// ── 7. Non-popup actions are ignored ─────────────────────────────────────────
// A navigation action has no click to act on here; before it was filtered out
// it rendered as a bare backdrop over the dashboard and swallowed clicks.
for (const action of [
    { kind: 'link-tab', layoutId: 'l1', tabId: 't1' },
    { kind: 'popup-view', viewId: '' },
]) {
    await page.evaluate(
        ([dp, rule]) => {
            window.__auraShot.dpTriggers(false);
            window.__auraShot.mock({ [dp]: false });
            window.__auraShot.dpTriggers([rule]);
        },
        [DP, trigger({ host: { ...trigger().host, options: { clickAction: action } } })],
    );
    await settle();
    await page.evaluate((dp) => window.__auraShot.mock({ [dp]: true }), DP);
    await settle();
    const backdrop = await page.locator('div.fixed.inset-0.z-\\[300\\]').count();
    check(
        `no overlay for an unusable action (${action.kind}${action.viewId === '' ? ', no view' : ''})`,
        backdrop === 0,
    );
}

check('no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
