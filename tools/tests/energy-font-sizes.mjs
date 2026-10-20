// Verifies the per-element font sizes of the Energiebilanz widget (issue #804).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/energy-font-sizes.mjs
//
// Group title, group total, legend and the segment percentages each take their own px size.
// Checked here: without options the built-in sizes stay (12 / 14 / 12 / 11), with options
// every element picks up its own value, the legend icon grows with the legend text, and the
// pie percentages scale along with percentFontSize.
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

/** Renders one widget (own datapoint ids per case) and reads the computed font sizes. */
async function render(caseKey, chartStyle, fontOptions) {
    const entries = [
        { key: 'pv', label: 'aus PV', color: '#22c55e', icon: 'mdi:solar-power', value: 6 },
        { key: 'bat', label: 'aus der Batterie', color: '#f59e0b', icon: 'mdi:battery', value: 3 },
        { key: 'grid', label: 'aus dem Netz', color: '#ef4444', icon: 'mdi:transmission-tower', value: 1 },
    ].map((d) => ({
        id: `${caseKey}-${d.key}`,
        datapointId: `demo.ebf.${caseKey}.${d.key}`,
        label: d.label,
        color: d.color,
        icon: d.icon,
        aggregate: 'last',
        value: d.value,
    }));
    const mocks = Object.fromEntries(entries.map((e) => [e.datapointId, e.value]));
    const widget = {
        id: `w-energy-font-${caseKey}`,
        type: 'energiebilanz',
        title: 'Verbrauch',
        datapoint: '',
        layout: 'default',
        gridPos: { x: 0, y: 0, w: 6, h: 16 },
        options: {
            unit: 'W',
            decimals: 0,
            lockRange: true,
            range: '24h',
            chartStyle,
            legendSide: 'below',
            legendFormat: 'icon-label-value',
            bars: [
                {
                    id: `bar-${caseKey}`,
                    title: 'Verbrauch aktuell',
                    entries: entries.map(({ value: _v, ...e }) => e),
                },
            ],
            ...fontOptions,
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
    await page.waitForFunction(
        (id) => {
            const el = document.querySelector(`[data-aura-energy-total="${id}"]`);
            return el && /10/.test(el.textContent);
        },
        `bar-${caseKey}`,
        { timeout: 15000 },
    );
    await page.waitForTimeout(300);
    return page.evaluate((id) => {
        const px = (el) => (el ? parseFloat(getComputedStyle(el).fontSize) : null);
        const total = document.querySelector(`[data-aura-energy-total="${id}"]`);
        const title = total?.previousElementSibling;
        const legendLabel = [...document.querySelectorAll('span')].find((s) => s.textContent === 'aus PV');
        const legendRow = legendLabel?.parentElement;
        const legendIcon = legendRow?.querySelector('svg');
        const segment = document.querySelector('[data-aura-energy-segment] span');
        const pieText = [...document.querySelectorAll('svg text')].find((t) => /%$/.test(t.textContent));
        return {
            title: px(title),
            total: px(total),
            legend: px(legendLabel),
            legendValue: px(legendLabel?.nextElementSibling),
            legendIcon: legendIcon ? legendIcon.getBoundingClientRect().height : null,
            segment: px(segment),
            pieText: pieText ? pieText.getBoundingClientRect().height : null,
        };
    }, `bar-${caseKey}`);
}

// ── 1. No options: the built-in sizes stay ───────────────────────────────────
const defBars = await render('def', 'bars', {});
check('default group title 12 px', defBars.title === 12, `${defBars.title}`);
check('default total 14 px', defBars.total === 14, `${defBars.total}`);
check('default legend 12 px', defBars.legend === 12 && defBars.legendValue === 12, `${defBars.legend}`);
check('default legend icon 16 px', Math.round(defBars.legendIcon) === 16, `${defBars.legendIcon}`);
check('default segment percent 11 px', defBars.segment === 11, `${defBars.segment}`);

// ── 2. Every element takes its own size ──────────────────────────────────────
const big = { barTitleFontSize: 18, totalFontSize: 28, legendFontSize: 20, percentFontSize: 16 };
const bigBars = await render('big', 'bars', big);
check('group title follows barTitleFontSize', bigBars.title === 18, `${bigBars.title}`);
check('total follows totalFontSize', bigBars.total === 28, `${bigBars.total}`);
check(
    'legend label and value follow legendFontSize',
    bigBars.legend === 20 && bigBars.legendValue === 20,
    `${bigBars.legend}/${bigBars.legendValue}`,
);
check('legend icon grows with the text', Math.round(bigBars.legendIcon) === 27, `${bigBars.legendIcon}`);
check('segment percent follows percentFontSize', bigBars.segment === 16, `${bigBars.segment}`);

// ── 3. Pie: percentages scale relative to the default ────────────────────────
const defPie = await render('pdef', 'pie', {});
const bigPie = await render('pbig', 'pie', { percentFontSize: 22 });
check(
    'pie percentages double with percentFontSize 22',
    defPie.pieText > 0 && Math.abs(bigPie.pieText / defPie.pieText - 2) < 0.25,
    `${defPie.pieText?.toFixed(1)} → ${bigPie.pieText?.toFixed(1)}`,
);

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
