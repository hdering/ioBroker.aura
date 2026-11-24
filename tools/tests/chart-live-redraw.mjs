// Verifies that a live value is merged into the drawn timeseries chart instead of rebuilding it,
// and that `echartLiveInterval` holds frequent readings back (issue #1015).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/chart-live-redraw.mjs
//
// The reported picture: six series on sockets that report every 1–4 s. Every reading of any of
// them redrew all lines from left to right — the chart replaced its series, and without ids
// echarts could not match the new ones to the drawn ones, so it dropped and recreated each.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const DPS = ['demo.0.plug.a.power', 'demo.0.plug.b.power', 'demo.0.plug.c.power'];

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const MIN = 60_000;
const NOW = Date.now();
const raw = (base) => {
    const out = [];
    for (let ts = NOW - 60 * MIN; ts < NOW - MIN; ts += MIN) out.push([ts, base + ((ts / MIN) % 7)]);
    return out;
};

const browser = await chromium.launch();
const page = await (
    await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true })
).newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

async function mount(id, extra) {
    await page.evaluate(
        ({ dps, hist, id, extra }) => {
            const live = Object.fromEntries(dps.map((d, i) => [d, 100 * (i + 1)]));
            window.__auraShot.mock(live);
            window.__auraShot.mockServerState(live);
            window.__auraShot.mockHistory(Object.fromEntries(dps.map((d, i) => [d, hist[i]])));
            window.__auraShot.showWidgets(
                [
                    {
                        id,
                        type: 'echart',
                        title: 'Steckdosen',
                        datapoint: '',
                        layout: 'default',
                        gridPos: { x: 0, y: 0, w: 30, h: 12 },
                        options: {
                            echartMode: 'timeseries',
                            echartRange: '1h',
                            echartNowLine: true,
                            echartRefLines: [{ id: 'r1', value: 150, label: 'Grenze' }],
                            ...extra,
                            echartSeries: dps.map((d, i) => ({
                                id: `s-${i}`,
                                name: `Plug ${i}`,
                                datapointId: d,
                                chartType: 'line',
                                historyInstance: 'history.0',
                                yAxisIndex: 0,
                            })),
                        },
                    },
                ],
                { editMode: false },
            );
        },
        { dps: DPS, hist: DPS.map((_, i) => raw(100 * (i + 1))), id, extra },
    );
    for (let i = 0; i < 50; i++) {
        await page.waitForTimeout(100);
        const s = await page.evaluate(() => window.__auraShot.chartSeries());
        if (s && s.filter((x) => x.points > 0).length >= DPS.length) break;
    }
    await page.waitForTimeout(300);
}

const points = async () =>
    (await page.evaluate(() => window.__auraShot.chartSeries()))
        .slice(0, DPS.length)
        .map((s) => ({ points: s.points, last: s.ys[s.ys.length - 1] }));
const push = (dp, val) =>
    page.evaluate(({ dp, val }) => window.__auraShot.mock({ [dp]: { val, ts: Date.now(), lc: Date.now() } }), {
        dp,
        val,
    });

console.log('live value merges into the drawn chart');
await mount('w-live-redraw', {});
await page.evaluate(() => window.__auraShot.chartSeriesKept());
const before = await points();
for (let i = 0; i < 4; i++) {
    await push(DPS[i % DPS.length], 500 + i);
    await page.waitForTimeout(150);
}
await page.waitForTimeout(300);
const kept = await page.evaluate(() => window.__auraShot.chartSeriesKept());
const after = await points();
check('the readings reached the chart', after[0].points > before[0].points, `${before[0].points} → ${after[0].points}`);
check(
    'every series model survives the live values (no redraw from the left)',
    kept && kept.total > 0 && kept.kept === kept.total,
    JSON.stringify(kept),
);

console.log('echartLiveInterval holds readings back');
await mount('w-live-interval', { echartLiveInterval: 2 });
// A first reading after the quiet mount goes through at once.
await push(DPS[0], 700);
await page.waitForTimeout(400);
const first = await points();
check('the first reading is applied at once', first[0].last === 700, `last ${first[0].last}`);
await push(DPS[0], 701);
await page.waitForTimeout(150);
await push(DPS[0], 702);
await page.waitForTimeout(150);
await push(DPS[1], 801);
await page.waitForTimeout(400);
const held = await points();
check(
    'readings within the interval are held back',
    held[0].last === 700 && held[0].points === first[0].points && held[1].last !== 801,
    JSON.stringify(held.slice(0, 2)),
);
await page.waitForTimeout(1800);
const flushed = await points();
check(
    'after the interval the latest reading per series arrives, in one go',
    flushed[0].last === 702 && flushed[0].points === first[0].points + 1 && flushed[1].last === 801,
    JSON.stringify(flushed.slice(0, 2)),
);

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
