// Verifies the condition effect "reload widget" (issue #537) against the dev server.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/condition-refresh.mjs
//
// An iframe is opaque to Aura: the page behind a static URL can change without
// anything in the widget config changing, so nothing remounts the element and the
// embedded chart keeps showing stale data. A condition rule with `refreshWidget`
// remounts the widget, which is the only way to make a foreign document reload.
//
// Datapoint values are injected into the in-memory cache via the screenshot
// harness (__auraShot.mock) — no socket write, no real datapoint is touched.
// Checked: no reload while priming, reload on every change with the 'changed'
// operator, rising-edge-only for state rules, opt-out, and that a rule without
// the flag leaves the widget alone.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const DP = 'demo.refreshTrigger';
const OTHER_DP = 'demo.refreshOther';
const PAGE = 'data:text/html,<body style="margin:0;background:%23dbeafe">embedded</body>';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

function rule(clauses, extra = {}) {
    return {
        id: 'cr-rule',
        label: 'Reload',
        logic: 'AND',
        clauses,
        style: {},
        effect: 'none',
        refreshWidget: true,
        ...extra,
    };
}

function widget(conditions) {
    return {
        id: 'cr-test',
        type: 'iframe',
        title: 'Refresh',
        datapoint: '',
        gridPos: { x: 0, y: 0, w: 14, h: 10 },
        options: { iframeUrl: PAGE, conditions },
    };
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });
await page.evaluate(() => window.__auraShot.conditionRefresh(true));

const settle = () => page.waitForTimeout(500);

/** Marks the iframe so a remount can be told apart from a re-render. */
const tag = () =>
    page.evaluate(() => {
        const el = document.querySelector('.aura-widget-cr-test iframe');
        if (!el) return false;
        el.__refreshProbe = 1;
        return true;
    });

/** True when the element was replaced, i.e. the widget reloaded. */
const reloaded = () =>
    page.evaluate(() => {
        const el = document.querySelector('.aura-widget-cr-test iframe');
        return !!el && !el.__refreshProbe;
    });

const setDp = (values) => page.evaluate((v) => window.__auraShot.mock(v), values);

/** Seed values first so the rule primes against them, then mount the widget. */
async function mount(conditions, seed) {
    await setDp(seed);
    await page.evaluate(([w]) => window.__auraShot.showWidgets([w]), [widget(conditions)]);
    await settle();
}

// ── 1. Priming must not reload ────────────────────────────────────────────────
// The values the rule starts watching are not a transition — otherwise every
// page load and every tab switch would reload the embedded page.
{
    await mount([rule([{ datapoint: DP, operator: 'changed', value: '' }])], { [DP]: 2025 });
    const tagged = await tag();
    await settle();
    check('no reload while priming', tagged && !(await reloaded()), tagged ? '' : 'no iframe found');
}

// ── 2. 'changed' reloads on every new value ───────────────────────────────────
{
    await tag();
    await setDp({ [DP]: 2026 });
    await settle();
    check("'changed' reloads when the datapoint moves", await reloaded());

    await tag();
    await setDp({ [DP]: 2027 });
    await settle();
    check("'changed' reloads again on the next change — no edge needed", await reloaded());
}

// ── 3. …but only for the datapoints the rule names ────────────────────────────
{
    await tag();
    await setDp({ [OTHER_DP]: 'irrelevant' });
    await settle();
    check('an unrelated datapoint does not reload the widget', !(await reloaded()));
}

// ── 4. A state rule reloads on the rising edge only ───────────────────────────
{
    await mount([rule([{ datapoint: DP, operator: '==', value: 'go' }])], { [DP]: 'idle' });
    await tag();
    await setDp({ [DP]: 'go' });
    await settle();
    check('state rule reloads when it flips to true', await reloaded());

    await tag();
    await setDp({ [DP]: 'go' });
    await setDp({ [DP]: 'go' });
    await settle();
    check('state rule does not re-fire while it stays true', !(await reloaded()));

    await tag();
    await setDp({ [DP]: 'idle' });
    await settle();
    check('state rule does not fire on the falling edge', !(await reloaded()));

    await tag();
    await setDp({ [DP]: 'go' });
    await settle();
    check('state rule fires again after a full cycle', await reloaded());
}

// ── 5. The flag is opt-in ─────────────────────────────────────────────────────
// A rule that only colours the widget must never remount it — that is the
// unpredictable-flicker case the explicit toggle exists to prevent.
{
    await mount([rule([{ datapoint: DP, operator: 'changed', value: '' }], { refreshWidget: false })], { [DP]: 1 });
    await tag();
    await setDp({ [DP]: 2 });
    await settle();
    check('a rule without the flag leaves the widget alone', !(await reloaded()));
}

// ── 6. Styling still works next to a reload rule ──────────────────────────────
// The reload path evaluates its own verdict; the style verdict must be unaffected.
{
    await mount(
        [
            rule([{ datapoint: DP, operator: '==', value: 'hot' }], {
                style: { border: 'rgb(255, 0, 0)' },
            }),
        ],
        { [DP]: 'cold' },
    );
    await setDp({ [DP]: 'hot' });
    await settle();
    const border = await page.evaluate(() => {
        const el = document.querySelector('.aura-widget-cr-test');
        return el ? getComputedStyle(el).getPropertyValue('--widget-border').trim() : '';
    });
    check('style of a reload rule still applies', border === 'rgb(255, 0, 0)', border || 'no border var');
}

// ── 7. The reported case: an iframe inside an open popup view ─────────────────
// Closing and reopening the popup was the reporter's workaround, so the rule has
// to reach a widget that is rendered by the popup, not by the dashboard grid.
{
    const viewWidget = {
        ...widget([rule([{ datapoint: DP, operator: 'changed', value: '' }])]),
        id: 'cr-popup',
        gridPos: { x: 0, y: 0, w: 12, h: 8 },
    };
    // Popup-view widgets render bare (no WidgetFrame, so no `aura-widget-<id>`
    // class) — clear the grid so the only iframe on the page is the popup's.
    await page.evaluate(
        ([dp, view]) => {
            window.__auraShot.showWidgets([]);
            window.__auraShot.mock({ [dp]: 2025 });
            window.__auraShot.popupViews([view]);
            window.__auraShot.dpTriggers([
                {
                    id: 'cr-open',
                    name: 'Open',
                    enabled: true,
                    clause: { datapoint: 'demo.refreshOpen', operator: 'true', value: '' },
                    host: {
                        id: 'cr-host',
                        type: 'value',
                        title: 'Popup',
                        datapoint: '',
                        gridPos: { x: 0, y: 0, w: 1, h: 1 },
                        options: { clickAction: { kind: 'popup-view', viewId: 'cr-view' } },
                    },
                    resetDp: false,
                },
            ]);
            window.__auraShot.mock({ 'demo.refreshOpen': false });
        },
        [DP, { id: 'cr-view', name: 'Refresh view', widgets: [viewWidget] }],
    );
    await settle();
    await page.evaluate(() => window.__auraShot.mock({ 'demo.refreshOpen': true }));
    await settle();

    const tagged = await page.evaluate(() => {
        const el = document.querySelector('iframe');
        if (!el) return false;
        el.__refreshProbe = 1;
        return true;
    });
    check('popup view renders the iframe widget', tagged);

    await setDp({ [DP]: 2026 });
    await settle();
    const popupReloaded = await page.evaluate(() => {
        const el = document.querySelector('iframe');
        return !!el && !el.__refreshProbe;
    });
    check('iframe inside an open popup view reloads without closing it', tagged && popupReloaded);
}

check('no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
