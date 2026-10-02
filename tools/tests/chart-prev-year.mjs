// Verifies the previous-year comparison series of the advanced chart in the real widget (issue #730).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/chart-prev-year.mjs
//
// A heating meter rising by a known amount per day, charted as monthly consumption over the last
// year — once as it is and once with `timeShift: 1` year. The comparison bars have to sit on the
// very same month buckets as the current ones (so echarts draws them side by side), carry last
// year's consumption, cover the open month of last year in full, and never move with the live value.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const DP = 'demo.0.heating.meter';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};
const ym = (ts) => new Date(ts).toLocaleDateString('de-DE', { month: 'short', year: 'numeric' });

// Mid-October 2026, noon.
const NOW = new Date(2026, 9, 15, 12).getTime();
// A reading every 6 h from Jan 2024: 10 per day in 2025, 20 per day in 2026 — so a bar tells by its
// height which year it was read from.
const raw = [];
let val = 0;
for (let d = new Date(2024, 0, 1); d.getTime() <= NOW; d.setHours(d.getHours() + 6)) {
    // The rise is booked onto the reading that realises it — so it takes that reading's year.
    val += d.getFullYear() >= 2026 ? 5 : 2.5;
    raw.push([d.getTime(), Math.round(val * 100) / 100]);
}
const LIVE = val;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
await ctx.clock.setFixedTime(new Date(NOW));
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

await page.evaluate(
    ({ dp, raw, live }) => {
        window.__auraShot.mock({ [dp]: live });
        window.__auraShot.mockServerState({ [dp]: live });
        window.__auraShot.mockHistory({ [dp]: raw });
        const base = {
            datapointId: dp,
            chartType: 'bar',
            historyInstance: 'history.0',
            historyRange: '1y',
            aggregate: 'delta',
            deltaBucket: 'month',
            yAxisIndex: 0,
        };
        window.__auraShot.showWidgets(
            [
                {
                    id: 'w-prev-year',
                    type: 'echart',
                    title: 'Heizung',
                    datapoint: '',
                    layout: 'default',
                    gridPos: { x: 0, y: 0, w: 30, h: 12 },
                    options: {
                        echartMode: 'timeseries',
                        echartRange: '1y',
                        echartAnimation: false,
                        echartSeries: [
                            { ...base, id: 's1', name: '2026', color: '#3b82f6' },
                            {
                                ...base,
                                id: 's2',
                                name: 'Vorjahr',
                                color: '#94a3b8',
                                timeShift: 1,
                                timeShiftUnit: 'year',
                            },
                        ],
                    },
                },
            ],
            { editMode: false },
        );
    },
    { dp: DP, raw, live: LIVE },
);

async function settle() {
    let prev = '';
    let last = null;
    for (let i = 0; i < 40; i++) {
        await page.waitForTimeout(100);
        const read = await page.evaluate(() => window.__auraShot.chartSeries());
        const snap = JSON.stringify(read);
        if (read && read.length === 2 && read.every((s) => s.points > 0) && snap === prev) return read;
        prev = snap;
        last = read;
    }
    return last;
}

const series = await settle();
check('both series render', series?.length === 2, JSON.stringify(series?.map((s) => s.points)));
const [cur, prev] = series ?? [
    { xs: [], ys: [] },
    { xs: [], ys: [] },
];
const cx = cur.xs.map(Number);
const px = prev.xs.map(Number);

check(
    'comparison bars sit on the same month buckets as the current ones',
    px.length > 0 && px.every((x) => cx.includes(x)),
    `prev: ${px.map(ym).join(', ')}`,
);
check(
    'every bucket is a local month start',
    px.every((x) => {
        const d = new Date(x);
        return d.getDate() === 1 && d.getHours() === 0;
    }),
);

// Current window: Oct 2025 … Oct 2026 (13 months, opened on the month edge). The comparison reads
// Oct 2024 … Oct 2025 and lands on the same months.
const jan = new Date(2026, 0, 1).getTime();
const janCur = Number(cur.ys[cx.indexOf(jan)]);
const janPrev = Number(prev.ys[px.indexOf(jan)]);
check('current January carries 2026 consumption (31 × 20)', Math.abs(janCur - 620) < 1, String(janCur));
check('comparison January carries 2025 consumption (31 × 10)', Math.abs(janPrev - 310) < 1, String(janPrev));

