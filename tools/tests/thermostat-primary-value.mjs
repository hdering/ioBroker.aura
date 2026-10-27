// Thermostat "Große Anzeige" (primaryValue) — issue #864.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/thermostat-primary-value.mjs
//
// Uses the screenshot harness (__auraShot), so datapoint values live in the
// in-memory cache only. Checked: the dial and the circle-menu button draw the
// setpoint large by default and the reading large with primaryValue 'actual';
// without a reading the setpoint stays large; dragging the dial brings the
// setpoint back to the large line while the pointer is down.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const SET = 'demo.thermo864.set';
const ACT = 'demo.thermo864.act';
let seq = 0;
let wid = '';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });

async function show(layout, options = {}, values = { [SET]: 22, [ACT]: 20.5 }) {
    wid = `w-thermo-864-${++seq}`;
    const widget = {
        id: wid,
        type: 'thermostat',
        title: 'Bad',
        datapoint: SET,
        layout,
        gridPos: { x: 0, y: 0, w: 5, h: 14 },
        options: { actualDatapoint: ACT, showPresets: false, decimals: 1, ...options },
    };
    await page.evaluate(
        ([w, vals]) => {
            window.__auraShot.mock(vals);
            window.__auraShot.mockServerState(vals);
            window.__auraShot.showWidgets([w]);
        },
        [widget, values],
    );
    if (layout === 'dial') await page.waitForSelector(`[data-aura-thermo-dial="${wid}"]`, { timeout: 15000 });
    else await page.waitForSelector('[data-aura-circle-line]', { timeout: 15000 });
    await page.waitForTimeout(300);
}

/** Dial line: text and font size, keyed 'value' (setpoint) / 'actual'. */
const dialLine = (key) =>
    page.evaluate((k) => {
        const el = document.querySelector(`[data-aura-thermo-line="${k}"]`);
        return el ? { text: el.textContent, fs: Number(el.getAttribute('font-size')) } : null;
    }, key);

const circleLine = (key) =>
    page.evaluate((k) => {
        const el = document.querySelector(`[data-aura-circle-line="${k}"]`);
        return el ? { text: el.textContent, fs: parseFloat(getComputedStyle(el).fontSize) } : null;
    }, key);

// ── 1. Dial ─────────────────────────────────────────────────────────────────
{
    await show('dial');
    let v = await dialLine('value');
    let a = await dialLine('actual');
    check('dial default: setpoint is the large line', v && a && v.fs > a.fs, `${v?.fs} / ${a?.fs}`);

    await show('dial', { primaryValue: 'actual' });
    v = await dialLine('value');
    a = await dialLine('actual');
    check('dial actual: reading is the large line', v && a && a.fs > v.fs, `${a?.fs} / ${v?.fs}`);
    check('…shown without label', /^20[.,]5 °C$/.test(a?.text ?? ''), a?.text);
    check('…setpoint small with label', /^Soll 22[.,]0 °C$/.test(v?.text ?? ''), v?.text);

    await show('dial', { primaryValue: 'actual', showActualTemp: false });
    v = await dialLine('value');
    check('dial actual without reading: setpoint stays large', v && v.fs > 20, `${v?.fs}`);
    check('…no reading line', (await dialLine('actual')) === null);

    // Drag: the setpoint takes the large line while the pointer is down.
    await show('dial', { primaryValue: 'actual', showControls: false, minTemp: 10, maxTemp: 30 });
    const box = await page.locator(`[data-aura-thermo-dial="${wid}"]`).boundingBox();
    const side = Math.min(box.width, box.height);
    const cx = box.x + box.width / 2;
    const topY = box.y + box.height / 2 - (78 / 100) * (side / 2);
    await page.evaluate(() => window.__auraShot.writes(true));
    await page.mouse.move(cx, topY + 4);
    await page.mouse.down();
    await page.mouse.move(cx, topY, { steps: 8 });
    await page.waitForTimeout(150);
    v = await dialLine('value');
    check('dragging: setpoint is the large line', v && v.fs > 20 && !/^Soll/.test(v.text), `${v?.text} ${v?.fs}`);
    await page.mouse.up();
    await page.waitForTimeout(400);
    a = await dialLine('actual');
    check('after release: reading is large again', a && a.fs > 20, `${a?.text} ${a?.fs}`);
}

// ── 2. Circle menu button ───────────────────────────────────────────────────
{
    await show('circle');
    let big = await circleLine('big');
    let small = await circleLine('small');
    check('circle default: setpoint large', /^22[.,]0°$/.test(big?.text ?? ''), big?.text);
    check('…reading small', /^Ist 20[.,]5°$/.test(small?.text ?? ''), small?.text);
    check('…large really larger', big && small && big.fs > small.fs, `${big?.fs} / ${small?.fs}`);

    await show('circle', { primaryValue: 'actual' });
    big = await circleLine('big');
    small = await circleLine('small');
    check('circle actual: reading large', /^20[.,]5°$/.test(big?.text ?? ''), big?.text);
    check('…setpoint small with label', /^Soll 22[.,]0°$/.test(small?.text ?? ''), small?.text);

    await show('circle', { primaryValue: 'actual' }, { [SET]: 22, [ACT]: null });
    big = await circleLine('big');
    check('circle actual without reading: setpoint large', /^22[.,]0°$/.test(big?.text ?? ''), big?.text);
}

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
