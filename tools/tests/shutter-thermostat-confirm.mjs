// Security prompt for shutter and thermostat (#977) — the confirmAction option the
// switch and enum widgets already carry, extended to widgets with several writes.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/shutter-thermostat-confirm.mjs
//
// Pinned: without the option every control writes at once (unchanged); with it,
// nothing is written until "Ja", the overlay names the target, "Abbruch" drops the
// parked write for good, Stop never asks, and the regulators send on release even
// when sendOnRelease is switched off (one question per gesture, not per pixel).
//
// captureWrites() keeps the clicks off the socket; the datapoints live under a root
// that exists nowhere.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const eq = (name, got, want) => check(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 900, height: 700 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

const POS = 'aura-selftest.0.confirm977.level';
const STOP = 'aura-selftest.0.confirm977.stop';
const SET = 'aura-selftest.0.confirm977.setpoint';
const ACT = 'aura-selftest.0.confirm977.actual';
const VALUES = { [POS]: 50, [STOP]: false, [SET]: 20, [ACT]: 19.5 };

await page.evaluate((values) => {
    window.__auraShot.captureWrites(true);
    window.__auraShot.mock(values);
    window.__auraShot.mockServerState(values);
}, VALUES);

const writes = (reset = false) => page.evaluate((r) => window.__auraShot.writes(r), reset);

async function show(widget, readySel) {
    await page.evaluate((values) => window.__auraShot.mockServerState(values), VALUES);
    await page.evaluate((w) => window.__auraShot.showWidgets([w]), widget);
    await page.waitForSelector(readySel, { timeout: 10000 });
    await page.evaluate((values) => window.__auraShot.mock(values), VALUES);
    await page.waitForTimeout(500);
    await writes(true);
}
const shutter = (layout, options) =>
    show(
        {
            id: `sh-${layout}-${Math.random().toString(36).slice(2, 7)}`,
            type: 'shutter',
            title: 'Rollladen',
            datapoint: POS,
            layout,
            gridPos: { x: 0, y: 0, w: 8, h: 8 },
            options: { stopDp: STOP, ...options },
        },
        'button:has(svg.lucide-chevron-up)',
    );
// A fresh setpoint DP per mount: the read-back hook keeps the last written value
// across remounts, which would shift every following "+" by the previous step.
let setDp = SET;
const thermostat = async (layout, options) => {
    setDp = `${SET}${Math.random().toString(36).slice(2, 7)}`;
    VALUES[setDp] = 20;
    await show(
        {
            id: `th-${layout}-${Math.random().toString(36).slice(2, 7)}`,
            type: 'thermostat',
            title: 'Heizung',
            datapoint: setDp,
            layout,
            gridPos: { x: 0, y: 0, w: 8, h: 8 },
            options: { actualDatapoint: ACT, ...options },
        },
        '.aura-widget-row',
    );
};

// The overlay is the only element carrying this class pair (see ConfirmOverlay).
const overlayText = () => page.evaluate(() => document.querySelector('.rounded-widget.z-10')?.textContent ?? '');
const answer = async (label) => {
    await page.click(`.rounded-widget.z-10 button:has-text("${label}")`);
    await page.waitForTimeout(250);
};
const click = async (sel) => {
    await page.click(sel);
    await page.waitForTimeout(250);
};
/** Drags the range input to `v` and releases it (React listens to `input`). */
const slide = async (v) => {
    await page.$eval(
        'input[type=range]',
        (el, val) => {
            const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
            set.call(el, String(val));
            el.dispatchEvent(new Event('input', { bubbles: true }));
        },
        v,
    );
    await page.waitForTimeout(100);
    await page.$eval('input[type=range]', (el) => el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })));
    await page.waitForTimeout(300);
};

const UP = 'button:has(svg.lucide-chevron-up)';
const DOWN = 'button:has(svg.lucide-chevron-down)';
const STOP_BTN = '.aura-widget-action button:has(svg.lucide-square)';

