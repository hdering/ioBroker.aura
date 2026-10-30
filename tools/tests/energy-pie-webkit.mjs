// Pie and donut of the Energiebilanz widget must render in WebKit (issue #877).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/energy-pie-webkit.mjs
//
// iOS browsers are all WebKit; there the svg (height:100% + width:auto + aspect-ratio in a
// shrink-to-fit box) collapsed to width 0, so pie and donut vanished while the bars stayed.
// Checked in Chromium and WebKit: the chart svg is square, not empty, and no larger than
// pieSize, both in a tall and in a short widget. Config follows the reporter's export.
// 'last' values only arrive with a live connection; offline the empty placeholder ring is
// measured instead - it sits in the same box with the same sizing.
import { chromium, webkit } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

for (const engine of [chromium, webkit]) {
    const browser = await engine.launch();
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));

    await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });

    for (const chartStyle of ['donut', 'pie']) {
        for (const h of [10, 5]) {
            const caseKey = `${engine.name()}-${chartStyle}-${h}`;
            const mocks = { [`demo.ebp.${caseKey}.a`]: 418.7, [`demo.ebp.${caseKey}.b`]: 509.5 };
            const widget = {
                id: `w-energy-pie-${caseKey}`,
                type: 'energiebilanz',
                title: '',
                datapoint: '',
                layout: 'default',
                gridPos: { x: 0, y: 0, w: 6, h },
                options: {
                    chartStyle,
                    showTotals: true,
                    showPercent: true,
                    lockRange: true,
                    range: '24h',
                    showBarTitles: true,
                    legendFormat: 'label-value',
                    pieSize: 200,
                    showTitle: false,
                    bars: [
                        {
                            id: `bar-${caseKey}`,
                            title: 'Monatsproduktion',
                            legendSide: 'left',
                            entries: Object.keys(mocks).map((dp, i) => ({
                                id: `e${i}-${caseKey}`,
                                datapointId: dp,
                                aggregate: 'last',
                                color: i ? '#3b82f6' : '#22c55e',
                                label: i ? 'Eigenverbrauch' : 'Einspeisung',
                            })),
                        },
                    ],
                },
            };
            await page.evaluate(
                ([widgetCfg, vals]) => {
                    window.__auraShot.mock(vals);
                    window.__auraShot.mockServerState(vals);
                    window.__auraShot.showWidgets([widgetCfg]);
                },
                [widget, mocks],
            );
            await page
                .waitForFunction(
                    (id) =>
                        !!document
                            .querySelector(`[data-aura-energy-total="${id}"]`)
                            ?.closest('[data-aura-energy-over]')
                            ?.querySelector('svg[viewBox] circle, svg[viewBox] path'),
                    `bar-${caseKey}`,
                    { timeout: 15000 },
                )
                .catch(async (e) => {
                    console.log(await page.evaluate(() => document.body.innerText.slice(0, 500)));
                    throw e;
                });
            await page.waitForTimeout(300);
            const box = await page.evaluate((id) => {
                const group = document
                    .querySelector(`[data-aura-energy-total="${id}"]`)
                    ?.closest('[data-aura-energy-over]');
                const svg = [...(group?.querySelectorAll('svg[viewBox]') ?? [])].find((s) =>
                    s.querySelector('path, circle'),
                );
                if (!svg) return null;
                const r = svg.getBoundingClientRect();
                return { w: r.width, h: r.height };
            }, `bar-${caseKey}`);
            check(
                `${caseKey}: chart visible and square`,
                !!box && box.w > 40 && Math.abs(box.w - box.h) < 2 && box.w <= 200,
                box ? `${box.w.toFixed(0)}×${box.h.toFixed(0)}` : 'no svg',
            );
        }
    }
    check(`${engine.name()}: no page errors`, pageErrors.length === 0, pageErrors.join(' | '));
    await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
