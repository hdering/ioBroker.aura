// Verifies that a theme token configured on an eCharts series reaches the canvas
// as a colour — and follows the theme.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/echart-token-colors.mjs
//
// Why: eCharts renders with `renderer: 'canvas'`, and a canvas has no CSS.
// Measured in this very browser: `ctx.fillStyle = 'var(--accent)'` is DROPPED,
// the fallback inside the var() included, so the shape keeps whatever colour was
// set last. A series configured with a token was therefore invisible, and the
// colour rule for charts had to be the opposite of the rule everywhere else.
//
// Now the widget resolves the value against its own element before handing the
// option to eCharts (hooks/useResolvedColors.ts), so the token is right here too.
// Checked below: the resolved value arrives, it changes with the theme, an
// undefined token falls back to the palette instead of poisoning the canvas, and
// a plain value passes through untouched.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const DP = 'demo.0.temp';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const eq = (name, got, want) => check(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

const widget = (color) => ({
    id: 'tc',
    type: 'echart',
    title: 'Verlauf',
    datapoint: '',
    gridPos: { x: 0, y: 0, w: 12, h: 8 },
    options: {
        echartMode: 'timeseries',
        echartRange: '24h',
        echartAnimation: false,
        echartSeries: [
            {
                id: 's1',
                name: 'Temperatur',
                datapointId: DP,
                chartType: 'line',
                historyInstance: 'history.0',
                ...(color === undefined ? {} : { color }),
            },
        ],
    },
});

/** The colour the series carries in the option eCharts actually holds. */
async function colorOf(color, themeId) {
    await page.evaluate(
        ({ cfg, themeId }) => {
            window.__auraShot.setTheme(themeId);
            window.__auraShot.mock({ 'demo.0.temp': { val: 21.5, unit: '°C' } });
            window.__auraShot.enableHistory(true);
            window.__auraShot.showWidgets([cfg], { editMode: false });
        },
        { cfg: widget(color), themeId },
    );
    // Two identical readings rather than a guessed timeout: the chart resolves its
    // colours in an effect, so the first option can still carry the fallback.
    let last = null;
    let prev = '';
    for (let i = 0; i < 15; i++) {
        await page.waitForTimeout(80);
        last = await page.evaluate(() => window.__auraShot.chartSeries()?.[0]?.color ?? null);
        const key = JSON.stringify(last);
        if (key === prev && last !== null) break;
        prev = key;
    }
    return last;
}

/** What the theme itself says the token is worth, read from the live DOM. */
const tokenValue = (name) =>
    page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);

// ── a token arrives as a colour, not as var() ────────────────────────────────
const dark = await colorOf('var(--accent-yellow)', 'dark');
eq('a token is resolved before it reaches the canvas', dark, await tokenValue('--accent-yellow'));
check('and it is a real colour value', /^(#|rgb)/.test(String(dark)), String(dark));

// ── and it follows the theme ─────────────────────────────────────────────────
const light = await colorOf('var(--accent-yellow)', 'light');
eq('the same token follows the theme', light, await tokenValue('--accent-yellow'));
check('which is a different colour than in the dark theme', light !== dark, `${dark} → ${light}`);

// ── the fallback inside a var() is used when the token is unset ──────────────
const fallback = await colorOf('var(--nope-not-a-token, #ff00ff)', 'dark');
eq('an unset token falls back to what the var() offers', fallback, '#ff00ff');

// ── an unset token without a fallback leaves the palette in charge ───────────
const palette = await colorOf('var(--nope-not-a-token)', 'dark');
const none = await colorOf(undefined, 'dark');
eq('an unresolvable token uses the palette colour', palette, none);
check('and never hands var() to the canvas', !/var\(/.test(String(palette)), String(palette));

// ── a plain value is untouched ───────────────────────────────────────────────
eq('a hex value passes through', await colorOf('#123456', 'dark'), '#123456');
eq('a colour name passes through', await colorOf('red', 'dark'), 'red');

// ── the chrome follows the theme too ────────────────────────────────────────
// Axis labels, axis lines, grid lines and the legend were hard-coded greys
// (#888/#444/#333). Invisible in the JSON, and wrong in every light theme: a
// #333 grid line is nearly black on white.
async function chrome(themeId) {
    await page.evaluate(
        ({ cfg, themeId }) => {
            window.__auraShot.setTheme(themeId);
            window.__auraShot.mock({ 'demo.0.temp': { val: 21.5, unit: '°C' } });
            window.__auraShot.enableHistory(true);
            window.__auraShot.showWidgets([cfg], { editMode: false });
        },
        { cfg: { ...widget('#123456'), options: { ...widget('#123456').options, echartShowLegend: true } }, themeId },
    );
    let last = null;
    let prev = '';
    for (let i = 0; i < 15; i++) {
        await page.waitForTimeout(80);
        last = await page.evaluate(() => {
            const a = window.__auraShot.chartAxes();
            if (!a) return null;
            const y = Array.isArray(a.yAxis) ? a.yAxis[0] : a.yAxis;
            return {
                label: a.xAxis?.axisLabel?.color ?? null,
                line: a.xAxis?.axisLine?.lineStyle?.color ?? null,
                grid: y?.splitLine?.lineStyle?.color ?? null,
                legend: a.legend?.textStyle?.color ?? null,
            };
        });
        const key = JSON.stringify(last);
        if (key === prev && last && last.label) break;
        prev = key;
    }
    return last;
}

const darkChrome = await chrome('dark');
const darkMuted = await tokenValue('--text-secondary');
eq('the axis labels take the muted text token', darkChrome.label, darkMuted);
eq('the legend takes it as well', darkChrome.legend, darkMuted);
eq('the axis line takes the app border', darkChrome.line, await tokenValue('--app-border'));
eq('the grid line takes the widget border', darkChrome.grid, await tokenValue('--widget-border'));
check(
    'and none of them reaches the canvas as var()',
    !Object.values(darkChrome).some((v) => /var\(/.test(String(v))),
    JSON.stringify(darkChrome),
);

const lightChrome = await chrome('light');
eq('the chrome follows the theme', lightChrome.label, await tokenValue('--text-secondary'));
check(
    'which is a different grey than in the dark theme',
    lightChrome.label !== darkChrome.label && lightChrome.grid !== darkChrome.grid,
    `${darkChrome.label}/${darkChrome.grid} → ${lightChrome.label}/${lightChrome.grid}`,
);

check('no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
    process.exit(1);
}
