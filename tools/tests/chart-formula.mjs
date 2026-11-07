// Computed series of the "Diagramm (erweitert)" in the real widget (issue #930).
//
//   AURA_BASE=http://localhost:5199 node tools/tests/chart-formula.mjs
//
// Needs a dev server (offline is fine: AURA_IOBROKER_URL=http://127.0.0.1:9). The inputs are
// logged on change only, the way most history adapters store them; the mock hands back the
// reading before the window like a real adapter. Checked:
//   1. U × I with U logged only before the window: no gap, the right value at every change;
//   2. a sum of three datapoints next to a plain series in the same chart;
//   3. period value `integral`: W over the window → Wh, unit with an "h";
//   4. delta bars of three counters: each differenced on its own, then summed;
//   5. a time-shifted formula series shows yesterday's values on today's axis;
//   6. the editor: source "Formel", inputs, live preview, a named error for an unknown variable.
// The pure maths (sample and hold, bucketing, integral) is covered by chart-formula-logic.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const M = 60_000;
const H = 3_600_000;
const DAY = 24 * H;

const FIXED = (() => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    return d.getTime();
})();
const now = FIXED;

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};
const num = (s) => {
    if (s == null) return NaN;
    const t = String(s).replace(/[^\d.,-]/g, '');
    return Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
};

// Voltage: one reading two days ago, nothing since. Current: changes now and then.
// Yesterday's current (for the shifted series): 3 A until 30 h ago, then 2 A.
const history = {
    'test.f.u': [[now - 2 * DAY, 50]],
    'test.f.i': [
        [now - 60 * H, 3],
        [now - 30 * H, 2],
        [now - 10 * H, 4],
        [now - 4 * H, 0],
        [now - 1 * H, 2],
    ],
    'test.f.a': [
        [now - 3 * DAY, 1],
        [now - 5 * H, 2],
    ],
    'test.f.b': [[now - 3 * DAY, 10]],
    'test.f.c': [
        [now - 3 * DAY, 100],
        [now - 2 * H, 200],
    ],
    'test.f.p': [[now - 3 * DAY, 100]],
    'test.f.plain': [[now - 3 * DAY, 7]],
};
// Three meters: +1, +2, +3 per hour.
for (const [id, rate] of [
    ['test.f.m1', 1],
    ['test.f.m2', 2],
    ['test.f.m3', 3],
]) {
    const pts = [];
    for (let ts = now - 9 * DAY; ts <= now; ts += H) pts.push([ts, 1000 + ((ts - (now - 9 * DAY)) / H) * rate]);
    history[id] = pts;
}
const values = {};
for (const [id, pts] of Object.entries(history)) values[id] = pts[pts.length - 1][1];

const formulaSeries = (id, name, inputs, formula, extra = {}) => ({
    id,
    name,
    datapointId: '',
    source: 'formula',
    formulaInputs: Object.entries(inputs).map(([n, dp]) => ({ name: n, datapointId: dp })),
    formula,
    chartType: 'line',
    historyInstance: 'history.0',
    yAxisIndex: 0,
    ...extra,
});
let shotNo = 0;
const echart = (series, options = {}) => ({
    id: `w-formula-${++shotNo}`,
    type: 'echart',
    title: 'Formel',
    datapoint: '',
    layout: 'default',
    gridPos: { x: 0, y: 0, w: 24, h: 12 },
    options: {
        echartMode: 'timeseries',
        echartRange: '24h',
        echartVisibleRanges: ['24h', '7d', '30d'],
        echartJsonExtra: '{"animation":false}',
        echartShowLegend: true,
        echartLeftUnit: 'W',
        decimals: 0,
        echartSeries: series,
        ...options,
    },
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
await ctx.clock.setFixedTime(FIXED);
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 120000 });
await page.evaluate(
    ({ h, v }) => {
        window.__auraShot.mockHistory(h, { borderValues: true });
        window.__auraShot.mock(v);
        window.__auraShot.mockServerState(v);
    },
    { h: history, v: values },
);

const show = async (cfg, wait = 1800) => {
    await page.evaluate((w) => window.__auraShot.showWidgets([w]), cfg);
    await page.waitForTimeout(wait);
};
const seriesOf = () => page.evaluate(() => window.__auraShot.chartSeries());
const legendValues = async () => {
    const texts = (await page.evaluate(() => window.__auraShot.chartTexts())) ?? [];
    const out = {};
    for (const t of texts) {
        const m = /^(.+?): (.+ Wh)$/.exec(t);
        if (m) out[m[1]] = num(m[2]);
    }
    return out;
};

// -- 1. U × I, voltage known only from before the window ---------------------------------------
await show(echart([formulaSeries('p', 'Leistung', { u: 'test.f.u', i: 'test.f.i' }, 'u * i', { aggregate: 'none' })]));
{
    const [s] = (await seriesOf()) ?? [];
    const ys = s?.ys ?? [];
    check('the formula series draws', (s?.points ?? 0) >= 4, `${s?.points} points`);
    check(
        'it opens on the window start, seeded from before it',
        s?.first === now - DAY && ys[0] === 100,
        `${s?.first} ${ys[0]}`,
    );
    const at = (ts) => ys[(s?.xs ?? []).indexOf(ts)];
    check(
        'every change of the current is a point, voltage held',
        at(now - 10 * H) === 200 && at(now - 4 * H) === 0 && at(now - H) === 100,
        JSON.stringify(ys),
    );
}

