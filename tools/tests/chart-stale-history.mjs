// A late history answer for the PREVIOUS range must not overwrite the current one (issue #1013).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/chart-stale-history.mjs
//
// The harness answers every query longer than two days only after 1.5 s — a database that takes
// longer for a month than for a day. Switching 24 h → 30 days → 24 h faster than that used to end
// with the 24 h chip lit over a month of data: the 30-day answer arrived last and won. Checked for
// the advanced chart (chips) and the simple chart (range changed on the mounted widget).
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const DAY = 86_400_000;
const DELAY = 1500;

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

const now = Date.now();
// Hourly readings over 40 days.
const rows = Array.from({ length: 40 * 24 }, (_, i) => [now - (40 * 24 - 1 - i) * 3_600_000, 20 + 3 * Math.sin(i / 8)]);

const setup = (dp) =>
    page.evaluate(
        ([dp, rows, delay]) => {
            const a = window.__auraShot;
            a.enableHistory(true);
            a.mockHistory({ [dp]: rows }, { slowSpanMs: 2 * 86_400_000, slowDelayMs: delay });
            a.mockObject({
                [dp]: { type: 'state', common: { type: 'number', custom: { 'sql.0': { enabled: true } } } },
            });
            a.mock({ [dp]: 21.5 });
            a.mockServerState({ [dp]: 21.5 });
        },
        [dp, rows, DELAY],
    );

// ── 1. Advanced chart: chips 30 Tage → 24 Std in quick succession ───────────────
{
    const dp = 'demo.stale1';
    await setup(dp);
    await page.evaluate((dp) => {
        window.__auraShot.showWidgets([
            {
                id: 'w-stale-echart',
                type: 'echart',
                title: 'Temperatur',
                datapoint: '',
                layout: 'default',
                gridPos: { x: 0, y: 0, w: 30, h: 14 },
                options: {
                    echartMode: 'timeseries',
                    echartRange: '24h',
                    echartVisibleRanges: ['24h', '7d', '30d'],
                    echartJsonExtra: '{"animation":false}',
                    echartSeries: ['a', 'b', 'c'].map((id) => ({
                        id,
                        name: id,
                        datapointId: dp,
                        chartType: 'line',
                        historyInstance: 'sql.0',
                        historyRange: '24h',
                        aggregate: 'minmax',
                    })),
                },
            },
        ]);
    }, dp);
    await page.waitForFunction(() => (window.__auraShot.chartSeries?.()?.[0]?.points ?? 0) > 0, null, {
        timeout: 20000,
    });
    const item = page.locator('.react-grid-item').first();
    await item.locator('button:text-is("30 Tage")').first().click();
    await page.waitForTimeout(150);
    await item.locator('button:text-is("24 Std")').first().click();
    // Long enough for the slow 30-day answers to land.
    await page.waitForTimeout(DELAY + 1500);
    const series = await page.evaluate(() => window.__auraShot.chartSeries());
    const firsts = (series ?? []).map((s) => (typeof s.first === 'number' ? s.first : NaN));
    const t = Date.now();
    check(
        'echart: every series shows the last 24 h, not the late 30-day answer',
        firsts.length === 3 && firsts.every((f) => f >= t - 1.1 * DAY),
        firsts.map((f) => `${((t - f) / DAY).toFixed(2)} d`).join(', '),
    );
}

// ── 2. Simple chart: range changed on the mounted widget ────────────────────────
{
    const dp = 'demo.stale2';
    await setup(dp);
    const simple = (historyRange) => ({
        id: 'w-stale-chart',
        type: 'chart',
        title: 'Temperatur',
        datapoint: dp,
        layout: 'default',
        gridPos: { x: 0, y: 0, w: 30, h: 14 },
        options: { historyInstance: 'sql.0', historyRange },
    });
    await page.evaluate((w) => window.__auraShot.showWidgets([w]), simple('24h'));
    await page.waitForTimeout(800);
    await page.evaluate((w) => window.__auraShot.showWidgets([w]), simple('30d'));
    await page.waitForTimeout(150);
    await page.evaluate((w) => window.__auraShot.showWidgets([w]), simple('24h'));
    await page.waitForTimeout(DELAY + 1500);
    // The x axis of the simple chart spans the plotted points: read the first tick's time span via
    // the path's point count instead — 24 h of hourly rows are ~24 points, 30 days several hundred.
    const pts = await page.evaluate(() => {
        const path = document.querySelector(
            '.react-grid-item .recharts-area-curve, .react-grid-item .recharts-line-curve',
        );
        const d = path?.getAttribute('d') ?? '';
        return (d.match(/[MLC]/g) ?? []).length;
    });
    check('chart: shows the 24 h answer, not the late 30-day one', pts > 0 && pts < 100, `${pts} path segments`);
}

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
