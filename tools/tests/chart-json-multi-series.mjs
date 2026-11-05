// Verifies series fanned out of one JSON datapoint (issue #926): a multi-series template turns into
// one line per payload entry, named, coloured and styled from the entry.
//
//   node tools/tests/chart-json-multi-series.mjs                  (parser only, no server)
//   AURA_BASE=http://127.0.0.1:5199 node tools/tests/chart-json-multi-series.mjs   (+ widget)
//
// Part 1 bundles the pure parser with esbuild: where the list of series may sit, `[x, y]` pairs
// next to objects, doubled names, entries that are not series. Part 2 (only with AURA_BASE) shows
// a chart widget whose single series is such a template and reads the lines back from echarts:
// count, names, points, colours that stay with their name when an entry is added, dashed lines.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const STUBS = {
    './useIoBroker': `export const getHistoryDirect = () => Promise.resolve([]);
        export const getStateFromCache = () => null;
        export const getObjectDirect = () => Promise.resolve(null);`,
    './useChartHistory': `export const TOTAL_FLOOR_MS = 0;
        export const detectHistoryAdapters = () => Promise.resolve([]);`,
};

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-json-multi-${process.pid}.mjs`);
await build({
    stdin: {
        contents: "export { parseJsonSeries, resolveJsonSeriesEntries } from './src-vis/hooks/useMultiSeriesData.ts';",
        resolveDir: process.cwd(),
        loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    external: ['react'],
    logLevel: 'warning',
    plugins: [
        {
            name: 'stub-io',
            setup(b) {
                b.onResolve({ filter: /^\.\/use(IoBroker|ChartHistory)$/ }, (a) => ({
                    path: a.path,
                    namespace: 'stub',
                }));
                b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ contents: STUBS[a.path], loader: 'js' }));
            },
        },
    ],
});
const { parseJsonSeries, resolveJsonSeriesEntries } = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};
const names = (entries) => entries.map((e) => e.name).join(',');

// The payload from the issue.
const T1 = 1759312800000;
const T2 = 1759399200000;
const PAYLOAD = {
    series: [
        {
            name: 'script-restore',
            data: [
                [T1, 98],
                [T2, 101],
            ],
        },
        {
            name: 'agent-dvr',
            data: [
                [T1, 14],
                [T2, 16],
            ],
            color: 'var(--accent-green)',
        },
        { name: 'Gesamt', data: [[T1, 190]], lineStyle: 'dashed' },
    ],
};

// -- 1. where the list may sit ---------------------------------------------------------------
check('path "series"', names(resolveJsonSeriesEntries(PAYLOAD, 'series')) === 'script-restore,agent-dvr,Gesamt');
check(
    'empty path finds the list in its wrapper',
    names(resolveJsonSeriesEntries(PAYLOAD, '')) === 'script-restore,agent-dvr,Gesamt',
);
check('JSON string payload', resolveJsonSeriesEntries(JSON.stringify(PAYLOAD), 'series').length === 3);
check('bare array at the root', resolveJsonSeriesEntries(PAYLOAD.series).length === 3);
check('array-wrapped payload', resolveJsonSeriesEntries([PAYLOAD]).length === 3);
check(
    'a single entry is a list of one, not a wrapper',
    names(resolveJsonSeriesEntries({ series: [PAYLOAD.series[0]] }, 'series')) === 'script-restore',
);

// -- 2. what each entry carries -----------------------------------------------------------------
{
    const [a, b, c] = resolveJsonSeriesEntries(PAYLOAD, 'series');
    check('colour taken over', b.color === 'var(--accent-green)' && a.color === undefined, `${a.color} / ${b.color}`);
    check('lineStyle taken over', c.lineStyle === 'dashed' && a.lineStyle === undefined);
    check('data kept raw', a.data.length === 2 && Array.isArray(a.data[0]));
}
{
    const [e] = resolveJsonSeriesEntries([{ name: 'x', data: [], lineStyle: 'wavy', type: 'pie', yAxisIndex: '1' }]);
    check('unknown lineStyle / type dropped', e.lineStyle === undefined && e.chartType === undefined);
    check('numeric-string yAxisIndex read', e.yAxisIndex === 1, String(e.yAxisIndex));
}
{
    const [e] = resolveJsonSeriesEntries([{ name: 'x', data: [], yAxisIndex: null, type: 'bar' }]);
    check('null yAxisIndex = unset, type kept', e.yAxisIndex === undefined && e.chartType === 'bar');
}
check(
    'doubled names made unique',
    names(resolveJsonSeriesEntries([{ name: 'a', data: [] }, { name: 'a', data: [] }, { data: [] }])) === 'a,a (2),#3',
);
check(
    'entries without data are skipped',
    names(resolveJsonSeriesEntries([{ name: 'a', data: [[1, 2]] }, { name: 'no' }, 5, null])) === 'a',
);

// -- 3. payloads that hold no series ---------------------------------------------------------------
check('plain point array → none', resolveJsonSeriesEntries([{ label: 'Mo', value: 1 }]).length === 0);
check('broken JSON → none', resolveJsonSeriesEntries('{nope').length === 0);
check('wrong path → none', resolveJsonSeriesEntries(PAYLOAD, 'nope').length === 0);
check('null → none', resolveJsonSeriesEntries(null).length === 0);

// -- 4. a fanned-out line reads its own entry's points ---------------------------------------------
const line = (entry, extra = {}) => ({
    id: `t~${entry}`,
    name: entry,
    datapointId: 'x.0.y',
    chartType: 'line',
    source: 'json',
    jsonPath: 'series',
    jsonSeriesEntry: entry,
    ...extra,
});
{
    const pts = parseJsonSeries(PAYLOAD, line('agent-dvr'));
    check(
        '[x, y] pairs → label/value',
        pts.length === 2 && pts[0].label === String(T1) && pts[1].value === 16,
        JSON.stringify(pts),
    );
    check('unknown entry → no points', parseJsonSeries(PAYLOAD, line('weg')).length === 0);
    const conv = parseJsonSeries(PAYLOAD, line('Gesamt', { valueFactor: 0.5 }));
    check('template conversion applies', conv[0]?.value === 95, JSON.stringify(conv));
    const objs = parseJsonSeries({ series: [{ name: 'o', data: [{ ts: T1, val: 3 }] }] }, line('o'));
    check('object points inside an entry', objs[0]?.label === String(T1) && objs[0]?.value === 3, JSON.stringify(objs));
}
// Pairs work for a plain JSON series too — the shape ECharts itself takes.
{
    const pts = parseJsonSeries([[T1, '7.5'], [T2, 8], [T2], 'x'], { id: 's', source: 'json' });
    check(
        'plain series takes pairs, skips short/foreign items',
        pts.length === 2 && pts[0].value === 7.5,
        JSON.stringify(pts),
    );
}

// -- 5. the widget (only with a dev server) ---------------------------------------------------------
const BASE = process.env.AURA_BASE;
if (!BASE) {
    console.log('  (AURA_BASE not set — widget part skipped)');
} else {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 90000 });

    const DP = 'demo.stats.history';
    const widget = (id, mode, extra = {}) => ({
        id,
        title: id,
        type: 'echart',
        layout: 'default',
        datapoint: '',
        gridPos: { x: 0, y: 0, w: 60, h: 14 },
        options: {
            icon: 'BarChart2',
            echartMode: mode,
            echartShowLegend: true,
            echartJsonTimeAxis: true,
            echartSeries: [
                {
                    id: 'dyn',
                    name: 'Adapter',
                    datapointId: DP,
                    chartType: 'line',
                    source: 'json',
                    jsonPath: 'series',
                    jsonMultiSeries: true,
                    yAxisIndex: 0,
                    ...extra,
                },
            ],
        },
    });
    const render = async (w, payload) => {
        await page.evaluate(
            ([ws, v]) => {
                window.__auraShot.mock(v);
                window.__auraShot.mockServerState?.(v);
                window.__auraShot.showWidgets(ws, { gridRowHeight: 20, gridSnapX: 20, gridGap: 10 });
            },
            [[w], { [DP]: JSON.stringify(payload) }],
        );
        await page
            .waitForFunction(() => (window.__auraShot.chartSeries()?.length ?? 0) > 0, null, { timeout: 30000 })
            .catch(() => undefined);
        await page.waitForTimeout(600);
        return page.evaluate(() => window.__auraShot.chartSeries());
    };

    for (const mode of ['json', 'timeseries']) {
        const ser = await render(widget(`w-${mode}`, mode), PAYLOAD);
        console.log(`  ${mode}: ${JSON.stringify(ser?.map((s) => [s.name, s.points, s.color, s.lineType]))}`);
        check(`${mode}: one line per entry`, ser?.length === 3, String(ser?.length));
        check(
            `${mode}: names from the payload`,
            ser?.map((s) => s.name).join(',') === 'script-restore,agent-dvr,Gesamt',
        );
        check(`${mode}: points per entry`, ser?.map((s) => s.points).join(',') === '2,2,1');
        check(
            `${mode}: colour token resolved for the canvas`,
            typeof ser?.[1]?.color === 'string' && !String(ser[1].color).includes('var('),
            String(ser?.[1]?.color),
        );
        check(`${mode}: dashed line`, ser?.[2]?.lineType === 'dashed' && !ser?.[0]?.lineType);
    }

    // A new adapter on top: every existing line keeps its colour.
    const before = await render(widget('w-c1', 'json'), PAYLOAD);
    const grown = { series: [{ name: 'neu', data: [[T1, 1]] }, ...PAYLOAD.series] };
    const after = await render(widget('w-c2', 'json'), grown);
    const colorOf = (list, n) => list?.find((s) => s.name === n)?.color;
    check('a new entry adds a line', after?.length === 4, String(after?.length));
    check(
        'existing lines keep their colour',
        ['script-restore', 'agent-dvr', 'Gesamt'].every((n) => colorOf(before, n) === colorOf(after, n)),
        ['script-restore', 'agent-dvr', 'Gesamt'].map((n) => `${colorOf(before, n)}→${colorOf(after, n)}`).join(' '),
    );
    check(
        'palette colours stay apart',
        new Set(after?.filter((s) => s.name !== 'agent-dvr').map((s) => s.color)).size === 3,
        JSON.stringify(after?.map((s) => s.color)),
    );

    // Editor: the switch is on, the series found are named, the colour is greyed with its reason.
    await page.evaluate(
        ([w, v]) => {
            window.__auraShot.mock(v);
            window.__auraShot.mockServerState?.(v);
            window.__auraShot.showWidgets([w], { editMode: true });
            window.__auraShot.setEditMode(true);
            // The edit dialog opens with every section folded; the button is inside one.
            window.__auraShot.unfoldSections();
        },
        [widget('w-edit', 'json'), { [DP]: JSON.stringify(PAYLOAD) }],
    );
    await page.waitForTimeout(1500);
    await page.locator('.aura-edit-chrome button').first().click();
    await page.locator('button:text-is("Bearbeiten")').click();
    await page.locator('button:has-text("Datenpunkte verwalten")').first().click();
    const dlg = page.locator('.aura-config-modal');
    await dlg.locator('button:text-is("Serie hinzufügen")').waitFor({ timeout: 10000 });
    await dlg.locator('button:has-text("Serien")').first().click();
    await page.waitForTimeout(400);
    await dlg.locator('span:text-is("Adapter")').first().click();
    await page.waitForTimeout(800);
    const toggle = dlg.locator('label:has-text("Mehrere Serien aus dem JSON") input');
    check('editor: switch shown and on', (await toggle.count()) === 1 && (await toggle.isChecked()));
    const found =
        (await dlg
            .locator('p:has-text("Serien erkannt")')
            .first()
            .innerText()
            .catch(() => '')) || '';
    check('editor: names the series found', found.includes('3 Serien erkannt') && found.includes('agent-dvr'), found);
    check(
        'editor: colour greyed with its reason',
        (await dlg.locator('.aura-cfg-unavailable-reason:has-text("Palettenfarbe")').count()) === 1,
    );

    check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
    await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
