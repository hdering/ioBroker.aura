// Verifies that a list re-renders once Custom JS registered a `callback()` function (issue #794).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/list-callback-render.mjs
//
// Custom JS loads asynchronously, so the first render of a list whose conversion is
// `callback("name", dp)` may find no function yet. Registering it later through
// `window.aura.registerFn` must update the value text and the aggregate line without
// any datapoint change. Uses the screenshot harness (__auraShot): no datapoint is touched.
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
await page.waitForFunction(() => !!window.__auraShot?.ready && !!window.aura?.registerFn, { timeout: 20000 });

const widgetText = () =>
    page.evaluate(() => {
        const el = document.querySelector('.react-grid-item');
        return el ? el.innerText.replace(/\s+/g, ' ').trim() : 'NO WIDGET';
    });

const values = {
    'demo.geraet': JSON.stringify({ veState: 'running', leistung: 1500 }),
    'demo.zahl': 21,
};
const widget = {
    id: 'w-list',
    type: 'list',
    title: 'Testliste',
    datapoint: '',
    layout: 'default',
    gridPos: { x: 0, y: 0, w: 12, h: 8 },
    options: {
        showSum: true,
        sumMode: 'sum',
        entries: [
            {
                id: 'demo.geraet',
                label: 'Gerät',
                displayType: 'value',
                valueTransform: 'expr',
                valueExpr: 'callback("geraeteStatus", dp)',
            },
            {
                id: 'demo.zahl',
                label: 'Zahl',
                displayType: 'value',
                decimals: 0,
                valueTransform: 'expr',
                valueExpr: 'callback("verdoppeln", dp)',
            },
        ],
    },
};
await page.evaluate(
    ([w, vals]) => {
        window.__auraShot.mock(vals);
        window.__auraShot.mockServerState(vals);
        window.__auraShot.showWidgets([w]);
    },
    [widget, values],
);
await page.waitForTimeout(500);

const before = await widgetText();
check('without a registered function no status is shown', !before.includes('HOCH'), before);
check('without a registered function the number is not doubled', !before.includes('42'), before);

// Registered after the first render, as Custom JS behind an @import would.
await page.evaluate(() => {
    window.aura.registerFn('geraeteStatus', (dp) => {
        const data = typeof dp === 'string' ? JSON.parse(dp) : dp;
        if (data.error === true) return 'FEHLER';
        if (data.veState !== 'running') return 'AUS';
        return Number(data.leistung) > 1000 ? 'HOCH' : 'AKTIV';
    });
    window.aura.registerFn('verdoppeln', (n) => n * 2);
});
await page.waitForTimeout(300);

const after = await widgetText();
check('status text appears after registration', after.includes('HOCH'), after);
check('converted number appears after registration', after.includes('42'), after);
check('raw JSON is not shown', !after.includes('veState'), after);

await page.evaluate(() => window.aura.unregisterFn('verdoppeln'));
await page.waitForTimeout(300);
const dropped = await widgetText();
check('unregistering drops the converted value again', !dropped.includes('42'), dropped);

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