// ── Shutter ──────────────────────────────────────────────────────────────────
await shutter('default', {});
await click(DOWN);
let log = await writes();
eq('shutter, option off: close writes at once', log.at(-1)?.val, 0);

await shutter('default', { confirmAction: true });
await click(DOWN);
eq('shutter: close asks first, nothing written', (await writes()).length, 0);
let txt = await overlayText();
check('shutter: overlay names the action', txt.includes('Schließen') && txt.includes('Ja'), txt);
await answer('Ja');
log = await writes();
eq('shutter: confirming writes once', log.length, 1);
eq('shutter: and writes 0 to the level DP', `${log.at(-1)?.id}=${log.at(-1)?.val}`, `${POS}=0`);

await writes(true);
await click(UP);
await answer('Abbruch');
eq('shutter: cancel writes nothing', (await writes()).length, 0);
check('shutter: overlay gone after cancel', (await overlayText()) === '');

await click(STOP_BTN);
log = await writes();
eq('shutter: stop never asks', `${log.at(-1)?.id}=${log.at(-1)?.val}`, `${STOP}=true`);
check('shutter: no overlay after stop', (await overlayText()) === '');

await writes(true);
await shutter('default', { confirmAction: true, sendOnRelease: false });
await slide(40);
eq('shutter: slider waits for the release even with sendOnRelease off', (await writes()).length, 0);
txt = await overlayText();
check('shutter: slider overlay names the target', txt.includes('40% geöffnet'), txt);
await answer('Ja');
log = await writes();
eq('shutter: confirming the slider writes 40 once', `${log.length}:${log.at(-1)?.val}`, '1:40');

await shutter('default', { confirmAction: true, positionPresets: [{ pos: 30, label: 'Schatten' }] });
await click('.aura-shutter-presets button');
txt = await overlayText();
check('shutter: preset asks with its label', txt.includes('Schatten'), txt);
await answer('Ja');
eq('shutter: confirmed preset writes 30', (await writes()).at(-1)?.val, 30);

for (const layout of ['compact', 'minimal']) {
    await shutter(layout, { confirmAction: true });
    await click(DOWN);
    check(`shutter ${layout}: overlay appears`, (await overlayText()).includes('Ja'));
    await answer('Ja');
    eq(`shutter ${layout}: confirm writes 0`, (await writes()).at(-1)?.val, 0);
}

// ── Thermostat ───────────────────────────────────────────────────────────────
await thermostat('default', {});
await click('.aura-widget-action button:has-text("+")');
eq('thermostat, option off: + writes at once', (await writes()).at(-1)?.val, 20.5);

await thermostat('default', { confirmAction: true });
await click('.aura-widget-action button:has-text("+")');
eq('thermostat: + asks first, nothing written', (await writes()).length, 0);
txt = await overlayText();
check('thermostat: overlay names the setpoint', /20[.,]50? °C/.test(txt), txt);
await answer('Ja');
log = await writes();
eq('thermostat: confirming writes 20.5 once', `${log.length}:${log.at(-1)?.id}=${log.at(-1)?.val}`, `1:${setDp}=20.5`);

await writes(true);
await click('.aura-widget-action button:has-text("−")');
await answer('Abbruch');
eq('thermostat: cancel writes nothing', (await writes()).length, 0);

await thermostat('default', { confirmAction: true, confirmText: 'Heizung wirklich verstellen?' });
await click('.aura-widget-action button:has-text("+")');
txt = await overlayText();
check('thermostat: custom prompt shown', txt.includes('Heizung wirklich verstellen?'), txt);
await answer('Abbruch');

for (const layout of ['compact', 'minimal']) {
    await thermostat(layout, { confirmAction: true });
    await click('button:has-text("+")');
    check(`thermostat ${layout}: overlay appears`, (await overlayText()).includes('Ja'));
    await answer('Ja');
    eq(`thermostat ${layout}: confirm writes 20.5`, (await writes()).at(-1)?.val, 20.5);
}

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\nshutter-thermostat-confirm: ${results.length - failed.length}/${results.length} passed\n`);
process.exit(failed.length ? 1 : 0);
