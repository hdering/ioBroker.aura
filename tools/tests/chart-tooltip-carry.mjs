// Tooltip rows of series without a point at the hovered moment (issue #898).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/chart-tooltip-carry.mjs
//
// Every series fetches its own history, so their timestamps rarely meet. Echarts' axis tooltip
// lists only the series with a point at exactly the hovered x — hovering a pump switching on hid
// every temperature. The tooltip now fills those rows with the series' last known value.
//   1. The pure carry (`__auraShot.carriedValues`): last value at or before, null before the
//      start, after a gap, and for series that are not eligible.
//   2. The real widget: a temperature logged on the hour and a pump logged at :30 — hovering
//      across the plot, every tooltip naming the pump also names the temperature, and the other
//      way round once the pump has a value.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const HOUR = 3_600_000;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });

// ── 1. The carry itself ─────────────────────────────────────────────────────────────────────
{
    const carry = (data, ts, skip = []) =>
        page.evaluate(([d, t, s]) => window.__auraShot.carriedValues(d, t, (i) => !s.includes(i)), [data, ts, skip]);
    const a = [
        [10, 1],
        [20, 2],
        [30, null],
        [40, 4],
    ];
    const b = [[25, 7]];
    check('last value at or before', eq(await carry([a, b], 27), [2, 7]), JSON.stringify(await carry([a, b], 27)));
    check('an exact hit reads that point', eq(await carry([a], 20), [2]));
    check('nothing before the first point', eq(await carry([a, b], 15), [1, null]));
    check('a gap carries nothing', eq(await carry([a], 35), [null]));
    check('the newest value holds past the end', eq(await carry([a], 99), [4]));
    check('ineligible series stay empty', eq(await carry([a, b], 27, [1]), [2, null]));
    check('an empty series is null', eq(await carry([[]], 27), [null]));
}

// ── 2. The real widget ──────────────────────────────────────────────────────────────────────
{
    const TEMP = 'test.carry.temp';
    const PUMP = 'test.carry.pump';
    const end = Math.floor(Date.now() / HOUR) * HOUR;
    const temp = [];
    const pump = [];
    for (let ts = end - 20 * HOUR; ts <= end; ts += HOUR) temp.push([ts, 40 + ((ts / HOUR) % 3)]);
    for (let ts = end - 10 * HOUR + HOUR / 2; ts < end; ts += 2 * HOUR) pump.push([ts, pump.length % 2]);

    const widget = {
        id: 'w-carry',
        type: 'echart',
        title: 'Carry',
        datapoint: '',
        layout: 'default',
        gridPos: { x: 0, y: 0, w: 24, h: 10 },
        options: {
            echartMode: 'timeseries',
            echartShowCurrent: false,
            echartSeries: [
                {
                    id: 'c1',
                    name: 'Vorlauf',
                    datapointId: TEMP,
                    chartType: 'line',
                    historyInstance: 'influxdb.0',
                    historyRange: '24h',
                    aggregate: 'none',
                    yAxisIndex: 0,
                },
                {
                    id: 'c2',
                    name: 'Pumpe',
                    datapointId: PUMP,
                    chartType: 'area',
                    historyInstance: 'influxdb.0',
                    historyRange: '24h',
                    aggregate: 'none',
                    yAxisIndex: 1,
                },
            ],
        },
    };
    await page.evaluate(
        ({ widget, TEMP, PUMP, temp, pump }) => {
            const states = { [TEMP]: 41, [PUMP]: 0 };
            window.__auraShot.mock(states);
            window.__auraShot.mockServerState(states);
            window.__auraShot.enableHistory(true);
            window.__auraShot.mockHistory({ [TEMP]: temp, [PUMP]: pump });
            window.__auraShot.showWidgets([widget]);
        },
        { widget, TEMP, PUMP, temp, pump },
    );
    await page.waitForFunction(() => document.querySelectorAll('[_echarts_instance_]').length >= 1, null, {
        timeout: 20000,
    });
    await page.waitForTimeout(1200);

    const box = await page.locator('.react-grid-item [_echarts_instance_]').first().boundingBox();
    const tips = new Set();
    for (let i = 0; i <= 160; i++) {
        await page.mouse.move(box.x + box.width * (0.08 + (0.86 * i) / 160), box.y + box.height * 0.55);
        await page.waitForTimeout(25);
        const tip = await page.evaluate(
            () =>
                [...document.querySelectorAll('[_echarts_instance_] div')]
                    .filter((d) => getComputedStyle(d).display !== 'none' && getComputedStyle(d).opacity !== '0')
                    .map((d) => d.innerText ?? '')
                    .find((tx) => /Vorlauf|Pumpe/.test(tx)) ?? '',
        );
        if (tip) tips.add(tip.replace(/\s+/g, ' ').trim());
    }
    await page.mouse.move(5, 5);
    const all = [...tips];
    const pumpTips = all.filter((t) => t.includes('Pumpe'));
    const tempOnly = all.filter((t) => t.includes('Vorlauf') && !t.includes('Pumpe'));
    check(
        'the hover reached moments of both series',
        pumpTips.length > 0 && all.length > pumpTips.length,
        `${all.length} tooltips`,
    );
    check(
        'a pump moment still lists the temperature',
        pumpTips.length > 0 && pumpTips.every((t) => /Vorlauf: ?[\d,.]+/.test(t)),
        pumpTips.find((t) => !t.includes('Vorlauf')) ?? pumpTips[0],
    );
    // Each tooltip carries its time, so more distinct pump rows than pump points means the hourly
    // temperature moments list the pump too. Before its first record there is nothing to carry.
    check(
        'a temperature moment lists the pump once it has a value',
        pumpTips.length > pump.length && tempOnly.length > 0,
        `${pumpTips.length} with pump (${pump.length} pump points), ${tempOnly.length} without`,
    );
}

check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
