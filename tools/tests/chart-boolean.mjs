// Verifies boolean series and axis value texts in the advanced chart (issue #718).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/chart-boolean.mjs
//
// Use case from the issue: temperatures on the left axis, the heating's on/off state on the
// right. Checked: true/false rows plot as 1/0, a boolean series draws as a step line by default
// (and can be switched back), a boolean-only axis spans 0…1 in one step, its bucket aggregation
// is `max` instead of a duty-cycle average, and `echartRightValueLabels` puts the texts on the
// axis and into the current-value block.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

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

// Heating toggles every 50 minutes; the temperature follows it loosely.
const now = Date.now();
const heat = Array.from({ length: 30 }, (_, i) => [now - (29 - i) * 50 * 60 * 1000, i % 2 === 0]);
const temp = Array.from({ length: 96 }, (_, i) => [now - (95 - i) * 15 * 60 * 1000, 40 + 8 * Math.sin(i / 5)]);

let n = 0;
/** Renders one chart (own widget id each time — see the harness notes) and waits for its series. */
async function render(options, seriesPatch = {}, tempPatch = {}) {
    n++;
    const ids = { heat: `demo.heat${n}`, temp: `demo.flow${n}` };
    await page.evaluate(
        ([ids, heat, temp, n, options, seriesPatch, tempPatch]) => {
            const a = window.__auraShot;
            a.enableHistory(true);
            a.mockHistory({ [ids.heat]: heat, [ids.temp]: temp });
            a.mockObject({
                [ids.heat]: { type: 'state', common: { type: 'boolean', custom: { 'history.0': { enabled: true } } } },
                [ids.temp]: { type: 'state', common: { type: 'number', custom: { 'history.0': { enabled: true } } } },
            });
            const vals = { [ids.heat]: true, [ids.temp]: 44.2 };
            a.mock(vals);
            a.mockServerState(vals);
            a.showWidgets([
                {
                    id: `w-echart-bool-${n}`,
                    type: 'echart',
                    title: 'Heizung',
                    datapoint: '',
                    layout: 'default',
                    gridPos: { x: 0, y: 0, w: 30, h: 14 },
                    options: {
                        echartMode: 'timeseries',
                        echartRange: '24h',
                        echartLeftUnit: '°C',
                        echartJsonExtra: '{"animation":false}',
                        echartSeries: [
                            {
                                id: 's1',
                                name: 'Vorlauf',
                                datapointId: ids.temp,
                                chartType: 'line',
                                historyInstance: 'history.0',
                                yAxisIndex: 0,
                                ...tempPatch,
                            },
                            {
                                id: 's2',
                                name: 'Heizung',
                                datapointId: ids.heat,
                                chartType: 'line',
                                historyInstance: 'history.0',
                                yAxisIndex: 1,
                                ...seriesPatch,
                            },
                        ],
                        ...options,
                    },
                },
            ]);
        },
        [ids, heat, temp, n, options, seriesPatch, tempPatch],
    );
    await page.waitForFunction(
        () => {
            const s = window.__auraShot.chartSeries();
            return !!s && s.length === 2 && s[1].points > 1;
        },
        null,
        { timeout: 15000 },
    );
    await page.waitForTimeout(300);
    return page.evaluate(() => ({
        series: window.__auraShot.chartSeries(),
        axes: window.__auraShot.chartAxes(),
        texts: window.__auraShot.chartTexts(),
        header: document.querySelector('.react-grid-item')?.innerText ?? '',
    }));
}

// ── 1. Raw rows (aggregate none): true/false plot as 1/0, drawn as steps ─────
{
    const r = await render({}, { aggregate: 'none' });
    const heatS = r.series[1];
    const ys = heatS.ys.filter((v) => v !== null);
    check(
        'boolean rows plot as 0/1',
        ys.length > 10 && ys.every((v) => v === 0 || v === 1),
        JSON.stringify(ys.slice(0, 6)),
    );
    check('boolean series draws as a step line', heatS.step === 'end', String(heatS.step));
    check('step line is not smoothed', heatS.smooth === false || heatS.smooth === 0, String(heatS.smooth));
    check(
        'numeric series stays a smooth curve',
        !r.series[0].step && !!r.series[0].smooth,
        JSON.stringify([r.series[0].step, r.series[0].smooth]),
    );
    const right = r.axes.yAxis[1];
    check(
        'boolean axis spans 0…1',
        right.min === 0 && right.max === 1,
        JSON.stringify({ min: right.min, max: right.max }),
    );
    check('boolean axis ticks every 1', right.interval === 1, String(right.interval));
    const left = r.axes.yAxis[0];
    check(
        'numeric axis keeps free scale',
        left.interval === undefined && left.max === undefined,
        JSON.stringify(left.interval),
    );
}

// ── 2. Bucketed fetch: max instead of a duty-cycle average ──────────────────
{
    const r = await render({});
    const ys = r.series[1].ys.filter((v) => v !== null);
    check(
        'bucketed boolean stays on 0/1 (max aggregation)',
        ys.length > 5 && ys.every((v) => v === 0 || v === 1),
        JSON.stringify(ys.slice(0, 8)),
    );
}

// ── 3. Value texts on the axis and in the current-value block ───────────────
{
    const r = await render({ echartRightValueLabels: '0=An; 1=Aus' });
    check(
        'axis shows the mapped texts',
        r.texts.includes('An') && r.texts.includes('Aus'),
        JSON.stringify(r.texts.filter((t) => /An|Aus/.test(t))),
    );
    check(
        'axis shows no 0.2 steps',
        !r.texts.some((t) => /^0[.,][2468]/.test(t)),
        JSON.stringify(r.texts.slice(0, 20)),
    );
    check(
        'current block shows the text for the live value',
        /\bAus\b/.test(r.header),
        r.header.replace(/\s+/g, ' ').slice(0, 80),
    );
}

// ── 4. Step can be switched off, and switched on for a numeric series ───────
{
    const off = await render({}, { step: false });
    check('step: false draws a normal line', !off.series[1].step, String(off.series[1].step));
    const numStep = await render({}, {}, { step: true });
    check(
        'step: true turns a numeric line into steps',
        numStep.series[0].step === 'end',
        String(numStep.series[0].step),
    );
}

await browser.close();
const failed = results.filter((r) => !r.ok);
if (pageErrors.length) console.log('page errors:', pageErrors);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length || pageErrors.length ? 1 : 0);
