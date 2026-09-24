// User-defined time-range chips on both chart widgets (issue #709).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/chart-range-chips.mjs
//
// `rangeChips` replaces the built-in chips. Checked here: exactly the listed chips show, a default
// range outside the list starts on the first chip, month chips frame calendar months on the axis,
// and without the option the presets stay as they were.
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
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });
await page.evaluate(() => {
    window.__auraShot.mock({ 'demo.power': 1500 });
    window.__auraShot.mockServerState({ 'demo.power': 1500 });
    window.__auraShot.enableHistory(true);
});

const widget = page.locator('.react-grid-item');
const echart = (id, opts) => ({
    id,
    type: 'echart',
    title: 'Leistung',
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
                name: 'Leistung',
                datapointId: 'demo.power',
                chartType: 'line',
                color: '#3b82f6',
                historyInstance: 'history.0',
                yAxisIndex: 0,
            },
        ],
    },
});
const mount = async (w) => {
    await page.evaluate((cfg) => window.__auraShot.showWidgets([cfg]), w);
    await widget.first().waitFor({ state: 'attached', timeout: 20000 });
    await page.waitForTimeout(900);
};
const spanDays = async () => {
    const got = await page.waitForFunction(
        () => {
            const a = window.__auraShot.chartAxes();
            return a && Array.isArray(a.xExtent) ? a.xExtent : null;
        },
        { timeout: 15000 },
    );
    const [min, max] = await got.jsonValue();
    return (max - min) / 86400000;
};
// The range chips are the small `text-[10px]` buttons of the header row.
const chips = () => widget.locator('button.text-\\[10px\\]');
const chipLabels = () => chips().evaluateAll((els) => els.map((el) => el.textContent.trim()));
const activeChip = async () =>
    JSON.stringify(
        await chips().evaluateAll((els) =>
            els.filter((el) => el.style.background.includes('--accent')).map((el) => el.textContent.trim()),
        ),
    );
// The mock history draws 64 points over the window, so the data extent falls short of the window
// by up to one point gap; the calendar maths itself is covered by tools/tests/range-chips.mjs.
const near = (v, want, tol) => Math.abs(v - want) <= tol + want / 64;
const calDays = (months) => {
    const now = new Date();
    const d = new Date(now);
    d.setMonth(d.getMonth() - months);
    return (now - d) / 86400000;
};
const click = async (label) => {
    await widget.locator(`button:text-is("${label}")`).click();
    await page.waitForTimeout(900);
};

// ── Advanced chart: month-only list, default range not among it ──────────────
{
    await mount(echart('w-chips-months', { echartRange: '24h', rangeChips: ['1M', '3M=Quartal', '12M', 'total'] }));
    await widget.locator('[_echarts_instance_]').waitFor({ state: 'attached', timeout: 20000 });
    const labels = await chipLabels();
    check(
        'exactly the listed chips are offered',
        JSON.stringify(labels) === JSON.stringify(['1 Monat', 'Quartal', '12 Monate', 'Gesamt']),
        JSON.stringify(labels),
    );
    const start = await activeChip();
    check('a default outside the list starts on the first chip', start === '["1 Monat"]', start);
    const one = await spanDays();
    check(
        '1 Monat frames one calendar month',
        near(one, calDays(1), 1.5),
        `${one.toFixed(2)} d vs ${calDays(1).toFixed(2)}`,
    );

    await click('Quartal');
    const three = await spanDays();
    check(
        'the captioned 3M chip frames three calendar months',
        near(three, calDays(3), 1.5),
        `${three.toFixed(2)} d vs ${calDays(3).toFixed(2)}`,
    );
    const after = await activeChip();
    check('and is the active chip now', after === '["Quartal"]', after);

    await click('12 Monate');
    const twelve = await spanDays();
    check('12 Monate frames a calendar year', near(twelve, calDays(12), 3), `${twelve.toFixed(2)} d`);
}

// ── Advanced chart: default range IS in the list → it stays the start ────────
{
    await mount(echart('w-chips-default', { echartRange: '7d', rangeChips: ['24h', '7d', '2w'] }));
    await widget.locator('[_echarts_instance_]').waitFor({ state: 'attached', timeout: 20000 });
    const start = await activeChip();
    check('a default among the chips starts lit', start === '["7 Tage"]', start);
    await click('2 Wochen');
    const two = await spanDays();
    check('2 Wochen frames 14 days', near(two, 14, 1), `${two.toFixed(2)} d`);
}

