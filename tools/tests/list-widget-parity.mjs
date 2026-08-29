// Verifies the settings a list row shares with its standalone widget, for the
// displays that were behind: the input field's number range and multi-line mode
// (Eingabefeld widget), the contact's lock datapoint (Fenster-/Türkontakt widget)
// and the dynamic list's per-row number format and colour scale (Wert widget) —
// the static list had the last one all along.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/list-widget-parity.mjs
//
// Every case runs against the static AND the dynamic list: both render the shared
// controls from entryControls, so a gap in one is a gap in both.
//
// Datapoint values are injected via the screenshot harness (__auraShot.mock) and
// writes are logged instead of sent — no real datapoint is touched.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const eq = (name, got, want) =>
    check(
        name,
        JSON.stringify(got) === JSON.stringify(want),
        `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
    );

const DP = 'demo.parity.VAL';
const LOCK_DP = 'demo.parity.LOCK';
const ROOT = '.aura-widget-w-p';
const TYPES = ['list', 'autolist'];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

/** One list widget with a single entry; arms the write log. */
async function show(type, entryPatch, values, { layout, options } = {}) {
    const widget = {
        id: 'w-p',
        type,
        title: 'Parität',
        datapoint: '',
        layout,
        gridPos: { x: 0, y: 0, w: 12, h: 8 },
        options: {
            showTitle: false,
            hideFilterButton: true,
            syncIntervalMin: 999,
            entries: [{ id: DP, label: 'Zeile', ...entryPatch }],
            ...options,
        },
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

const text = () =>
    page.evaluate((sel) => (document.querySelector(sel)?.textContent ?? '').replace(/\s+/g, ' ').trim(), ROOT);
const writes = () => page.evaluate(() => window.__auraShot.writes());
const color = (sel) =>
    page.evaluate((s) => {
        const el = document.querySelector(s);
        return el ? getComputedStyle(el).color : null;
    }, sel);

// ── 1. Eingabefeld: number range and step ────────────────────────────────────
for (const type of TYPES) {
    await show(
        type,
        { displayType: 'input', inputMode: 'number', inputMin: 5, inputMax: 30, inputStep: 0.5 },
        {
            [DP]: 20,
        },
    );
    const a = await page.evaluate((sel) => {
        const el = document.querySelector(`${sel} input`);
        return el ? { type: el.type, min: el.min, max: el.max, step: el.step } : null;
    }, ROOT);
    eq(`${type}: the number field carries min/max/step`, a, { type: 'number', min: '5', max: '30', step: '0.5' });

    // Typing past the range still writes inside it — the widget clamps the same way.
    await page.locator(`${ROOT} input`).fill('99');
    await page.locator(`${ROOT} input`).press('Enter');
    await page.waitForTimeout(200);
    eq(`${type}: a value above the maximum is clamped`, (await writes()).at(-1), { id: DP, val: 30 });
}

// ── 2. Eingabefeld: multi-line ───────────────────────────────────────────────
for (const type of TYPES) {
    await show(type, { displayType: 'input', inputMultiline: true, inputHeight: 70 }, { [DP]: 'Zeile 1' });
    const ta = await page.evaluate((sel) => {
        const el = document.querySelector(`${sel} textarea`);
        return el ? { height: getComputedStyle(el).height, value: el.value } : null;
    }, ROOT);
    eq(`${type}: multi-line renders a text area of the configured height`, ta, {
        height: '70px',
        value: 'Zeile 1',
    });
    // Enter inserts a newline instead of sending; Ctrl+Enter sends.
    await page.locator(`${ROOT} textarea`).fill('Zeile 1\nZeile 2');
    await page.locator(`${ROOT} textarea`).press('Enter');
    await page.waitForTimeout(150);
    eq(`${type}: Enter does not send in a text area`, await writes(), []);
    await page.locator(`${ROOT} textarea`).press('Control+Enter');
    await page.waitForTimeout(200);
    eq(`${type}: Ctrl+Enter sends the whole text`, (await writes()).at(-1)?.val, 'Zeile 1\nZeile 2\n');
}

// ── 3. Kontakt: the lock datapoint ───────────────────────────────────────────
for (const type of TYPES) {
    // Without one nothing changes.
    await show(type, { displayType: 'contact' }, { [DP]: 0 });
    eq(`${type}: no lock datapoint, no padlock`, await page.locator(`${ROOT} .aura-contact-lock`).count(), 0);

    await show(type, { displayType: 'contact', contactLockDp: LOCK_DP }, { [DP]: 0, [LOCK_DP]: true });
    eq(`${type}: the lock datapoint adds the padlock`, await page.locator(`${ROOT} .aura-contact-lock`).count(), 1);
    const locked = await color(`${ROOT} .aura-contact-lock svg`);

    await show(type, { displayType: 'contact', contactLockDp: LOCK_DP }, { [DP]: 0, [LOCK_DP]: false });
    const open = await color(`${ROOT} .aura-contact-lock svg`);
    check(`${type}: and it tells the two states apart`, !!locked && !!open && locked !== open, `${locked} / ${open}`);

    // Own "locked" vocabulary, like the widget's lockLockedValues.
    await show(
        type,
        { displayType: 'contact', contactLockDp: LOCK_DP, contactLockValues: 'LOCKED' },
        { [DP]: 0, [LOCK_DP]: 'LOCKED' },
    );
    eq(`${type}: a custom locked value counts as locked`, await color(`${ROOT} .aura-contact-lock svg`), locked);

    // The badge layout draws no control but must still show the padlock.
    await show(
        type,
        { displayType: 'contact', contactLockDp: LOCK_DP },
        { [DP]: 0, [LOCK_DP]: true },
        {
            layout: 'minimal',
        },
    );
    eq(
        `${type}/minimal: the badge carries the padlock too`,
        await page.locator(`${ROOT} .aura-contact-lock`).count(),
        1,
    );
}

// ── 4. Dynamic list: number format and colour scale per row ──────────────────
// The static list has had both per entry; the dynamic one could only do list-wide.
for (const type of TYPES) {
    await show(type, { unit: 'W', decimals: 3 }, { [DP]: 12.3456 }, { options: { decimals: 0 } });
    check(`${type}: the row's own decimals beat the list's`, (await text()).includes('12.346'), await text());

    await show(type, { unit: 'W', numberFormat: 'de' }, { [DP]: 1234.5 }, { options: { decimals: 1 } });
    check(`${type}: the row's own separator beats the list's`, (await text()).includes('1.234,5'), await text());

    await show(
        type,
        { unit: 'W', colorThresholds: [[50, '#ff0000']] },
        { [DP]: 10 },
        { options: { colorThresholds: [[50, '#00ff00']] } },
    );
    const c = await color(`${ROOT} .aura-list-row span.tabular-nums, ${ROOT} span.tabular-nums`);
    eq(`${type}: the row's own colour scale beats the list's`, c, 'rgb(255, 0, 0)');
}

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) process.exit(1);
