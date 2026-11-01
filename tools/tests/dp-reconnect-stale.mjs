// Verifies that a widget shows the revalidated state after a reconnect (issue #900).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/dp-reconnect-stale.mjs
//
// A drop makes every useDatapoint effect unsubscribe. On reconnect the socket's
// revalidation pass re-reads all cached IDs — and it can answer before the effects
// re-subscribe, so it notifies nobody. The re-run effect then saw a perfectly
// fresh cache, skipped its own read, and kept the pre-drop local value: the
// "last update" cell stayed frozen until the sensor happened to report again.
//
// `simulateDisconnect`/`simulateReconnect` play exactly that order without
// touching the real socket.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const DP = 'demo.reconnect.contact';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const T1 = new Date(2026, 0, 2, 10, 0).getTime();
const T2 = new Date(2026, 2, 4, 11, 30).getTime();
const at = (ts) => ({ val: true, ack: true, ts, lc: T1 });

const widget = {
    id: 'w-lc',
    type: 'universal',
    layout: 'custom',
    title: 'Reconnect',
    datapoint: '',
    gridPos: { x: 0, y: 0, w: 4, h: 2 },
    options: {
        showTitle: false,
        showIcon: false,
        customGrid: {
            cols: 1,
            rows: 1,
            cells: [{ type: 'lastchange', dpId: DP, lastChangeSource: 'lastUpdate', lastChangeFormat: 'datetime' }],
        },
    },
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 900, height: 600 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });

const shown = () => page.locator('.aura-widget-w-lc').first().innerText();
const settle = () => page.waitForTimeout(500);

// ── 1. First mount shows the server's last update ────────────────────────────
await page.evaluate(
    ([dp, s, w]) => {
        window.__auraShot.mockServerState({ [dp]: s });
        window.__auraShot.showWidgets([w]);
    },
    [DP, at(T1), widget],
);
await settle();
const first = await shown();
check('first mount shows the first update', first.includes('02.01.26'), `got "${first}"`);

// ── 2. Drop, the sensor reports again, reconnect ─────────────────────────────
await page.evaluate(() => window.__auraShot.simulateDisconnect());
await settle();
await page.evaluate(
    ([dp, s]) => {
        window.__auraShot.mockServerState({ [dp]: s });
        window.__auraShot.simulateReconnect({ [dp]: s });
    },
    [DP, at(T2)],
);
await settle();
const after = await shown();
check('reconnect shows the revalidated update', after.includes('04.03.26'), `got "${after}" (stale: 02.01.26)`);

await page.evaluate(() => window.__auraShot.mockServerState(false));
check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
