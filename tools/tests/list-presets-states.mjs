// Verifies that the "Tasten" and "Wertzuordnung" displays of both list widgets
// offer what their standalone counterparts do:
//
//   Tasten        ↔ Auswahl widget — icon / image / colour per button, entries from
//                   a JSON datapoint with configurable field names, dropdown mode
//   Wertzuordnung ↔ Statusbild widget — image per state and a comparison operator,
//                   so a mapping can cover a range instead of one exact value
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/list-presets-states.mjs
//
// Both lists render the shared controls from entryControls, so every case runs
// against the static and the dynamic list. Datapoint values are injected via the
// screenshot harness — no real datapoint is touched.
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

const DP = 'demo.ps.MODE';
const JSON_DP = 'demo.ps.LIST';
const ROOT = '.aura-widget-w-ps';
const TYPES = ['list', 'autolist'];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

async function show(type, entryPatch, values) {
    const widget = {
        id: 'w-ps',
        type,
        title: 'Tasten',
        datapoint: '',
        gridPos: { x: 0, y: 0, w: 14, h: 8 },
        options: {
            showTitle: false,
            hideFilterButton: true,
            syncIntervalMin: 999,
            entries: [{ id: DP, label: 'Zeile', ...entryPatch }],
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

// ── 1. Tasten: icon, image and colour per button ─────────────────────────────
const RICH_PRESETS = [
    { value: 0, label: 'Aus', color: '#ff0000' },
    { value: 1, label: 'Eco', render: 'icon', icon: 'Leaf', size: 18 },
    { value: 2, label: 'Bild', render: 'image', image: 'https://example.invalid/x.png', size: 20 },
];
for (const type of TYPES) {
    await show(type, { displayType: 'buttons', presets: RICH_PRESETS }, { [DP]: 0 });
    // The icon comes from Iconify and arrives a moment after the first paint.
    await page.locator(`${ROOT} .aura-preset-button svg`).first().waitFor({ timeout: 10000 });
    const dom = await page.evaluate((sel) => {
        const btns = [...document.querySelectorAll(`${sel} .aura-preset-button`)];
        return {
            count: btns.length,
            firstColor: btns[0] ? getComputedStyle(btns[0]).color : null,
            svgs: btns[1]?.querySelectorAll('svg').length ?? 0,
            iconSize: btns[1]?.querySelector('svg')?.getAttribute('width') ?? null,
            imgs: btns[2]?.querySelectorAll('img').length ?? 0,
            imgSize: btns[2]?.querySelector('img')?.style.width ?? null,
        };
    }, ROOT);
    eq(`${type}: every preset draws its own button`, dom.count, 3);
    eq(`${type}: the active button takes the preset colour`, dom.firstColor, 'rgb(255, 0, 0)');
    eq(`${type}: an icon preset draws its icon at its size`, [dom.svgs, dom.iconSize], [1, '18']);
    eq(`${type}: an image preset draws its image at its size`, [dom.imgs, dom.imgSize], [1, '20px']);

    await page.locator(`${ROOT} .aura-preset-button`).nth(1).click();
    await page.waitForTimeout(150);
    eq(`${type}: clicking one writes its value`, (await writes()).at(-1), { id: DP, val: 1 });
}

// ── 2. Tasten: dropdown mode ─────────────────────────────────────────────────
for (const type of TYPES) {
    await show(type, { displayType: 'buttons', presets: RICH_PRESETS, presetSelect: true }, { [DP]: 0 });
    eq(`${type}: the dropdown replaces the buttons`, await page.locator(`${ROOT} .aura-preset-button`).count(), 0);
    check(`${type}: and shows the current entry`, (await text()).includes('Aus'), await text());
}

// ── 3. Tasten: entries from a JSON datapoint ─────────────────────────────────
const JSON_VALUE = JSON.stringify([
    { id: 10, name: 'Zehn' },
    { id: 20, name: 'Zwanzig' },
]);
for (const type of TYPES) {
    await show(
        type,
        {
            displayType: 'buttons',
            presetsSource: 'json',
            presetsDp: JSON_DP,
            presetsValueKey: 'id',
            presetsLabelKey: 'name',
        },
        { [DP]: 10, [JSON_DP]: JSON_VALUE },
    );
    const labels = await page.evaluate(
        (sel) => [...document.querySelectorAll(`${sel} .aura-preset-button`)].map((b) => b.textContent.trim()),
        ROOT,
    );
    eq(`${type}: the buttons come from the JSON datapoint`, labels, ['Zehn', 'Zwanzig']);
    await page.locator(`${ROOT} .aura-preset-button`).nth(1).click();
    await page.waitForTimeout(150);
    eq(`${type}: and write the value from its own field`, (await writes()).at(-1), { id: DP, val: 20 });
}

// ── 4. Wertzuordnung: a comparison covers a range ────────────────────────────
const RANGE_STATES = [
    { value: 30, label: 'Heiss', op: '>=' },
    { value: 20, label: 'Warm', op: '>=' },
    { value: 0, label: 'Kalt', op: '>=' },
];
for (const type of TYPES) {
    await show(type, { displayType: 'states', states: RANGE_STATES }, { [DP]: 24 });
    check(`${type}: the first matching range wins`, (await text()).includes('Warm'), await text());
    await show(type, { displayType: 'states', states: RANGE_STATES }, { [DP]: 35 });
    check(`${type}: a higher value hits the earlier range`, (await text()).includes('Heiss'), await text());
    // Without an operator the mapping stays exact — the behaviour every existing
    // configuration relies on.
    await show(type, { displayType: 'states', states: [{ value: 30, label: 'Genau' }] }, { [DP]: 35 });
    check(`${type}: without an operator it is still equality`, !(await text()).includes('Genau'), await text());
}

// ── 5. Wertzuordnung: image per state ────────────────────────────────────────
for (const type of TYPES) {
    await show(
        type,
        {
            displayType: 'states',
            states: [{ value: 1, label: 'An', render: 'image', image: 'https://example.invalid/on.png', size: 24 }],
        },
        { [DP]: 1 },
    );
    const img = await page.evaluate((sel) => {
        const el = document.querySelector(`${sel} .aura-state-display img`);
        return el ? { alt: el.alt, size: el.style.width } : null;
    }, ROOT);
    eq(`${type}: a state can draw an image`, img, { alt: 'An', size: '24px' });
}

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) process.exit(1);