// -- 2. a sum of three next to a plain series ----------------------------------------------
await show(
    echart([
        {
            id: 'plain',
            name: 'Einzeln',
            datapointId: 'test.f.plain',
            chartType: 'line',
            historyInstance: 'history.0',
            yAxisIndex: 0,
        },
        formulaSeries('sum', 'Summe', { a: 'test.f.a', b: 'test.f.b', c: 'test.f.c' }, 'a + b + c'),
    ]),
);
{
    const all = (await seriesOf()) ?? [];
    const sum = all.find((x) => x.name === 'Summe');
    const plain = all.find((x) => x.name === 'Einzeln');
    check('the plain series still draws beside it', (plain?.points ?? 0) > 0);
    check('the sum ends on 2 + 10 + 200', sum?.ys?.at(-1) === 212, JSON.stringify(sum?.ys?.slice(-3)));
    check('and was 1 + 10 + 100 at the start', sum?.ys?.[0] === 111, String(sum?.ys?.[0]));
}

// -- 3. integral: 100 W for 24 h = 2400 Wh -------------------------------------------------
await show(
    echart([formulaSeries('e', 'Energie', { p: 'test.f.p' }, 'p', { periodValue: 'integral' })], {
        echartPeriodPlacement: 'legend',
    }),
);
{
    const v = await legendValues();
    check('integral of 100 W over 24 h is 2400 Wh', Math.abs((v.Energie ?? NaN) - 2400) < 1, JSON.stringify(v));
}

// -- 4. delta bars of three counters -------------------------------------------------------
await show(
    echart(
        [
            formulaSeries('d', 'Zähler', { m1: 'test.f.m1', m2: 'test.f.m2', m3: 'test.f.m3' }, 'm1 + m2 + m3', {
                aggregate: 'delta',
                deltaBucket: 'day',
                chartType: 'bar',
            }),
        ],
        { echartRange: '7d' },
    ),
);
{
    const [s] = (await seriesOf()) ?? [];
    const full = (s?.ys ?? []).slice(1, -1);
    check(
        'a whole day of three meters sums to 6 × 24',
        full.length > 0 && full.every((y) => y === 144),
        JSON.stringify(s?.ys),
    );
}

// -- 5. shifted by a day -------------------------------------------------------------------
await show(
    echart([
        formulaSeries('y', 'Gestern', { u: 'test.f.u', i: 'test.f.i' }, 'u * i', {
            aggregate: 'none',
            timeShift: 1,
            timeShiftUnit: 'day',
        }),
    ]),
);
{
    const [s] = (await seriesOf()) ?? [];
    const at = (ts) => s?.ys?.[(s?.xs ?? []).indexOf(ts)];
    check('yesterday starts on 3 A × 50 V', s?.first === now - DAY && s?.ys?.[0] === 150, `${s?.first} ${s?.ys?.[0]}`);
    check('its change 30 h ago lands 6 h ago', at(now - 6 * H) === 100, JSON.stringify(s?.ys));
    check(
        'and nothing reaches past now',
        (s?.xs ?? []).every((x) => x <= now),
    );
}

// -- 6. the editor -------------------------------------------------------------------------
// The edit dialog folds every section; open them all.
await page.evaluate(() => window.__auraShot.unfoldSections());
await page.evaluate(
    (w) => {
        window.__auraShot.showWidgets([w], { editMode: true });
        window.__auraShot.setEditMode(true);
    },
    { ...echart([formulaSeries('p', 'Leistung', { u: 'test.f.u', i: 'test.f.i' }, 'u * i')]), id: 'w-formula-edit' },
);
await page.waitForTimeout(1200);
await page.locator('.aura-edit-chrome button').first().click();
await page.locator('button:text-is("Bearbeiten")').click();
await page.locator('button:has-text("Datenpunkte verwalten")').first().click();
const dlg = page.locator('.aura-config-modal');
await dlg.locator('[data-testid="echart-formula-panel"]').waitFor({ timeout: 10000 });
check(
    'source "Formel" is lit',
    (await dlg.locator('.aura-series-source button:text-is("Formel")').evaluate((el) => el.style.background)).includes(
        'accent',
    ),
);
check('two input rows', (await dlg.locator('[data-testid="echart-formula-input"]').count()) === 2);
const preview = dlg.locator('[data-testid="echart-formula-preview"]');
check(
    'preview: u × i as of now',
    /Jetzt: 100\b/.test((await preview.textContent()) ?? ''),
    await preview.textContent(),
);
await dlg.locator('[data-testid="echart-formula"]').fill('u * ix');
await page.waitForTimeout(300);
check(
    'an unknown variable is named',
    ((await preview.textContent()) ?? '').includes('„ix“'),
    await preview.textContent(),
);
const stored = await page.evaluate(() => window.__auraShot.widgetOptions('w-formula-edit'));
check('the formula is stored', stored?.echartSeries?.[0]?.formula === 'u * ix');
check(
    'the history section stays for a formula series',
    (await dlg.locator('[data-testid="echart-period-value"] option[value="integral"]').count()) === 1,
);

check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
