// Verifies that a widget re-mounting picks up a datapoint that changed while it
// held no subscription (issue #528, popup case).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/dp-cache-freshness.mjs
//
// The frontend caches every value it has ever seen so widgets can render without a
// null-flash. That cache is only kept current for IDs with a live subscription, so
// an entry whose last subscriber went away silently rots. A popup subscribes on
// open and unsubscribes on close — so before the fix, reopening it showed the value
// from the previous open until the datapoint happened to change again.
//
// `__auraShot.mockServerState` plays the server: it decides what getState answers,
// without touching the local cache or emitting a stateChange. That is exactly a
// datapoint changing while nobody is subscribed — otherwise unreachable without
// writing to a real ioBroker instance.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const DP = 'demo.freshness';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const widget = (id) => ({
    id,
    type: 'value',
    title: 'Freshness',
    datapoint: DP,
    gridPos: { x: 0, y: 0, w: 3, h: 2 },
    options: {},
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 900, height: 600 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });

// Read the value out of the widget itself — the page also carries the resolution
// badge and other chrome with numbers in it. Returned as a number: the widget
// formats according to its own settings (22 may render as "22.00").
const shown = async (widgetId) => {
    const loc = page.locator(`.aura-widget-${widgetId}`).first();
    try {
        await loc.waitFor({ state: 'visible', timeout: 5000 });
        await page.waitForFunction(
            (cls) => /\d/.test(document.querySelector(cls)?.innerText ?? ''),
            `.aura-widget-${widgetId}`,
            { timeout: 5000 },
        );
    } catch {
        return null;
    }
    const m = (await loc.innerText()).match(/(-?\d+(?:[.,]\d+)?)/);
    return m ? Number(m[1].replace(',', '.')) : null;
};
const settle = () => page.waitForTimeout(500);
// Cached values also count as fresh for a few seconds after being confirmed (so the
// load-time prefetch isn't wasted). Wait that out to exercise the stale path.
const outliveFreshTtl = () => page.waitForTimeout(3600);

// ── 1. First mount reads the server value ────────────────────────────────────
await page.evaluate(
    ([dp, w]) => {
        window.__auraShot.mockServerState({ [dp]: 11 });
        window.__auraShot.showWidgets([w]);
    },
    [DP, widget('w-1')],
);
await settle();
const first = await shown('w-1');
check('first mount shows the server value', first === 11, `got ${first}`);

// ── 2. Unmount, then the datapoint changes with nobody subscribed ─────────────
await page.evaluate(() => window.__auraShot.showWidgets([]));
await settle();
await page.evaluate(([dp]) => window.__auraShot.mockServerState({ [dp]: 22 }), [DP]);
await outliveFreshTtl();

const staleAfterUnmount = await page.evaluate(([dp]) => window.__auraShot.isFresh(dp), [DP]);
check('cache entry goes stale once unsubscribed', staleAfterUnmount === false, `isFresh=${staleAfterUnmount}`);

// ── 3. Re-mount must show the NEW value, not the cached one ───────────────────
await page.evaluate(([w]) => window.__auraShot.showWidgets([w]), [widget('w-2')]);
await settle();
const after = await shown('w-2');
check('re-mount picks up the change made while unsubscribed', after === 22, `got ${after} (stale would be 11)`);

// ── 4. While mounted, the value counts as fresh (no redundant round-trips) ────
const freshWhileMounted = await page.evaluate(([dp]) => window.__auraShot.isFresh(dp), [DP]);
check('subscribed value counts as fresh', freshWhileMounted === true, `isFresh=${freshWhileMounted}`);

// ── 5. A widget joining a DP that IS live trusts the maintained value ─────────
// w-2 stays mounted and subscribed, so its cached value is genuinely current. A
// second widget joining must show that same value — not re-read a server value
// that changed without a stateChange (which cannot happen for a subscribed DP).
await page.evaluate(([dp]) => window.__auraShot.mockServerState({ [dp]: 33 }), [DP]);
await page.evaluate(
    ([w1, w2]) => window.__auraShot.showWidgets([w1, w2]),
    [widget('w-2'), { ...widget('w-3'), gridPos: { x: 3, y: 0, w: 3, h: 2 } }],
);
await settle();
const joined = await shown('w-3');
check('a widget joining a live DP shows the maintained value', joined === 22, `got ${joined}`);

await page.evaluate(() => window.__auraShot.mockServerState(false));
check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
