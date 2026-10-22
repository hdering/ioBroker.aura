// Verifies the optional status datapoint (options.statusDp) of the writing widgets
// input, enum and knob (issue #828): the widget shows the status DP's value, writes
// still go to the main datapoint, and without a status DP nothing changes.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/status-dp-readback.mjs
//
// Uses the screenshot harness (__auraShot): values live in the in-memory cache and
// writes are logged instead of sent. mockServerState() also answers the getState
// read of a remount, see list-switch-ui.mjs.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};
const eq = (name, got, want) => check(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 60000 });

const DP = 'demo.cmd.value';
const STATUS_DP = 'demo.stat.value';
let seq = 0;
const root = () => `.aura-widget-w-sdp${seq}`;

async function show(type, options, values) {
    const widget = {
        id: `w-sdp${++seq}`,
        type,
        title: 'Test',
        datapoint: DP,
        gridPos: { x: 0, y: 0, w: 4, h: 4 },
        options,
    };
    await page.evaluate(
        ([w, vals]) => {
            window.__auraShot.mockServerState(vals);
            window.__auraShot.mock(vals);
            window.__auraShot.showWidgets([w]);
            window.__auraShot.writes(true);
        },
        [widget, values],
    );
    await page.waitForTimeout(400);
}

const rootText = () => page.evaluate((sel) => document.querySelector(sel)?.textContent ?? '', root());

// ── Input: field shows the status value, submit writes the main DP ──
{
    await show('input', { statusDp: STATUS_DP }, { [DP]: null, [STATUS_DP]: 'bestätigt' });
    eq('input: shows the status value', await page.inputValue(`${root()} input`), 'bestätigt');
    await page.fill(`${root()} input`, 'neu');
    await page.press(`${root()} input`, 'Enter');
    await page.waitForTimeout(250);
    const w = await page.evaluate(() => window.__auraShot.writes());
    eq('input: writes to the main DP', w.at(-1)?.id, DP);
    eq('input: writes the typed value', w.at(-1)?.val, 'neu');

    await show('input', {}, { [DP]: 'haupt', [STATUS_DP]: 'bestätigt' });
    eq('input without status DP: shows the main value', await page.inputValue(`${root()} input`), 'haupt');
}

// ── Enum: the current entry comes from the status DP ──
{
    const entries = [
        { value: '0', label: 'Aus' },
        { value: '1', label: 'Eco' },
        { value: '2', label: 'Komfort' },
    ];
    await show('enum', { entries, statusDp: STATUS_DP }, { [DP]: 0, [STATUS_DP]: 2 });
    check('enum: shows the status entry', (await rootText()).includes('Komfort'), await rootText());

    await show('enum', { entries }, { [DP]: 1, [STATUS_DP]: 2 });
    check('enum without status DP: shows the main entry', (await rootText()).includes('Eco'), await rootText());
}

// ── Knob: the dial position comes from the status DP ──
{
    await show('knob', { statusDp: STATUS_DP, unit: '' }, { [DP]: 10, [STATUS_DP]: 73 });
    check('knob: shows the status value', (await rootText()).includes('73'), await rootText());

    await show('knob', { unit: '' }, { [DP]: 10, [STATUS_DP]: 73 });
    const t = await rootText();
    check('knob without status DP: shows the main value', t.includes('10') && !t.includes('73'), t);
}

eq('no page errors', pageErrors.join(' | '), '');

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
