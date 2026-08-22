// Verifies the x-axis labels of a bucketed ("Verbrauch/Ertrag") advanced chart (issue #570).
//
//   node tools/tests/chart-bucket-axis.mjs
//
// No dev server needed: the label helpers are pure, so `chartFormat.ts` is bundled with esbuild,
// and echarts itself renders the axis headlessly (SSR renderer, no DOM) so the ticks under test
// are the ones the widget really gets.
//
// The regression: a `delta` series draws one bar per calendar bucket, but the time axis labelled
// whatever ticks echarts picked for the window. A single yearly bar came out as "31 | 2026 | 2" —
// the year plus the day numbers of the padding around the lone bar — and two yearly bars got a
// row of month names between them.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';
import * as echarts from 'echarts';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-bucket-axis-${process.pid}.mjs`);
await build({
    stdin: {
        contents:
            "export { bucketAxisLabel, bucketAxisMinInterval, bucketTooltipLabel, coarsestBucket } from './src-vis/utils/chartFormat.ts';",
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
const { bucketAxisLabel, bucketAxisMinInterval, bucketTooltipLabel, coarsestBucket } = await import(
    pathToFileURL(bundle).href
);
rmSync(bundle, { force: true });

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};
const LOCALE = 'de-DE';

// ── The axis as the widget builds it ─────────────────────────────────────────────────────────
/** Labels echarts actually paints for one series of bucketed bars. */
function axisLabels(points, bucket, width = 620) {
    const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width, height: 300 });
    chart.setOption({
        grid: { left: 6, right: 6, top: 30, bottom: 14, containLabel: true },
        xAxis: {
            type: 'time',
            axisLabel: {
                fontSize: 10,
                hideOverlap: true,
                formatter: (v) => bucketAxisLabel(v, bucket, LOCALE),
            },
            minInterval: bucketAxisMinInterval(bucket),
        },
        // Only the x labels are of interest — a y axis would mix its own numbers into the svg.
        yAxis: { type: 'value', show: false },
        series: [{ type: 'bar', stack: 'a', data: points, barMaxWidth: 40 }],
    });
    const svg = chart.renderToSVGString();
    chart.dispose();
    return [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]).filter((s) => s !== '');
}
const bars = (starts) => starts.map((ts, i) => [ts, 100 + i]);
const eq = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

// -- 1. the reported case: a single yearly bar ------------------------------------------------
{
    const got = axisLabels(bars([new Date(2026, 0, 1).getTime()]), 'year');
    check('one yearly bar is labelled with its year alone', eq(got, ['2026']), got.join(' '));
}

// -- 2. the reported case: two yearly bars ---------------------------------------------------
{
    const got = axisLabels(bars([new Date(2025, 0, 1).getTime(), new Date(2026, 0, 1).getTime()]), 'year');
    check('two yearly bars get no month names between them', eq(got, ['2025', '2026']), got.join(' '));
}

// -- 3. a decade of yearly bars: every label is a plain year ---------------------------------
{
    const starts = Array.from({ length: 10 }, (_, i) => new Date(2017 + i, 0, 1).getTime());
    const got = axisLabels(bars(starts), 'year');
    check(
        'a decade of yearly bars only ever shows years',
        got.length > 0 && got.every((l) => /^\d{4}$/.test(l)),
        got.join(' '),
    );
}

// -- 4. monthly bars: month names, the January ones carrying the year ------------------------
{
    const starts = Array.from({ length: 14 }, (_, i) => new Date(2025, i, 1).getTime());
    const got = axisLabels(bars(starts), 'month');
    const okShape = got.length > 0 && got.every((l) => /^[A-Za-zÄÖÜäöü.]+( \d{4})?$/.test(l));
    check('monthly bars are labelled by month, never by day', okShape, got.join(' '));
    check(
        'a January among monthly bars carries its year',
        got.some((l) => /^\S+ \d{4}$/.test(l)),
        got.join(' '),
    );
}

// -- 5. daily bars: dates, no times ---------------------------------------------------------
{
    const starts = Array.from({ length: 30 }, (_, i) => new Date(2026, 3, 1 + i).getTime());
    const got = axisLabels(bars(starts), 'day');
    check(
        'daily bars are labelled by date, never by time of day',
        got.length > 0 && got.every((l) => !l.includes(':')),
        got.join(' '),
    );
}

// -- 6. hourly bars keep the clock, and the day boundary keeps its date ----------------------
{
    const starts = Array.from({ length: 26 }, (_, i) => new Date(2026, 3, 1, 0).getTime() + i * 3_600_000);
    const got = axisLabels(bars(starts), 'hour');
    check('hourly bars keep clock labels', got.length > 0 && got.some((l) => l.includes(':')), got.join(' '));
    check(
        'no label of an hourly window falls off the hour grid',
        got.every((l) => !/:\d\d(?<!:00)$/.test(l) || l.endsWith(':00')),
        got.join(' '),
    );
}

// -- 7. the label helper itself: off-grid ticks carry nothing --------------------------------
{
    const dec31 = new Date(2025, 11, 31).getTime();
    const jan2 = new Date(2026, 0, 2).getTime();
    const mar1 = new Date(2026, 2, 1).getTime();
    const noon = new Date(2026, 0, 1, 12).getTime();
    check(
        'the padding days around a yearly bar stay unlabelled',
        bucketAxisLabel(dec31, 'year', LOCALE) === '' && bucketAxisLabel(jan2, 'year', LOCALE) === '',
    );
    check('a mid-year month start is no yearly label', bucketAxisLabel(mar1, 'year', LOCALE) === '');
    check('midday is no daily label', bucketAxisLabel(noon, 'day', LOCALE) === '');
    check('a day start is a daily label', bucketAxisLabel(dec31, 'day', LOCALE) !== '');
    check('a week bar is labelled like a day', bucketAxisLabel(dec31, 'week', LOCALE) !== '');
    check(
        'midnight inside an hourly window shows the date, not 00:00',
        !bucketAxisLabel(new Date(2026, 3, 2).getTime(), 'hour', LOCALE).includes(':'),
    );
}

// -- 8. the coarsest bucket wins the shared axis ---------------------------------------------
{
    check('coarsest of day/month/hour is month', coarsestBucket(['day', 'month', 'hour']) === 'month');
    check('an unknown bucket is ignored', coarsestBucket([undefined, 'hour']) === 'hour');
    check('no delta series means no bucket axis', coarsestBucket([undefined, undefined]) === undefined);
}

// -- 9. the tooltip headline names the bucket, not the second it starts at -------------------
{
    const ts = new Date(2026, 0, 1).getTime();
    check('a yearly bar is hovered as its year', bucketTooltipLabel(ts, 'year', LOCALE) === '2026');
    check('a monthly bar names month and year', /2026/.test(bucketTooltipLabel(ts, 'month', LOCALE)));
    check('a daily bar drops the clock', !bucketTooltipLabel(ts, 'day', LOCALE).includes(':'));
    check('an hourly bar keeps the clock', bucketTooltipLabel(ts, 'hour', LOCALE).includes(':'));
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) process.exit(1);
