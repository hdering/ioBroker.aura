// Verifies the "current time" line of the advanced chart.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/chart-now-line.mjs
//
// The line is a markLine on the first series. Checked: off by default, drawn at the current time
// in today's day view with the chosen or the default colour, no extra series, and gone where "now"
// lies outside the plotted span (yesterday) — written as an empty markLine there, since the
// timeseries chart merges its options and would otherwise keep the old one. A JSON category axis
// puts the line at the label containing `echartNowLineMatch`. JSON series only load while the
// socket is connected, so run the dev server against a live instance (not the 127.0.0.1:9 target).
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
await page.evaluate(() => window.__auraShot.enableHistory(true));

const PREV_TITLE = 'Einen Tag zurück';

let n = 0;
/** Renders one chart and returns its mark lines once the series are in. */
async function render(options, values) {
    n++;
    await page.evaluate(
        ([id, opts, vals]) => {
            window.__auraShot.mock(vals);
            window.__auraShot.mockServerState(vals);
            window.__auraShot.showWidgets([
                {
                    id,
                    type: 'echart',
                    title: 'Leistung',
                    datapoint: '',
                    layout: 'default',
                    gridPos: { x: 0, y: 0, w: 12, h: 8 },
                    options: { echartMode: 'timeseries', echartShowCurrent: false, ...opts },
                },
            ]);
        },
        [`w-nowline-${n}`, options, values],
    );
    // Day mode frames its window without data, so only the forecast case waits for points.
    await page.waitForFunction(
        (needData) => {
            const ser = window.__auraShot.chartSeries();
            return !!ser && (!needData || ser.some((x) => x.points > 0));
        },
        !!options.echartSeries?.some((x) => x.source === 'json'),
        { timeout: 20000 },
    );
    await page.waitForTimeout(500);
    return page.evaluate(() => window.__auraShot.chartMarkLines());
}

// Each case its own datapoint: fabricated history is generated per id at fetch time.
const historySeries = (dp) => [
    {
        id: 's1',
        name: 'Leistung',
        datapointId: dp,
        chartType: 'line',
        color: '#3b82f6',
        historyInstance: 'history.0',
        historyRange: '24h',
        yAxisIndex: 0,
    },
];
const near = (x) => typeof x === 'number' && Math.abs(x - Date.now()) < 120_000;

// ── 1. Off by default ────────────────────────────────────────────────────────
{
    const lines = await render(
        { echartDayNav: true, echartDayNavDefault: true, echartSeries: historySeries('demo.now1') },
        { 'demo.now1': 1500 },
    );
    check('no line by default', Array.isArray(lines) && lines.length === 0, JSON.stringify(lines));
}

// ── 2. Today's day view: line at the current time, in the chosen colour ──────
{
    const lines = await render(
        {
            echartDayNav: true,
            echartDayNavDefault: true,
            echartNowLine: true,
            echartNowLineColor: '#00ff00',
            echartSeries: historySeries('demo.now2'),
        },
        { 'demo.now2': 1500 },
    );
    check('one line in today’s view', lines?.length === 1, JSON.stringify(lines));
    check('the line sits at the current time', near(lines?.[0]?.x), JSON.stringify(lines?.[0]));
    check('the line takes the chosen colour', lines?.[0]?.color === '#00ff00', JSON.stringify(lines?.[0]));
    const series = await page.evaluate(() => window.__auraShot.chartSeries());
    check('no extra series for the line', series?.length === 1, JSON.stringify(series?.map((x) => x.name)));

    // Yesterday does not contain "now".
    await page.locator(`.react-grid-item button[title="${PREV_TITLE}"]`).click();
    await page.waitForTimeout(900);
    const past = await page.evaluate(() => window.__auraShot.chartMarkLines());
    check('no line on a past day', Array.isArray(past) && past.length === 0, JSON.stringify(past));
}

