// Verifies datapoint bindings in the running frontend — the React wiring that the
// pure tests (expr.mjs, html-dp-tokens.mjs) cannot see: are the referenced
// datapoints actually subscribed, and does the widget re-render when one changes?
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/bindings-live.mjs
//
// Covers the HTML widget (bindings inside a sandboxed srcDoc) and the value widget
// (bindings inside dangerouslySetInnerHTML).
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail && !ok ? ` — ${detail}` : ''}`);
};

// A fixed instant so `date()` has something deterministic to render.
const LC = new Date(2026, 7, 22, 14, 32, 0).getTime();

const HTML_TPL = [
    '<style>.x { color: red; background: blue }</style>',
    'V=[{0_userdata.0.Netz}]',
    'C=[{0_userdata.0.Netz;round(0)}]',
    'F=[{0_userdata.0.Netz;formatValue(1)}]',
    'N=[{a:0_userdata.0.Rot;b:0_userdata.0.Gruen;a + b}]',
    "E=[{{ 0_userdata.0.Netz < 0 ? 'gruen' : 'rot' }}]",
    'X=[{{ 188.5 - 188.5 * Math.min(0_userdata.0.Rot / 255, 1) }}]',
    'RGB=[#{0_userdata.0.Rot;HEX2}{0_userdata.0.Gruen;HEX2}{0_userdata.0.Blau;HEX2}]',
    'D=[{dp}]',
    'P=[{dp;round(0)}]',
    'T=[{0_userdata.0.Netz.lc;date(HH:mm)}]',
    'W=[{{ wname }}]',
].join('\n');

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

const mock = (map) => page.evaluate((m) => window.__auraShot.mock(m), map);
const show = async (widgets) => {
    await page.evaluate((w) => window.__auraShot.showWidgets(w), widgets);
    await page.waitForTimeout(900);
};

await mock({
    '0_userdata.0.Netz': { val: -1234.56, lc: LC, ts: LC },
    '0_userdata.0.Rot': 100,
    '0_userdata.0.Gruen': 200,
    '0_userdata.0.Blau': 12,
    '0_userdata.0.Eigen': 21.6,
});

// ── HTML widget ───────────────────────────────────────────────────────────────

await show([
    {
        id: 'bind-html',
        type: 'html',
        title: 'Bindings',
        datapoint: '',
        gridPos: { x: 0, y: 0, w: 14, h: 12 },
        options: { htmlContent: HTML_TPL, valueDatapoint: '0_userdata.0.Eigen', decimals: 1, showTitle: true },
    },
]);

const srcdoc = () =>
    page.evaluate(() => document.querySelector('.aura-widget-bind-html iframe')?.getAttribute('srcdoc') ?? '');

let doc = await srcdoc();
check('html: widget rendered', doc.length > 0, doc.slice(0, 120));

const has = (name, needle, text = doc) => check(name, text.includes(needle), `missing ${needle} in ${text}`);
// The thousands / decimal separator comes from the instance's global number format,
// so the localized cases are matched loosely — what matters is that they are NOT the
// technical rendering an expression would produce.
const hasRe = (name, re, text = doc) => check(name, re.test(text), `no match for ${re} in ${text}`);

hasRe('html: plain value uses the widget number format', /V=\[-1[.,]?234[.,]6\]/);
has('html: chain rounds', 'C=[-1235]');
hasRe('html: formatValue uses the widget number format', /F=\[-1[.,]?234[.,]6\]/);
has('html: named variables add up', 'N=[300]');
has('html: expression picks the colour', 'E=[gruen]');
has('html: expression computes the geometry', 'X=[114.578431373]');
has('html: hex chain builds the colour', 'RGB=[#64C80C]');
hasRe('html: {dp} resolves', /D=\[21[.,]6\]/);
has('html: chain on {dp}', 'P=[22]');
has('html: .lc renders as a time', 'T=[14:32]');
has('html: special variable', 'W=[Bindings]');
has('html: inline CSS untouched', '<style>.x { color: red; background: blue }</style>');

// ── live update ───────────────────────────────────────────────────────────────

await mock({ '0_userdata.0.Netz': { val: 42.4, lc: LC, ts: LC }, '0_userdata.0.Rot': 255 });
await page.waitForTimeout(700);
doc = await srcdoc();
has('live: chain followed the new value', 'C=[42]');
has('live: expression followed the new value', 'E=[rot]');
has('live: geometry recomputed', 'X=[0]');
has('live: hex recomputed', 'RGB=[#FFC80C]');

// ── HTML delivered by a datapoint ─────────────────────────────────────────────
// A script can write the markup once and aura keeps the bindings inside it live.

await mock({
    '0_userdata.0.Markup': 'S=[{0_userdata.0.Rot;HEX2}] T=[{{ 0_userdata.0.Rot * 2 }}]',
});
await show([
    {
        id: 'bind-dphtml',
        type: 'html',
        title: 'Aus DP',
        datapoint: '',
        gridPos: { x: 0, y: 0, w: 14, h: 6 },
        options: { htmlDatapoint: '0_userdata.0.Markup', decimals: 1 },
    },
]);
const dpDoc = await page.evaluate(
    () => document.querySelector('.aura-widget-bind-dphtml iframe')?.getAttribute('srcdoc') ?? '',
);
has('dp-html: chain resolved in datapoint markup', 'S=[FF]', dpDoc);
has('dp-html: expression resolved in datapoint markup', 'T=[510]', dpDoc);

// ── value widget ──────────────────────────────────────────────────────────────

await show([
    {
        id: 'bind-value',
        type: 'value',
        title: 'Wert',
        datapoint: '0_userdata.0.Eigen',
        gridPos: { x: 0, y: 0, w: 14, h: 6 },
        options: {
            decimals: 1,
            htmlTemplate: 'A=[{dp}] B=[{{ dp * 2 }}] C=[{dp;round(0)}] D=[{0_userdata.0.Rot;HEX2}] E=[{unit}]',
            unit: 'kW',
        },
    },
]);

const valueHtml = await page.evaluate(() => document.querySelector('.aura-widget-bind-value')?.textContent ?? '');
check('value: widget rendered', valueHtml.length > 0, valueHtml);
hasRe('value: {dp} formatted', /A=\[21[.,]6\]/, valueHtml);
has('value: expression on the raw value', 'B=[43.2]', valueHtml);
has('value: chain on {dp}', 'C=[22]', valueHtml);
has('value: foreign datapoint in a chain', 'D=[FF]', valueHtml);
has('value: unit variable', 'E=[kW]', valueHtml);

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
    console.log('FAILED:');
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
    process.exit(1);
}
