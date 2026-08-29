// Verifies that a rolling bucketed chart ends its x axis at the newest reading (issue #598).
//
//   node tools/tests/chart-axis-right-edge.mjs
//
// No dev server needed: `bucketAxisMax` is pure, so `chartFormat.ts` is bundled with esbuild, and
// echarts itself lays the axis out headlessly (SSR renderer, no DOM) — the extent under test is
// the one the widget really gets.
//
// The follow-up to #598: with the window now opening on the bars' calendar edge, the left side
// lines up, but the right ran on. Echarts reserves half a bar band at BOTH ends of a time axis as
// soon as a bar series is on it. On the left the leading delta bar sits in that reserve; on the
// right nothing does, because the newest bar is stamped at the start of the bucket that is still
// running. A "7 days" chart at 17:30 therefore carried on half a day past its last temperature
// reading, and the curve stopped well short of the right edge.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';
import * as echarts from 'echarts';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-axis-right-edge-${process.pid}.mjs`);
await build({
    stdin: {
        contents:
            "export { bucketAxisMax, bucketAxisMinInterval, bucketBandMs } from './src-vis/utils/chartFormat.ts';",
        resolveDir: process.cwd(),
        loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'warning',
    // `formatValue` pulls the settings store in for its number defaults, and the store's module
    // graph runs browser-only setup on load. None of it is reachable from the pure exports.
    plugins: [
        {
            name: 'stub-store',
            setup(b) {
                b.onResolve({ filter: /globalSettingsStore$/ }, (a) => ({ path: a.path, namespace: 'stub' }));
                b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
                    contents: 'export const useGlobalSettingsStore = () => ({});',
                    loader: 'js',
                }));
            },
        },
    ],
});
const { bucketAxisMax, bucketAxisMinInterval, bucketBandMs } = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};
const iso = (ts) => new Date(ts).toLocaleString('de-DE');

const HOUR = 3_600_000;
const DAY = 86_400_000;

// ── The chart as the widget builds it ────────────────────────────────────────────────────────
/**
 * Lays out the widget's x axis for one set of delta bars plus a plain line, and reports where the
 * axis really ends. `max` is what the widget writes into `xAxis.max` (null = echarts decides).
 */
function layout(bars, line, bucket, max) {
    const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: 1011, height: 325 });
    chart.setOption({
        grid: { left: 6, right: 6, top: 30, bottom: 14, containLabel: true },
        xAxis: { type: 'time', minInterval: bucketAxisMinInterval(bucket), min: null, max },
        yAxis: [{ type: 'value' }, { type: 'value' }],
        series: [
            { type: 'bar', stack: 'a', data: bars, barMaxWidth: 40 },
            { type: 'line', data: line, yAxisIndex: 1, areaStyle: {}, showSymbol: true, symbolSize: 6 },
        ],
    });
    chart.renderToSVGString();
    const g = chart.getModel().getComponent('grid').coordinateSystem.getRect();
    const px = (t) => chart.convertToPixel({ xAxisIndex: 0 }, t);
    const val = (p) => chart.convertFromPixel({ xAxisIndex: 0 }, p);
    const out = {
        axisMin: val(g.x),
        axisMax: val(g.x + g.width),
        // Empty plot area to the right of the newest reading, and to the left of the first bar.
        rightGapPx: g.x + g.width - px(line[line.length - 1][0]),
        leftGapPx: px(bars[0][0]) - g.x,
        pxPerBucket: bars.length > 1 ? (px(bars[bars.length - 1][0]) - px(bars[0][0])) / (bars.length - 1) : 0,
    };
    chart.dispose();
    return out;
}

/** Hourly readings from the first bar up to `now` — the last one lands exactly on `now`. */
const readings = (from, now, step = HOUR) => {
    const out = [];
    for (let t = from; t < now; t += step) out.push([t, 40]);
    out.push([now, 40]);
    return out;
};

// -- 1. the reported chart: 7 days of daily bars plus a temperature curve ---------------------
{
    console.log('\n7 days of daily bars, temperature to 17:30 (the reported chart)');
    const bars = Array.from({ length: 8 }, (_, i) => [new Date(2026, 7, 22 + i).getTime(), 0.5 + i / 100]);
    const now = new Date(2026, 7, 29, 17, 30).getTime();
    const line = readings(bars[0][0], now);
    const lastBucket = bars[bars.length - 1][0];

    const before = layout(bars, line, 'day', null);
    check(
        'without a pinned max the axis runs half a day past the newest reading',
        before.axisMax - now > 0.4 * DAY,
        `${iso(before.axisMax)}, ${((before.axisMax - now) / HOUR).toFixed(1)} h past ${iso(now)}`,
    );

    const max = bucketAxisMax(bars[0][0], now, lastBucket, 'day');
    const after = layout(bars, line, 'day', max);
    check(
        'the pinned max lands the axis on the newest reading',
        after.axisMax - now > 0 && after.axisMax - now < 4 * HOUR,
        `${iso(after.axisMax)}, ${((after.axisMax - now) / 60000).toFixed(0)} min past ${iso(now)}`,
    );
    check(
        'the curve now reaches the right edge',
        after.rightGapPx > 0 && after.rightGapPx < 25,
        `${after.rightGapPx.toFixed(1)} px (was ${before.rightGapPx.toFixed(1)} px)`,
    );
    check(
        'the leading bar keeps its half-band reserve on the left',
        Math.abs(after.leftGapPx - after.pxPerBucket / 2) < 2,
        `${after.leftGapPx.toFixed(1)} px of ${after.pxPerBucket.toFixed(1)} px per day`,
    );
    check(
        'the newest bar is still inside the axis',
        after.axisMax > lastBucket,
        `${iso(after.axisMax)} > ${iso(lastBucket)}`,
    );
}

// -- 2. right after a bucket edge: the newest bar must not be sliced -------------------------
{
    console.log('\nA fresh bucket: the newest reading is minutes past midnight');
    const bars = Array.from({ length: 8 }, (_, i) => [new Date(2026, 7, 22 + i).getTime(), 0.5]);
    const now = new Date(2026, 7, 29, 0, 3).getTime();
    const line = readings(bars[0][0], now);
    const lastBucket = bars[bars.length - 1][0];

    const max = bucketAxisMax(bars[0][0], now, lastBucket, 'day');
    check(
        'the newest bar keeps its own half band rather than being trimmed to the reading',
        max === lastBucket,
        `${iso(max)} === ${iso(lastBucket)}`,
    );
    const after = layout(bars, line, 'day', max);
    check(
        'so the axis still ends half a day past that bar',
        Math.abs(after.axisMax - (lastBucket + DAY / 2)) < HOUR,
        iso(after.axisMax),
    );
}

// -- 3. hourly buckets: a "24 h" chart -------------------------------------------------------
{
    console.log('\n24 hours of hourly bars');
    const bars = Array.from({ length: 24 }, (_, i) => [new Date(2026, 7, 29, i).getTime(), 1]);
    const now = new Date(2026, 7, 29, 23, 37).getTime();
    const line = readings(bars[0][0], now);

    const before = layout(bars, line, 'hour', null);
    check(
        'without a pinned max the axis runs half an hour past the newest reading',
        before.axisMax - now > 0.4 * HOUR,
        `${iso(before.axisMax)}, ${((before.axisMax - now) / 60_000).toFixed(0)} min past ${iso(now)}`,
    );

    const max = bucketAxisMax(bars[0][0], now, bars[bars.length - 1][0], 'hour');
    const after = layout(bars, line, 'hour', max);
    check(
        'the pinned axis ends just past the newest reading',
        after.axisMax > now && after.axisMax - now < HOUR,
        `${iso(after.axisMax)} (was ${iso(before.axisMax)})`,
    );
    check(
        'the strip on the right is only a few pixels wide',
        after.rightGapPx > 0 && after.rightGapPx < 25,
        `${after.rightGapPx.toFixed(1)} px`,
    );
}

// -- 4. monthly buckets: a "1 year" chart ----------------------------------------------------
{
    console.log('\nA year of monthly bars');
    const bars = Array.from({ length: 12 }, (_, i) => [new Date(2026, i, 1).getTime(), 1]);
    const now = new Date(2026, 11, 17, 9, 0).getTime();
    const line = [];
    for (let t = bars[0][0]; t <= now; t += 6 * HOUR) line.push([t, 40]);

    const before = layout(bars, line, 'month', null);
    const max = bucketAxisMax(bars[0][0], now, bars[bars.length - 1][0], 'month');
    const after = layout(bars, line, 'month', max);
    check(
        'a month bucket is compensated with its own band, not with a day',
        after.axisMax - now > 0 && after.axisMax - now < 8 * DAY,
        `${iso(after.axisMax)} (was ${iso(before.axisMax)})`,
    );
    check(
        'the curve reaches the right edge here too',
        after.rightGapPx > 0 && after.rightGapPx < 25,
        `${after.rightGapPx.toFixed(1)} px (was ${before.rightGapPx.toFixed(1)} px)`,
    );
}

// -- 5. the band table ------------------------------------------------------------------------
{
    console.log('\nBucket bands');
    check('an hour band is an hour', bucketBandMs('hour') === HOUR);
    check('a day band is a day', bucketBandMs('day') === DAY);
    check('a week band is seven days, unlike its day-aligned ticks', bucketBandMs('week') === 7 * DAY);
    check('a month band is the shortest month', bucketBandMs('month') === 28 * DAY);
    check('a year band is the shortest year', bucketBandMs('year') === 365 * DAY);
}

// -- 6. the pad is a share of the span, so it is the same few pixels at every range -----------
{
    console.log('\nThe marker pad');
    const dayEnd = new Date(2026, 7, 29, 17, 30).getTime();
    const dayMax = bucketAxisMax(dayEnd - 7 * DAY, dayEnd, dayEnd - 17.5 * HOUR, 'day');
    const hourEnd = new Date(2026, 7, 29, 23, 37).getTime();
    const hourMax = bucketAxisMax(hourEnd - DAY, hourEnd, hourEnd - 37 * 60_000, 'hour');
    check(
        'a 7-day window pads by a share of seven days',
        Math.abs(dayMax + DAY / 2 - dayEnd - (7 * DAY) / 60) < 60_000,
        `${((dayMax + DAY / 2 - dayEnd) / 60_000).toFixed(0)} min`,
    );
    check(
        'a 24-hour window pads by a share of one day',
        Math.abs(hourMax + HOUR / 2 - hourEnd - DAY / 60) < 60_000,
        `${((hourMax + HOUR / 2 - hourEnd) / 60_000).toFixed(0)} min`,
    );
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length > 0) {
    console.log('FAILED:');
    for (const f of failed) console.log(`  - ${f.name}${f.detail ? ` (${f.detail})` : ''}`);
    process.exit(1);
}
process.exit(0);