// ── 3. Default colour ────────────────────────────────────────────────────────
{
    const lines = await render(
        {
            echartDayNav: true,
            echartDayNavDefault: true,
            echartNowLine: true,
            echartSeries: historySeries('demo.now3'),
        },
        { 'demo.now3': 1500 },
    );
    check('default colour is red', lines?.[0]?.color === '#ef4444', JSON.stringify(lines?.[0]));
    await page.screenshot({
        path: 'node_modules/.cache/chart-now-line.png',
        clip: { x: 0, y: 0, width: 800, height: 400 },
    });
}

// ── 4. JSON category axis: the line goes to the label containing the text ─────
{
    // Shape of a real weather payload: the current hour is labelled by the script itself.
    const payload = JSON.stringify({
        hours: ['heute 18:00', 'heute 19:00', '▶ jetzt', 'heute 21:00', 'morgen 00:00'].map((label, i) => ({
            label,
            v: 14 + i / 10,
        })),
    });
    const series = [
        {
            id: 's1',
            name: 'Temperatur',
            datapointId: 'demo.weather',
            chartType: 'line',
            source: 'json',
            jsonPath: 'hours',
            jsonLabelKey: 'label',
            jsonValueKey: 'v',
            yAxisIndex: 0,
        },
    ];
    const lines = await render(
        { echartMode: 'json', echartNowLine: true, echartNowLineMatch: 'JETZT', echartSeries: series },
        { 'demo.weather': payload },
    );
    check('category axis: line at the matching label', lines?.[0]?.x === '▶ jetzt', JSON.stringify(lines));

    const none = await render(
        { echartMode: 'json', echartNowLine: true, echartSeries: series },
        { 'demo.weather': payload },
    );
    check('category axis without a text: no line', Array.isArray(none) && none.length === 0, JSON.stringify(none));

    // The editor says whether the text hits a label, and offers the labels to pick from — a text
    // that matches nothing (someone typed the label they WANTED) used to fail silently.
    const id = `w-nowline-${++n}`;
    await page.evaluate(
        ([wid, opts, vals]) => {
            window.__auraShot.mock(vals);
            window.__auraShot.mockServerState(vals);
            window.__auraShot.showWidgets(
                [
                    {
                        id: wid,
                        type: 'echart',
                        title: 'Wetter',
                        datapoint: '',
                        layout: 'default',
                        gridPos: { x: 0, y: 0, w: 12, h: 8 },
                        options: opts,
                    },
                ],
                { editMode: true },
            );
            window.__auraShot.setEditMode(true);
        },
        [
            id,
            { echartMode: 'json', echartNowLine: true, echartNowLineMatch: 'Aktuell', echartSeries: series },
            { 'demo.weather': payload },
        ],
    );
    await page.waitForTimeout(1200);
    await page.locator('.aura-edit-chrome button').first().click();
    await page.locator('button:text-is("Bearbeiten")').click();
    const status = page.locator('.aura-nowline-status');
    await status.waitFor({ timeout: 10000 });
    await page.waitForFunction(
        () => /Keine Beschriftung|Linie bei/.test(document.querySelector('.aura-nowline-status')?.textContent ?? ''),
        null,
        { timeout: 10000 },
    );
    const miss = await status.innerText();
    check('editor reports a text that hits no label', miss.includes('Keine Beschriftung enthält „Aktuell“'), miss);
    await status.locator('xpath=preceding-sibling::div[1]//select').selectOption('▶ jetzt');
    await page.waitForTimeout(400);
    const opts = await page.evaluate((wid) => window.__auraShot.widgetOptions(wid), id);
    check(
        'picking a label from the data sets the text',
        opts?.echartNowLineMatch === '▶ jetzt',
        opts?.echartNowLineMatch,
    );
    const hit = await status.innerText();
    check('and the editor names the label the line sits at', hit.includes('Linie bei „▶ jetzt“'), hit);
    const live = await page.evaluate(() => window.__auraShot.chartMarkLines());
    check('the chart draws the line right away', live?.[0]?.x === '▶ jetzt', JSON.stringify(live));
    await page.keyboard.press('Escape');
}

check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
