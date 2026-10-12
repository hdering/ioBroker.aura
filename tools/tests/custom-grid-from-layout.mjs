// Custom grid built from a widget's fixed layout (#768).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/custom-grid-from-layout.mjs [--out <dir>] [--only <type>]
//
// For every preset (widget type × layout) the widget is drawn twice side by side:
// in the original layout and as "custom" with the grid the preset builds. With
// --out each pair is saved as one image for eyeballing; the checks compare where
// the visible pieces (title, value, icon, controls) end up in both renderings.
// Then the editor flow: switching to Custom asks how to start, every answer is
// tried, and the "Aus Layout übernehmen" menu rebuilds the grid.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const argv = process.argv.slice(2);
const OUT = argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : null;
const ONLY = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null;
const THEME = argv.includes('--theme') ? argv[argv.indexOf('--theme') + 1] : null;
if (OUT) fs.mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const DP = 'demo.768.main';
const DP_ACTUAL = 'demo.768.actual';
const DP_BATT = 'demo.768.batt';

// [type, layouts, options, values, w, h per layout]
const CASES = [
    {
        type: 'value',
        layouts: { default: [8, 4], card: [8, 4], compact: [8, 2], minimal: [8, 4] },
        options: { unit: '°C', decimals: 1 },
        val: 21.47,
        title: 'Wohnzimmer',
    },
    {
        type: 'value',
        variant: 'thresholds+badges',
        layouts: { default: [8, 4], card: [8, 4], compact: [8, 2], minimal: [8, 4] },
        options: {
            unit: 'W',
            decimals: 0,
            icon: 'zap',
            colorThresholds: [[1000, '#ef4444']],
            batteryDp: DP_BATT,
            batteryMode: 'percent',
        },
        val: 1520,
        title: 'Leistung Waschmaschine',
    },
    {
        type: 'binarysensor',
        layouts: { default: [8, 4], card: [8, 4], compact: [8, 2], minimal: [8, 4] },
        options: { sensorType: 'motion' },
        val: true,
        title: 'Bewegung Flur',
    },
    {
        type: 'windowcontact',
        layouts: { default: [8, 4], card: [8, 4], compact: [8, 2], minimal: [8, 4] },
        options: {},
        val: 2,
        title: 'Fenster Bad',
    },
    {
        type: 'stateimage',
        layouts: { default: [8, 5], card: [8, 6], compact: [8, 3], minimal: [8, 6] },
        options: {},
        val: true,
        title: 'Garage',
    },
    {
        type: 'switch',
        layouts: { default: [8, 4], card: [8, 4], compact: [8, 2] },
        options: {},
        val: true,
        title: 'Stehlampe',
    },
    {
        type: 'switch',
        variant: 'off',
        layouts: { default: [8, 4], card: [8, 4], compact: [8, 2] },
        options: {},
        val: false,
        title: 'Stehlampe',
    },
    {
        type: 'thermostat',
        layouts: { default: [10, 6], compact: [10, 2], minimal: [10, 7], dial: [10, 8] },
        options: { actualDatapoint: DP_ACTUAL },
        val: 22,
        actual: 20.5,
        title: 'Heizung Bad',
    },
    {
        type: 'thermostat',
        variant: 'no presets',
        layouts: { default: [10, 5], minimal: [10, 6], dial: [10, 7] },
        options: { actualDatapoint: DP_ACTUAL, showPresets: false },
        val: 19,
        actual: 21,
        title: 'Heizung Kind',
    },
    {
        type: 'weather',
        layouts: { default: [10, 9], compact: [10, 2], minimal: [8, 5] },
        options: { forecastDays: 3 },
        val: null,
        title: 'Wetter',
    },
];

