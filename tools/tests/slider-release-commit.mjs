// A send-on-release slider (dimmer, shutter) keeps the dragged value locally until
// the release. When the release never reached the slider — touch cancelled by a
// scroll, keyboard, pointer let go elsewhere — that local value stayed on screen and
// covered every later status update (#935). Checks that such drags still commit and
// the widget falls back to the live value. (Offline the harness pushes no live
// updates to mounted widgets, so "back on the live value" is the observable sign:
// a stuck drag keeps showing the dragged one.)
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/slider-release-commit.mjs
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
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 90000 });

const DP = 'demo.cmd.value';
const STATUS_DP = 'demo.stat.value';
let seq = 0;
const root = () => `.aura-widget-w-rc${seq}`;

async function show(type, options, values) {
    const widget = {
        id: `w-rc${++seq}`,
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

const range = () => page.locator(`${root()} input[type=range]`).first();
const lastWrite = () => page.evaluate(() => window.__auraShot.writes().at(-1) ?? null);

// Changes the range like a drag and then ends the gesture with `end` dispatched on
// the window only — never the mouseup/touchend the slider listens for itself.
async function dragThenEnd(value, end) {
    await range().evaluate((el, v) => {
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        set.call(el, String(v));
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);
    await page.waitForTimeout(100);
    if (end) await page.evaluate((e) => window.dispatchEvent(new Event(e)), end);
    await page.waitForTimeout(150);
}

for (const end of ['touchcancel', 'pointerup', 'blur']) {
    await show('dimmer', { statusDp: STATUS_DP }, { [DP]: 10, [STATUS_DP]: 10 });
    await dragThenEnd(40, end);
    const w = await lastWrite();
    eq(`dimmer (${end}): drag is written`, w && `${w.id}=${w.val}`, `${DP}=40`);
    eq(`dimmer (${end}): back on the status value`, await range().inputValue(), '10');
}

// Keyboard: arrow keys change the value, keyup commits.
{
    await show('dimmer', { statusDp: STATUS_DP }, { [DP]: 10, [STATUS_DP]: 10 });
    await range().focus();
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(150);
    const w = await lastWrite();
    eq('dimmer (keyboard): step is written', w && `${w.id}=${w.val}`, `${DP}=11`);
    eq('dimmer (keyboard): back on the status value', await range().inputValue(), '10');
}

// Shutter position: same rule.
{
    await show('shutter', {}, { [DP]: 20 });
    await dragThenEnd(70, 'touchcancel');
    const w = await lastWrite();
    eq('shutter (touchcancel): drag is written', w && `${w.id}=${w.val}`, `${DP}=70`);
    eq('shutter (touchcancel): back on the live value', await range().inputValue(), '20');
}

eq('no page errors', pageErrors.join(' | '), '');

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