// ── Advanced chart without the option: built-in chips unchanged ──────────────
{
    await mount(echart('w-chips-none', { echartRange: '24h', echartVisibleRanges: ['24h', '7d'] }));
    await widget.locator('[_echarts_instance_]').waitFor({ state: 'attached', timeout: 20000 });
    const labels = await chipLabels();
    check(
        'without rangeChips the presets stay',
        JSON.stringify(labels) === '["24 Std","7 Tage"]',
        JSON.stringify(labels),
    );
}

// ── Simple chart ─────────────────────────────────────────────────────────────
{
    await mount({
        id: 'w-chips-simple',
        type: 'chart',
        title: 'Leistung',
        datapoint: 'demo.power',
        layout: 'default',
        gridPos: { x: 0, y: 0, w: 8, h: 6 },
        options: { historyInstance: 'history.0', historyRange: '24h', rangeChips: ['2w', '3M', '2y', 'total'] },
    });
    const labels = await chipLabels();
    check(
        'simple chart offers the listed chips',
        JSON.stringify(labels) === JSON.stringify(['2 Wochen', '3 Monate', '2 Jahre', 'Gesamt']),
        JSON.stringify(labels),
    );
    const start = await activeChip();
    check('and starts on the first one', start === '["2 Wochen"]', start);
    await click('3 Monate');
    const moved = await activeChip();
    check('a click moves the active chip', moved === '["3 Monate"]', moved);
    await click('Gesamt');
    const total = await activeChip();
    check('total works on the simple chart', total === '["Gesamt"]', total);
}

// ── Editor: seed the list, add a month chip, remove one, back to built-in ────
{
    await page.evaluate(() => {
        window.__auraShot.showWidgets(
            [
                {
                    id: 'w-chips-editor',
                    type: 'echart',
                    title: 'Leistung',
                    datapoint: '',
                    layout: 'default',
                    gridPos: { x: 0, y: 0, w: 12, h: 8 },
                    options: {
                        echartMode: 'timeseries',
                        echartRange: '24h',
                        echartVisibleRanges: ['24h', '7d', '30d'],
                        echartSeries: [
                            {
                                id: 's1',
                                name: 'Leistung',
                                datapointId: 'demo.power',
                                chartType: 'line',
                                historyInstance: 'history.0',
                                yAxisIndex: 0,
                            },
                        ],
                    },
                },
            ],
            { editMode: true },
        );
        window.__auraShot.setEditMode(true);
    });
    const opts = () => page.evaluate(() => window.__auraShot.widgetOptions('w-chips-editor'));
    await page.locator('.aura-edit-chrome button').first().click();
    await page.locator('button:text-is("Bearbeiten")').click();
    const ed = page.locator('[data-testid="range-chips-editor"]');
    await ed.waitFor({ timeout: 10000 });
    check(
        'the editor shows the built-in state first',
        (await ed.locator('button:text-is("Eigene Liste anlegen")').count()) === 1,
    );
    await ed.locator('button:text-is("Eigene Liste anlegen")').click();
    await page.waitForTimeout(300);
    let o = await opts();
    check(
        '"own list" seeds it with the visible presets',
        JSON.stringify(o.rangeChips) === '["24h","7d","30d"]',
        JSON.stringify(o.rangeChips),
    );
    check(
        'the preset toggles give way to the list',
        (await page.getByText('Sichtbare Zeitbereiche im Frontend').count()) === 0,
    );

    await ed.locator('input[type="number"]').fill('6');
    await ed.locator('select').selectOption('M');
    await ed.locator('button:has-text("Hinzufügen")').click();
    await ed.locator('button:has-text("Gesamt")').click();
    await page.waitForTimeout(300);
    o = await opts();
    check(
        'month and total chips are appended',
        JSON.stringify(o.rangeChips) === '["24h","7d","30d","6M","total"]',
        JSON.stringify(o.rangeChips),
    );

    await ed.locator('span:has-text("7 Tage") button[aria-label="Entfernen"]').click();
    await ed.locator('span:has-text("6 Monate") button[aria-label="Nach vorne"]').click();
    await page.waitForTimeout(300);
    o = await opts();
    check(
        'remove and move left',
        JSON.stringify(o.rangeChips) === '["24h","6M","30d","total"]',
        JSON.stringify(o.rangeChips),
    );
    await ed.screenshot({ path: 'node_modules/.cache/range-chips-editor.png' });

    await ed.locator('button:text-is("Standard")').click();
    await page.waitForTimeout(300);
    o = await opts();
    check('"Standard" drops the option again', o.rangeChips === undefined, JSON.stringify(o.rangeChips));
}

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