// The forecast the weather widget would fetch — fixed, so nothing reaches out.
const WEATHER_JSON = {
    current: {
        temperature_2m: 21.5,
        relative_humidity_2m: 62,
        weather_code: 3,
        wind_speed_10m: 12.4,
        apparent_temperature: 20.8,
        cloud_cover: 75,
        precipitation: 0.2,
    },
    daily: {
        time: Array.from({ length: 8 }, (_, i) => `2026-03-${String(2 + i).padStart(2, '0')}`),
        weather_code: [3, 61, 80, 1, 2, 63, 71, 0],
        temperature_2m_max: [18.4, 15.2, 17.8, 21.3, 22.6, 16.9, 12.4, 19.1],
        temperature_2m_min: [7.2, 6.8, 8.1, 9.4, 10.2, 7.7, 2.3, 6.5],
        precipitation_probability_max: [10, 80, 65, 5, 0, 70, 45, 0],
        precipitation_sum: [0.2, 6.4, 3.1, 0, 0, 4.8, 2.2, 0],
    },
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 2 });
await ctx.route(/api\.open-meteo\.com/, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(WEATHER_JSON) }),
);
await ctx.route(/brightsky|warnungen|dwd/i, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"alerts":[]}' }),
);
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, null, { timeout: 90000 });
await page.evaluate(() => window.__auraShot.captureWrites(true));
if (THEME) await page.evaluate((t) => window.__auraShot.setTheme(t), THEME);

let seq = 0;
for (const c of CASES) {
    if (ONLY && c.type !== ONLY) continue;
    for (const [layout, [w, h]] of Object.entries(c.layouts)) {
        seq += 1;
        const idA = `p${seq}a`;
        const idB = `p${seq}b`;
        const vals = { [DP]: c.val, [DP_ACTUAL]: c.actual ?? null, [DP_BATT]: 64 };
        const grid = await page.evaluate(
            async ([type, layout, options]) => {
                const m = await import('/src-vis/utils/customGridPresets/index.ts');
                return m.buildCustomGridFromLayout({ type, options }, layout);
            },
            [c.type, layout, c.options],
        );
        const label = `${c.type}${c.variant ? ` (${c.variant})` : ''} ${layout}`;
        if (!grid) {
            check(`${label}: preset exists`, false);
            continue;
        }
        const cellsOk = grid.cells.length === grid.cols * grid.rows;
        check(`${label}: grid ${grid.cols}×${grid.rows}, cells consistent`, cellsOk);

        await page.evaluate(
            ([vals, widgets]) => {
                window.__auraShot.mockServerState(vals);
                window.__auraShot.mock(vals);
                window.__auraShot.showWidgets(widgets);
            },
            [
                vals,
                [
                    {
                        id: idA,
                        type: c.type,
                        title: c.title,
                        datapoint: DP,
                        layout,
                        gridPos: { x: 0, y: 0, w, h },
                        options: c.options,
                    },
                    {
                        id: idB,
                        type: c.type,
                        title: c.title,
                        datapoint: DP,
                        layout: 'custom',
                        gridPos: { x: w + 1, y: 0, w, h },
                        options: { ...c.options, customGrid: grid },
                    },
                ],
            ],
        );
        await page.waitForSelector(`.aura-widget-${idA}`, { timeout: 15000 });
        await page.waitForSelector(`.aura-widget-${idB}`, { timeout: 15000 });
        await page.waitForTimeout(400);

        // Where do the pieces sit, relative to the widget box?
        const boxes = await page.evaluate(
            ([idA, idB]) => {
                const measure = (id) => {
                    const root = document.querySelector(`.aura-widget-${id}`);
                    const r0 = root.getBoundingClientRect();
                    const rel = (el) => {
                        if (!el) return null;
                        const r = el.getBoundingClientRect();
                        if (!r.width && !r.height) return null;
                        return { x: r.left - r0.left, y: r.top - r0.top, w: r.width, h: r.height };
                    };
                    const title = root.querySelector('.aura-widget-title');
                    const icon = root.querySelector('svg.aura-widget-icon, img.aura-widget-icon');
                    return { title: rel(title), icon: rel(icon), w: r0.width, h: r0.height };
                };
                return { a: measure(idA), b: measure(idB) };
            },
            [idA, idB],
        );
        for (const key of ['title', 'icon']) {
            const a = boxes.a[key];
            const b = boxes.b[key];
            if (!a && !b) continue;
            const ok = !!a && !!b && Math.abs(a.x - b.x) <= 6 && Math.abs(a.y - b.y) <= 8;
            check(
                `${label}: ${key} at the same spot`,
                ok,
                a && b
                    ? `orig ${a.x.toFixed(0)},${a.y.toFixed(0)} custom ${b.x.toFixed(0)},${b.y.toFixed(0)}`
                    : 'missing',
            );
        }
        if (OUT) {
            const ra = await page.locator(`.aura-widget-${idA}`).boundingBox();
            const rb = await page.locator(`.aura-widget-${idB}`).boundingBox();
            const x = Math.min(ra.x, rb.x) - 8;
            const y = Math.min(ra.y, rb.y) - 8;
            await page.screenshot({
                path: path.join(OUT, `${String(seq).padStart(2, '0')}-${label.replace(/[^a-z0-9]+/gi, '_')}.png`),
                clip: {
                    x,
                    y,
                    width: Math.max(ra.x + ra.width, rb.x + rb.width) - x + 8,
                    height: Math.max(ra.y + ra.height, rb.y + rb.height) - y + 8,
                },
            });
        }
    }
}

