// Layout `bar` of the energy-flow widget: the evcc-style energy bar.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/evcc-energy-bar.mjs
//
// Pins how the site values split into bar segments (battery · PV self · PV export ·
// grid), which brackets appear above (sources) and below (consumers incl. the
// loadpoints), and the empty state. Values come through the screenshot harness.
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const OUT = 'tools/tests/out';
fs.mkdirSync(OUT, { recursive: true });

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

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1200, height: 700 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, null, { timeout: 60000 });

const PREFIX = 'demo.evcc';
const DPS = {
    pvPowerDatapoint: 'demo.bar.pv',
    homePowerDatapoint: 'demo.bar.home',
    gridPowerDatapoint: 'demo.bar.grid',
    batterySocDatapoint: 'demo.bar.soc',
    batteryPowerDatapoint: 'demo.bar.batt',
};

let n = 0;
async function show(v) {
    const values = {
        'demo.bar.pv': v.pv,
        'demo.bar.home': v.home,
        'demo.bar.grid': v.grid,
        'demo.bar.soc': v.soc,
        'demo.bar.batt': v.batt,
        [`${PREFIX}.loadpoint.1.status.chargePower`]: v.lp1 ?? 0,
        [`${PREFIX}.loadpoint.1.status.title`]: 'Carport',
        [`${PREFIX}.loadpoint.2.status.chargePower`]: v.lp2 ?? 0,
        [`${PREFIX}.loadpoint.2.status.title`]: 'Wärmepumpe',
        [`${PREFIX}.loadpoint.2.status.chargerFeatureHeating`]: true,
    };
    const id = `bar${++n}`;
    await page.evaluate(
        ([id, values, dps, prefix]) => {
            window.__auraShot.mockServerState(values);
            window.__auraShot.mock(values);
            window.__auraShot.showWidgets([
                {
                    id,
                    type: 'evcc',
                    title: 'Energie',
                    layout: 'bar',
                    datapoint: '',
                    gridPos: { x: 0, y: 0, w: 16, h: 6 },
                    options: { evccPrefix: prefix, loadpointCount: 2, showBattery: true, powerUnit: 'auto', ...dps },
                },
            ]);
        },
        [id, values, DPS, PREFIX],
    );
    // Offline dev server: the widget reads the socket's connected flag at mount and
    // draws only 'no connection' — play a reconnect once it is there.
    await page.waitForFunction((id) => !!document.querySelector(`.aura-widget-${id}`), id, { timeout: 10000 });
    await page.evaluate((values) => window.__auraShot.simulateReconnect(values), values);
    await page.waitForFunction((id) => !!document.querySelector(`.aura-widget-${id} .aura-ebar-bar`), id, {
        timeout: 10000,
    });
    await page.evaluate((values) => window.__auraShot.mock(values), values);
    await page.waitForTimeout(1500); // one glide
    return id;
}

const read = (id) =>
    page.evaluate((id) => {
        const root = document.querySelector(`.aura-widget-${id}`);
        const titles = (sel) => [...root.querySelectorAll(sel)].map((e) => e.title);
        return {
            seg: titles('.aura-ebar-bar .aura-ebar-sg'),
            top: titles('.aura-ebar-top .aura-ebar-k'),
            bottom: titles('.aura-ebar-bottom .aura-ebar-k'),
            empty: root.querySelector('.aura-ebar-empty')?.textContent ?? null,
            soc: root.querySelector('.aura-ebar-soc')?.textContent ?? null,
            widths: [...root.querySelectorAll('.aura-ebar-bar .aura-ebar-sg')].map((e) =>
                Math.round(e.getBoundingClientRect().width),
            ),
            barW: Math.round(root.querySelector('.aura-ebar-bar').getBoundingClientRect().width),
        };
    }, id);

const shot = (id, name) => page.locator(`.aura-widget-${id}`).screenshot({ path: `${OUT}/evcc-bar-${name}.png` });

// ── sunny noon: PV covers house + car, charges the battery, feeds in ─────────
{
    const id = await show({ pv: 6000, home: 1500, grid: -1500, batt: -1000, soc: 62, lp1: 2000 });
    const r = await read(id);
    eq('noon: segments', r.seg, ['PV Eigenverbrauch: 4.5 kW', 'PV Export: 1.5 kW']);
    eq('noon: sources', r.top, ['Solar: 6.0 kW']);
    eq('noon: consumers', r.bottom, [
        'Haus: 1.5 kW',
        'Carport: 2.0 kW',
        'Speicher laden: 1.0 kW',
        'Einspeisung: 1.5 kW',
    ]);
    eq('noon: soc', r.soc, '62%');
    check(
        'noon: segments fill the bar',
        Math.abs(r.widths.reduce((a, b) => a + b, 0) - r.barW) <= 2,
        `${r.widths} / ${r.barW}`,
    );
    await shot(id, 'noon');
}

// ── evening: battery and grid feed house + heat pump ─────────────────────────
{
    const id = await show({ pv: 0, home: 800, grid: 600, batt: 1400, soc: 9, lp2: 1200 });
    const r = await read(id);
    eq('evening: segments', r.seg, ['Speicher entladen: 1.4 kW', 'Netzbezug: 600 W']);
    eq('evening: sources', r.top, ['Speicher: 1.4 kW', 'Netzbezug: 600 W']);
    eq('evening: consumers', r.bottom, ['Haus: 800 W', 'Wärmepumpe: 1.2 kW']);
    await shot(id, 'evening');
}

// ── battery feeds in beyond PV: the surplus is no yellow PV export ───────────
{
    const id = await show({ pv: 300, home: 500, grid: -1000, batt: 1200, soc: 80 });
    const r = await read(id);
    eq('battery export: segments', r.seg, ['Speicher entladen: 1.2 kW', 'PV Export: 300 W']);
    await shot(id, 'battery-export');
}

// ── nothing flows ─────────────────────────────────────────────────────────────
{
    const id = await show({ pv: 0, home: 0, grid: 0, batt: 0, soc: 50 });
    const r = await read(id);
    eq('empty: no segments', r.seg, []);
    eq('empty: hint', r.empty, 'Keine Leistung');
}

// ── narrow tile: labels that do not fit move out or disappear, nothing overflows
{
    await page.setViewportSize({ width: 420, height: 600 });
    const id = await show({ pv: 6000, home: 1500, grid: -1500, batt: -1000, soc: 62, lp1: 2000 });
    const over = await page.evaluate((id) => {
        const root = document.querySelector(`.aura-widget-${id}`);
        const box = root.getBoundingClientRect();
        return [...root.querySelectorAll('.aura-ebar-out')].filter((e) => {
            const r = e.getBoundingClientRect();
            return r.left < box.left - 1 || r.right > box.right + 1;
        }).length;
    }, id);
    eq('narrow: outside labels stay inside the tile', over, 0);
    await shot(id, 'narrow');
}

eq('no page errors', pageErrors, []);
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\nevcc-energy-bar: ${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
