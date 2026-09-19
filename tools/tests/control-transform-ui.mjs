// The two-way conversion in a running frontend (#682): a datapoint in one unit, driven in another.
//
//   AURA_IOBROKER_URL=http://127.0.0.1:9 npx vite --port 5212    (or set AURA_BASE)
//   AURA_BASE=http://localhost:5212 node tools/tests/control-transform-ui.mjs
//
// The pure round trip is covered by tools/tests/control-value-transform.mjs. What only the real
// widget can show is that the conversion sits on BOTH ends of the same control: the scale, the
// printed value and the input element work in the converted unit, while every write that leaves
// the widget is back in the datapoint's own. Each control is checked in both directions.
//
// captureWrites() keeps the clicks off the socket — the datapoints below live under a root that
// exists nowhere, but the dev server still proxies a real ioBroker.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5212';

let failed = 0;
const check = (name, ok, detail = '') => {
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
    if (!ok) {
        failed++;
    }
};
const eq = (name, got, want) =>
    check(name, Object.is(got, want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const SEC = 'aura-selftest.0.transform.nachlauf_sekunden';
const CELSIUS = 'aura-selftest.0.transform.soll_celsius';
const RAW255 = 'aura-selftest.0.transform.helligkeit_255';
const MS = 'aura-selftest.0.transform.dauer_ms';

const VALUES = { [SEC]: 300, [CELSIUS]: 21, [RAW255]: 255, [MS]: 4500 };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1000, height: 760 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
await page.evaluate((values) => {
    window.__auraShot.captureWrites(true);
    window.__auraShot.mock(values);
    window.__auraShot.mockServerState(values);
}, VALUES);

const writes = (reset = false) => page.evaluate((r) => window.__auraShot.writes(r), reset);

/**
 * Mounts the given widgets alone and waits for `selector`. Offline there are no live updates, so
 * a changed datapoint value is shown by remounting with a fresh widget id.
 *
 * @param widgets
 * @param selector
 * @param values
 */
async function show(widgets, selector, values = VALUES) {
    await page.evaluate((v) => {
        window.__auraShot.mock(v);
        window.__auraShot.mockServerState(v);
    }, values);
    await page.evaluate((ws) => window.__auraShot.showWidgets(ws), widgets);
    await page.waitForSelector(selector, { timeout: 10000 });
    await page.waitForTimeout(350);
    await writes(true);
}

// `writes(true)` ARMS and clears the log — it never returns anything. Reading is writes(),
// clearing is a separate call, or every assertion below sees an empty list.
const lastWrite = async () => {
    const list = await writes();
    await writes(true);
    return list.length ? list[list.length - 1] : null;
};

/**
 * Moves a native range input the way the browser does, so React's onChange fires.
 *
 * @param value
 */
const setRange = (value) =>
    page.locator('input[type=range]').evaluate((el, v) => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);

// ── 1. Schieberegler: seconds datapoint driven in minutes ────────────────────────────────────
const SLIDER = {
    id: 'w-slider-min',
    type: 'slider',
    title: 'Nachlauf',
    datapoint: SEC,
    layout: 'default',
    gridPos: { x: 0, y: 0, w: 8, h: 4 },
    options: { valueTransform: 's-min', valueFactor: 1 / 60, min: 0, max: 60, step: 1, unit: ' min' },
};
await show([SLIDER], 'input[type=range]');
eq('slider: 300 s stands at 5 on a minute scale', await page.inputValue('input[type=range]'), '5');
eq('slider: the label reads minutes', (await page.locator('.aura-widget-value').first().innerText()).trim(), '5 min');
// The range control reports in minutes; the widget has to write seconds.
await setRange('10');
await page.waitForTimeout(250);
{
    const w = await lastWrite();
    eq('slider: dragging to 10 min writes 600 s', w?.val, 600);
    eq('slider: and writes it to the right datapoint', w?.id, SEC);
}

// Without a conversion the same slider writes what it shows.
await show(
    [{ ...SLIDER, id: 'w-slider-plain', options: { min: 0, max: 600, step: 1, unit: ' s' } }],
    'input[type=range]',
);
eq('slider: without a conversion the raw value stands', await page.inputValue('input[type=range]'), '300');
await setRange('420');
await page.waitForTimeout(250);
eq('slider: and writes it unchanged', (await lastWrite())?.val, 420);

// ── 2. Drehregler: °C datapoint driven in °F ─────────────────────────────────────────────────
await show(
    [
        {
            id: 'w-knob-f',
            type: 'knob',
            title: 'Soll',
            datapoint: CELSIUS,
            layout: 'default',
            gridPos: { x: 0, y: 0, w: 6, h: 6 },
            options: {
                valueTransform: 'c-f',
                valueFactor: 1.8,
                valueOffset: 32,
                minValue: 50,
                maxValue: 86,
                step: 1,
                unit: '°F',
                decimals: 0,
            },
        },
    ],
    'svg',
);
{
    // The dial draws its value into an <svg><text>, which has no innerText — read the card.
    const card = (await page.locator('.aura-widget-row, [data-widget-id]').first().innerText()).replace(/\s+/g, ' ');
    check('knob: 21 °C reads as 70 °F', card.includes('70°F'), card);
}

// ── 3. Dimmer: a 0…255 datapoint driven in percent ───────────────────────────────────────────
const DIMMER = {
    id: 'w-dimmer-255',
    type: 'dimmer',
    title: 'Deckenlicht',
    datapoint: RAW255,
    layout: 'default',
    gridPos: { x: 0, y: 0, w: 8, h: 4 },
    options: { valueTransform: 'custom', valueFactor: 100 / 255, sendOnRelease: false },
};
await show([DIMMER], 'input[type=range]');
eq('dimmer: 255 reads as 100 %', await page.inputValue('input[type=range]'), '100');
// The on/off button writes 0 / 100 % — through the conversion, so the datapoint sees 0 / 255.
// It is the only <button> in the widget; the track next to it is an input / a div.
await page.locator('button.aura-widget-action').first().click();
await page.waitForTimeout(250);
eq('dimmer: switching a lit lamp off writes 0', (await lastWrite())?.val, 0);

await show([{ ...DIMMER, id: 'w-dimmer-255-off' }], 'input[type=range]', { ...VALUES, [RAW255]: 0 });
eq('dimmer: 0 reads as 0 %', await page.inputValue('input[type=range]'), '0');
await page.locator('button.aura-widget-action').first().click();
await page.waitForTimeout(250);
eq('dimmer: switching it on writes 255, not 100', (await lastWrite())?.val, 255);

// ── 4. Eingabefeld: a milliseconds datapoint typed in seconds ────────────────────────────────
await show(
    [
        {
            id: 'w-input-s',
            type: 'input',
            title: 'Dauer',
            datapoint: MS,
            layout: 'default',
            gridPos: { x: 0, y: 0, w: 8, h: 3 },
            options: {
                inputMode: 'number',
                submitMode: 'submit',
                valueTransform: 'ms-s',
                valueFactor: 0.001,
                min: 0,
                max: 60,
                step: 0.5,
                unit: 's',
            },
        },
    ],
    'input[type=number]',
);
eq('input: 4500 ms stands in the field as 4.5 s', await page.inputValue('input[type=number]'), '4.5');
await page.fill('input[type=number]', '12');
await page.press('input[type=number]', 'Enter');
await page.waitForTimeout(250);
eq('input: entering 12 s writes 12000 ms', (await lastWrite())?.val, 12000);

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
