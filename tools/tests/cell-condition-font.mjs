// Universal-widget cells honour a matched condition's font settings (#842): the switch cell
// in button mode used to read bold/italic/size only from the cell, so a condition changed the
// background but never the caption. The plain button cell had the same gap.
//
//   AURA_IOBROKER_URL=http://127.0.0.1:9 npx vite --port 5211    (or set AURA_BASE)
//   AURA_BASE=http://localhost:5211 node tools/tests/cell-condition-font.mjs
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5211';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail && !ok ? ` — ${detail}` : ''}`);
};
const eq = (name, got, want) =>
    check(
        name,
        JSON.stringify(got) === JSON.stringify(want),
        `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
    );

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 900, height: 700 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

const LAMP = 'aura-selftest.0.condfont.lamp';
await page.evaluate(() => window.__auraShot.captureWrites(true));

const condition = { id: 'c1', logic: 'AND', clauses: [{ datapoint: '{dp}', operator: 'true', value: '' }] };
const cellStyle = async (cell, value) => {
    const vals = { [LAMP]: value };
    // A fresh mount per value — useDatapoint only follows live changes while connected.
    await page.evaluate((v) => {
        window.__auraShot.mock(v);
        window.__auraShot.mockServerState(v);
    }, vals);
    await page.evaluate(
        (c) =>
            window.__auraShot.showWidgets([
                {
                    id: `w-cf-${Math.random().toString(36).slice(2)}`,
                    type: 'universal',
                    title: 'Bedingung',
                    datapoint: '',
                    layout: 'custom',
                    gridPos: { x: 0, y: 0, w: 8, h: 6 },
                    options: { customGrid: { cols: 1, rows: 1, cells: [c] } },
                },
            ]),
        cell,
    );
    const btn = page.locator('.aura-custom-cell-0 button').first();
    await btn.waitFor({ timeout: 10000 });
    await page.waitForTimeout(300);
    return btn.evaluate((el) => {
        const s = getComputedStyle(el);
        return { weight: s.fontWeight, style: s.fontStyle, size: s.fontSize, color: s.color };
    });
};

const font = { bold: true, italic: true, fontSize: 22, color: '#0000ff' };

// ── 1. switch cell, button mode (the reported case) ──────────────────────────
const sw = {
    type: 'switch',
    dpId: LAMP,
    stateMode: 'boolean',
    controlMode: 'button',
    trueText: 'Ein',
    falseText: 'Aus',
    bold: false,
    conditions: [{ ...condition, ...font, bg: '#ef4444' }],
};
const swOn = await cellStyle(sw, true);
eq('switch button: condition makes the caption bold', swOn.weight, '700');
eq('switch button: condition makes the caption italic', swOn.style, 'italic');
eq('switch button: condition sets the font size', swOn.size, '22px');
eq('switch button: condition sets the caption colour', swOn.color, 'rgb(0, 0, 255)');
const swOff = await cellStyle(sw, false);
check('switch button: without a match the caption stays regular', swOff.weight !== '700', swOff.weight);
eq('switch button: without a match the caption stays upright', swOff.style, 'normal');

// ── 2. plain button cell ─────────────────────────────────────────────────────
const bt = {
    type: 'button',
    dpId: LAMP,
    text: 'Los',
    conditions: [{ ...condition, bold: true, italic: true, fontSize: 20 }],
};
const btOn = await cellStyle(bt, true);
eq('button cell: condition makes the caption bold', btOn.weight, '700');
eq('button cell: condition makes the caption italic', btOn.style, 'italic');
eq('button cell: condition sets the font size', btOn.size, '20px');

eq('no page errors', pageErrors, []);
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