// ── The rebuilt controls still work ─────────────────────────────────────────
if (!ONLY || ONLY === 'controls') {
    const grids = await page.evaluate(async () => {
        const m = await import('/src-vis/utils/customGridPresets/index.ts');
        return {
            dial: m.buildCustomGridFromLayout({ type: 'thermostat', options: {} }, 'dial'),
            card: m.buildCustomGridFromLayout({ type: 'switch', options: {} }, 'card'),
            compact: m.buildCustomGridFromLayout({ type: 'switch', options: {} }, 'compact'),
        };
    });
    await page.evaluate(
        ([DP, DP_ACTUAL, g]) => {
            const v = { [DP]: 22, [DP_ACTUAL]: 20.5, 'demo.768.sw': false };
            window.__auraShot.mockServerState(v);
            window.__auraShot.mock(v);
            window.__auraShot.showWidgets([
                {
                    id: 'ct1',
                    type: 'thermostat',
                    title: 'Bad',
                    datapoint: DP,
                    layout: 'custom',
                    gridPos: { x: 0, y: 0, w: 10, h: 9 },
                    options: { actualDatapoint: DP_ACTUAL, customGrid: g.dial },
                },
                {
                    id: 'ct2',
                    type: 'switch',
                    title: 'Lampe',
                    datapoint: 'demo.768.sw',
                    layout: 'custom',
                    gridPos: { x: 11, y: 0, w: 8, h: 4 },
                    options: { customGrid: g.card },
                },
                {
                    id: 'ct3',
                    type: 'switch',
                    title: 'Lampe',
                    datapoint: 'demo.768.sw',
                    layout: 'custom',
                    gridPos: { x: 11, y: 5, w: 8, h: 2 },
                    options: { customGrid: g.compact },
                },
            ]);
        },
        [DP, DP_ACTUAL, grids],
    );
    await page.waitForSelector('.aura-widget-ct1 [data-aura-thermo-dial]', { timeout: 15000 });
    await page.waitForTimeout(300);
    const last = () => page.evaluate(() => window.__auraShot.lastWrite);
    await page.evaluate(() => window.__auraShot.writes(true));
    await page.locator('.aura-widget-ct1 [data-aura-thermo-btn="plus"]').click();
    let w = await last();
    check('custom dial: "+" writes setpoint + step', w?.id === DP && w?.val === 22.5, JSON.stringify(w));

    // Drag on the arc: press at the far left end (minimum side), release → a write.
    const svg = await page.locator('.aura-widget-ct1 [data-aura-thermo-dial]').boundingBox();
    const side = Math.min(svg.width, svg.height);
    const ox = svg.x + (svg.width - side) / 2;
    const oy = svg.y + (svg.height - side) / 2;
    // Top of the arc (angle 270° in SVG terms) = the middle of the scale.
    await page.mouse.move(ox + side * 0.5, oy + side * (22 / 200));
    await page.mouse.down();
    await page.mouse.up();
    w = await last();
    check(
        'custom dial: a tap on the arc writes the value under the pointer',
        w?.id === DP && Math.abs(w?.val - 20) <= 1,
        JSON.stringify(w),
    );

    await page.locator('.aura-widget-ct2 button.aura-widget-action').first().click();
    w = await last();
    check('switch card grid: the icon toggles', w?.id === 'demo.768.sw' && w?.val === true, JSON.stringify(w));
    await page.evaluate(() => window.__auraShot.writes(true));
    await page.locator('.aura-widget-ct3 button.aura-widget-action').first().click();
    w = await last();
    check('switch compact grid: the toggle toggles', w?.id === 'demo.768.sw' && w?.val === true, JSON.stringify(w));
}