const oct = new Date(2026, 9, 1).getTime();
const octPrev = Number(prev.ys[px.indexOf(oct)]);
check('last year’s October is read in full, not only up to today’s date', Math.abs(octPrev - 310) < 1, String(octPrev));

const ys0 = JSON.stringify(prev.ys);
await page.evaluate(({ dp, v }) => window.__auraShot.mock({ [dp]: v }), { dp: DP, v: LIVE + 500 });
await page.waitForTimeout(400);
const after = await page.evaluate(() => window.__auraShot.chartSeries());
check('a live reading leaves the comparison bars alone', JSON.stringify(after?.[1]?.ys) === ys0);

// ── Editor: "Vorjahres-Serie anlegen" and the shift field ──────────────────────
{
    const ed = await ctx.newPage();
    ed.on('pageerror', (e) => pageErrors.push(e.message));
    await ed.goto(`${BASE}/?shot=1#/`, { waitUntil: 'domcontentloaded' });
    await ed.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
    await ed.evaluate((dp) => {
        window.__auraShot.mock({ [dp]: 1 });
        window.__auraShot.mockServerState({ [dp]: 1 });
        window.__auraShot.enableHistory(true);
        window.__auraShot.showWidgets(
            [
                {
                    id: 'w-prev-year-ed',
                    type: 'echart',
                    title: 'Heizung',
                    datapoint: '',
                    layout: 'default',
                    gridPos: { x: 0, y: 0, w: 20, h: 10 },
                    options: {
                        echartMode: 'timeseries',
                        echartSeries: [
                            {
                                id: 's1',
                                name: 'Heizung',
                                datapointId: dp,
                                chartType: 'bar',
                                historyInstance: 'history.0',
                                aggregate: 'delta',
                                deltaBucket: 'month',
                                stack: true,
                                yAxisIndex: 0,
                            },
                        ],
                    },
                },
            ],
            { editMode: true },
        );
        window.__auraShot.setEditMode(true);
    }, DP);
    const edOpts = () => ed.evaluate(() => window.__auraShot.widgetOptions('w-prev-year-ed'));
    await ed.locator('.aura-edit-chrome button').first().click();
    await ed.locator('button:text-is("Bearbeiten")').click();
    await ed.locator('button:has-text("Datenpunkte verwalten")').first().click();
    const dlg = ed.locator('.aura-config-modal');
    await dlg.locator('button:text-is("Serie hinzufügen")').waitFor({ timeout: 10000 });
    await dlg.locator('.aura-config-modal-tabs button:has-text("Serien")').first().click();
    const add = dlg.locator('[data-testid=echart-add-comparison]');
    await add.waitFor({ timeout: 10000 });
    await add.click();
    await ed.waitForTimeout(400);
    const list = (await edOpts()).echartSeries;
    check('the button adds a second series', list.length === 2, JSON.stringify(list.map((x) => x.name)));
    const c = list[1] ?? {};
    check(
        'shifted one year back, same datapoint and aggregation',
        c.timeShift === 1 &&
            c.timeShiftUnit === 'year' &&
            c.datapointId === DP &&
            c.aggregate === 'delta' &&
            c.deltaBucket === 'month',
        JSON.stringify(c),
    );
    check('never stacked onto the current year', !c.stack, String(c.stack));
    check('named after the source', c.name === 'Heizung (Vorjahr)', c.name);

    // Pick the copy and turn it into "previous week" through the field.
    await dlg.locator('span:text-is("Heizung (Vorjahr)")').first().click();
    await ed.waitForTimeout(300);
    const unit = dlg.locator('[data-testid=echart-time-shift-unit]');
    check('the copy shows its shift', (await dlg.locator('[data-testid=echart-time-shift]').inputValue()) === '1');
    check('and offers no second copy of itself', (await add.count()) === 0);
    await unit.selectOption('week');
    await ed.waitForTimeout(300);
    check('the unit writes through', (await edOpts()).echartSeries[1].timeShiftUnit === 'week');
    await dlg.locator('[data-testid=echart-time-shift]').fill('0');
    await ed.waitForTimeout(300);
    {
        const x = (await edOpts()).echartSeries[1];
        check('0 clears the shift', x.timeShift === undefined && x.timeShiftUnit === undefined, JSON.stringify(x));
    }
    await ed.close();
}

check('no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) process.exit(1);
