// Bar interval of counter (`delta`) series, switchable in the frontend (issue #1036).
//
//   AURA_IOBROKER_URL=http://127.0.0.1:9 npx vite --port 5291 --host 127.0.0.1   (or set AURA_BASE)
//   node tools/tests/chart-interval-chips.mjs
//
// Checked here: a range chip can carry its own interval (`2y/M`), the interval chip bar overrides
// it, chips that would flood the window are greyed out, and a chart without counter series shows
// no interval bar at all.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://127.0.0.1:5291';

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

await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });
await page.evaluate(() => {
    window.__auraShot.mock({ 'demo.meter': 12345 });
    window.__auraShot.mockServerState({ 'demo.meter': 12345 });
    // A meter rising 1 per 6 h over eleven years — `delta` needs a monotonic counter.
    const now = Date.now();
    const rows = [];
    for (let t = now - 11 * 366 * 86400000, v = 0; t <= now; t += 6 * 3600000, v += 1) rows.push([t, v]);
    window.__auraShot.mockHistory({ 'demo.meter': rows });
});

const widget = page.locator('.react-grid-item');
const echart = (id, opts, aggregate = 'delta') => ({
    id,
    type: 'echart',
    title: 'Zähler',
    datapoint: '',
    layout: 'default',
    gridPos: { x: 0, y: 0, w: 12, h: 8 },
    options: {
        echartMode: 'timeseries',
        echartShowCurrent: false,
        ...opts,
        echartSeries: [
            {
                id: 's1',
                name: 'Verbrauch',
                datapointId: 'demo.meter',
                chartType: 'bar',
                color: '#3b82f6',
                historyInstance: 'history.0',
                yAxisIndex: 0,
                aggregate,
                deltaBucket: 'auto',
            },
        ],
    },
});
const mount = async (w) => {
    await page.evaluate((cfg) => window.__auraShot.showWidgets([cfg]), w);
    await widget.first().waitFor({ state: 'attached', timeout: 20000 });
    await widget.locator('[_echarts_instance_]').waitFor({ state: 'attached', timeout: 20000 });
    await page.waitForTimeout(1200);
};
const bars = async () => {
    await page.waitForTimeout(1200);
    const s = await page.evaluate(() => window.__auraShot.chartSeries());
    return s?.[0]?.points ?? -1;
};
const interval = (b) => widget.locator(`[data-testid="echart-interval-chips"] button[data-bucket="${b}"]`);
const activeInterval = () =>
    widget
        .locator('[data-testid="echart-interval-chips"] button')
        .evaluateAll((els) =>
            els.filter((el) => el.style.background.includes('--accent')).map((el) => el.dataset.bucket),
        );
const click = async (label) => {
    await widget.locator(`button:text-is("${label}")`).click();
    await page.waitForTimeout(300);
};

{
    await mount(
        echart('w-int', {
            echartRange: '7d',
            rangeChips: ['7d', '2y/M=2 Jahre', '10y'],
            intervalChips: ['h', 'd', 'w', 'M', 'q', 'y'],
        }),
    );
    check('the interval bar shows', (await widget.locator('[data-testid="echart-interval-chips"]').count()) === 1);
    const week = await bars();
    check('7 days, auto interval: daily bars', week >= 6 && week <= 9, `${week} bars`);
    check(
        'hourly is offered for 7 days, yearly is not',
        (await interval('hour').isEnabled()) && !(await interval('year').isEnabled()),
    );

    await click('2 Jahre');
    const months = await bars();
    check('the 2y/M chip draws monthly bars', months >= 20 && months <= 26, `${months} bars`);
    check('and lights its interval', JSON.stringify(await activeInterval()) === '["month"]');
    check('hourly is greyed out over 2 years', !(await interval('hour').isEnabled()));

    await interval('quarter').click();
    const quarters = await bars();
    check('the interval bar overrides the chip: quarters', quarters >= 7 && quarters <= 9, `${quarters} bars`);
    check('quarter is lit', JSON.stringify(await activeInterval()) === '["quarter"]');
    const labels = await page.evaluate(() => window.__auraShot.chartTexts());
    check(
        'the axis reads quarters',
        (labels ?? []).some((t) => /^Q[1-4] \d{4}$/.test(t)),
        JSON.stringify((labels ?? []).slice(0, 12)),
    );

    await interval('year').click();
    const years = await bars();
    check('yearly over 2 years: up to 3 bars', years >= 2 && years <= 3, `${years} bars`);

    // A chip without its own interval keeps what was picked in the bar.
    await click('10 Jahre');
    const tenYears = await bars();
    check('10 years keeps the picked yearly interval', tenYears >= 9 && tenYears <= 11, `${tenYears} bars`);

    // Back to a chip with its own interval — the chip wins again.
    await click('2 Jahre');
    check('the chip interval takes over again', JSON.stringify(await activeInterval()) === '["month"]');
    await widget.screenshot({ path: 'node_modules/.cache/chart-interval-chips.png' });
}

// Without counter series there is nothing to re-bucket.
{
    await mount(echart('w-int-avg', { echartRange: '7d', intervalChips: ['d', 'M'] }, 'average'));
    check(
        'no interval bar without delta series',
        (await widget.locator('[data-testid="echart-interval-chips"]').count()) === 0,
    );
}

// Editor: interval per range chip, and the interval chip bar.
{
    await page.evaluate(
        (cfg) => {
            window.__auraShot.showWidgets([cfg], { editMode: true });
            window.__auraShot.setEditMode(true);
            window.__auraShot.unfoldSections();
        },
        echart('w-int-ed', { echartRange: '24h', rangeChips: ['24h'] }),
    );
    const opts = () => page.evaluate(() => window.__auraShot.widgetOptions('w-int-ed'));
    await page.locator('.aura-edit-chrome button').first().click();
    await page.locator('button:text-is("Bearbeiten")').click();
    const ed = page.locator('[data-testid="range-chips-editor"]');
    await ed.waitFor({ timeout: 10000 });
    await ed.locator('input[type="number"]').fill('2');
    await ed.locator('select[aria-label="Einheit"]').selectOption('y');
    await ed.locator('[data-testid="range-chips-interval"]').selectOption('month');
    await ed.locator('button:has-text("Hinzufügen")').click();
    await page.waitForTimeout(300);
    let o = await opts();
    check(
        'a chip with interval is stored as 2y/M',
        JSON.stringify(o.rangeChips) === '["24h","2y/M"]',
        JSON.stringify(o.rangeChips),
    );
    check('the editor names the interval', (await ed.getByText('2 Jahre · Monat').count()) === 1);

    const cfg = page.locator('[data-testid="echart-interval-chips-config"]');
    await cfg.locator('button[data-bucket="month"]').click();
    await cfg.locator('button[data-bucket="day"]').click();
    await page.waitForTimeout(300);
    o = await opts();
    check(
        'interval chips are stored fine to coarse',
        JSON.stringify(o.intervalChips) === '["d","M"]',
        JSON.stringify(o.intervalChips),
    );
    await cfg.locator('button[data-bucket="day"]').click();
    await cfg.locator('button[data-bucket="month"]').click();
    await page.waitForTimeout(300);
    o = await opts();
    check('switching all off drops the option', o.intervalChips === undefined, JSON.stringify(o.intervalChips));
}

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