// ── Editor flow ──────────────────────────────────────────────────────────────
if (!ONLY || ONLY === 'editor') {
    const openEditor = async (id) => {
        await page.locator(`.aura-widget-${id}`).hover();
        await page.locator('.aura-edit-chrome button').first().click();
        await page.locator('button:text-is("Bearbeiten")').click();
        const dlg = page.locator('.aura-widget-edit-modal');
        await dlg.waitFor({ timeout: 10000 });
        return dlg;
    };
    const opts = (id) => page.evaluate((id) => window.__auraShot.widgetOptions(id), id);
    const widget = (id) => page.evaluate((id) => window.__auraShot.widgets?.().find((w) => w.id === id) ?? null, id);

    await page.evaluate(
        ([DP, DP_ACTUAL]) => {
            const v = { [DP]: 22, [DP_ACTUAL]: 20.5 };
            window.__auraShot.mockServerState(v);
            window.__auraShot.mock(v);
            window.__auraShot.showWidgets(
                [
                    {
                        id: 'ed1',
                        type: 'thermostat',
                        title: 'Heizung Bad',
                        datapoint: DP,
                        layout: 'dial',
                        gridPos: { x: 0, y: 0, w: 10, h: 8 },
                        options: { actualDatapoint: DP_ACTUAL },
                    },
                ],
                { editMode: true },
            );
            window.__auraShot.setEditMode(true);
        },
        [DP, DP_ACTUAL],
    );
    await page.waitForSelector('.aura-widget-ed1', { timeout: 15000 });
    let dlg = await openEditor('ed1');
    const customPill = dlg.locator('button:text-is("Custom")');

    await customPill.click();
    const prompt = dlg.locator('.aura-custom-start');
    check('switching to Custom asks how to start', await prompt.isVisible());
    check(
        'prompt offers the layout it came from',
        (await prompt.locator('[data-aura-custom-start="layout"]').innerText()).includes('Rundskala'),
    );
    check(
        'no grid yet → second choice is the default grid',
        (await prompt.locator('[data-aura-custom-start="blank"]').count()) === 1,
    );
    await prompt.locator('[data-aura-custom-start="cancel"]').click();
    check('cancel keeps the layout', (await opts('ed1'))?.customGrid === undefined && !(await prompt.isVisible()));

    await customPill.click();
    await prompt.locator('[data-aura-custom-start="layout"]').click();
    let o = await opts('ed1');
    check(
        '"Rundskala übernehmen" writes the dial grid',
        o?.customGrid?.cells?.some((c) => c.componentKey === 'dial'),
        JSON.stringify(o?.customGrid?.cells?.map((c) => c.componentKey ?? c.type)),
    );
    await page.waitForTimeout(300);
    check(
        'custom widget draws the round scale',
        (await page.locator('.aura-widget-ed1 [data-aura-thermo-dial]').count()) === 1,
    );

    // Back to the default layout, then Custom again: now there is a grid to keep.
    await dlg.locator('button:text-is("Standard")').click();
    await customPill.click();
    check('existing grid → "keep" is offered', (await prompt.locator('[data-aura-custom-start="keep"]').count()) === 1);
    check(
        'prompt now names the default layout',
        (await prompt.locator('[data-aura-custom-start="layout"]').innerText()).includes('Standard'),
    );
    await prompt.locator('[data-aura-custom-start="keep"]').click();
    o = await opts('ed1');
    check(
        '"keep" leaves the dial grid untouched',
        o?.customGrid?.cells?.some((c) => c.componentKey === 'dial'),
    );

    // Rebuild menu inside the custom editor.
    const rebuild = dlg.locator('select[data-aura-custom-rebuild]');
    check('custom editor offers "Aus Layout übernehmen"', (await rebuild.count()) === 1);
    await rebuild.selectOption('compact');
    o = await opts('ed1');
    check(
        'menu rebuilds the grid from "Kompakt"',
        o?.customGrid?.rows === 1 && o?.customGrid?.cells?.some((c) => c.componentKey === 'btn-plus'),
    );
    await rebuild.selectOption('__blank');
    o = await opts('ed1');
    check('menu "Standard-Raster" clears the grid', o?.customGrid === undefined);
    void widget;
}

check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
