// Die weiteren Werte des Raumklima-Widgets im Browser (#698):
//
//   npm run dev            (oder AURA_BASE setzen)
//   node tools/tests/climate-metrics-ui.mjs
//
// Was hier nur im echten Aufbau prüfbar ist:
//  * ein Widget OHNE `metrics` sieht exakt aus wie vor der Liste — eine große
//    Temperatur, rechts Soll/Feuchte/Luftdruck, und zwar in den Schriftgrößen
//    von vorher (11/14/13 px). Das ist die Zusage an bestehende Dashboards.
//  * jeder weitere Wert steht im Raster darunter und kostet dort eine Zeile,
//    genau die, die der Messstand als Zusatzwert-Zeile verkauft.
//  * metricColumns stellt sie nebeneinander, statt sie umbrechen zu lassen.
//  * Taupunkt und Behaglichkeit rechnen aus Temperatur und Feuchte — ohne
//    eigenen Datenpunkt.
//
// Ohne ioBroker hinter dem Dev-Server bleibt `connected` falsch: Werte kommen
// nur aus dem Cache, den die Harness füllt, und ein Wertwechsel braucht ein
// frisches Widget mit neuer Id.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${ok || !detail ? '' : ` — ${detail}`}`);
};
const eq = (name, got, want) => check(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const DP_TEMP = 'aura-selftest.0.climate.temp';
const DP_HUM = 'aura-selftest.0.climate.hum';
const DP_CO2 = 'aura-selftest.0.climate.co2';
const DP_LUX = 'aura-selftest.0.climate.lux';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1000, height: 800 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

let seq = 0;
let SEL = '';

/** Mountet die Kachel frisch und liefert ihren Selektor. */
async function show(options, values) {
    const id = `clim${++seq}`;
    SEL = `.aura-widget-${id}`;
    await page.evaluate(
        ([wid, opts, vals, dpTemp]) => {
            window.__auraShot.mock(vals);
            window.__auraShot.mockServerState(vals);
            window.__auraShot.showWidgets([
                {
                    id: wid,
                    type: 'climate',
                    title: 'Wohnzimmer',
                    datapoint: dpTemp,
                    layout: 'default',
                    gridPos: { x: 0, y: 0, w: 24, h: 12 },
                    options: opts,
                },
            ]);
        },
        [id, options, values, DP_TEMP],
    );
    await page.waitForSelector(`${SEL} .aura-widget-value`, { timeout: 10000 });
    await page.waitForTimeout(350);
    return SEL;
}

const chips = () =>
    page.evaluate((sel) =>
        [...document.querySelectorAll(`${sel} .aura-climate-metrics > *`)].map((el) => {
            const r = el.getBoundingClientRect();
            return { text: el.textContent, top: Math.round(r.top), left: Math.round(r.left) };
        }),
    SEL);

const rightColumn = () =>
    page.evaluate((sel) => {
        const col = document.querySelector(`${sel} .aura-widget-value > div:last-child`);
        if (!col) return [];
        return [...col.children].map((el) => ({
            text: el.textContent,
            font: Math.round(parseFloat(getComputedStyle(el).fontSize)),
        }));
    }, SEL);

/** Hoehe des Rasters selbst — die Karte fuellt immer ihre Rasterhoehe. */
const gridHeight = () =>
    page.evaluate((sel) => {
        const el = document.querySelector(`${sel} .aura-climate-metrics`);
        return el ? Math.round(el.getBoundingClientRect().height) : 0;
    }, SEL);

const BASE_VALUES = { [DP_TEMP]: 21.4, [DP_HUM]: 52, [DP_CO2]: 493.12, [DP_LUX]: 318 };
const LEGACY_OPTS = {
    humidityDatapoint: DP_HUM,
    pressureDatapoint: '',
    decimals: 1,
    unit: '°C',
    showChart: false,
};

// ── 1. Ohne metrics: das Bild von vorher ─────────────────────────────────────
await show(LEGACY_OPTS, BASE_VALUES);
{
    const col = await rightColumn();
    eq('rechts steht genau eine Zeile (die Feuchte)', col.length, 1);
    check('und sie zeigt ihren Wert', (col[0]?.text ?? '').includes('52'), col[0]?.text);
    eq('in der Schriftgröße von vor der Liste', col[0]?.font, 14);
    eq('ohne metrics gibt es kein Raster', (await chips()).length, 0);
}

// ── 2. Weitere Werte landen im Raster ────────────────────────────────────────
await show(
    {
        ...LEGACY_OPTS,
        metricColumns: 1,
        metrics: [
            { id: 'co2', datapoint: DP_CO2, label: 'CO₂', unit: 'ppm', decimals: 0, icon: 'Wind' },
            { id: 'lux', datapoint: DP_LUX, label: 'Helligkeit', unit: 'lx', decimals: 0 },
            { id: 'dew', source: 'dewpoint', label: 'Taupunkt', unit: '°C', decimals: 1 },
        ],
    },
    BASE_VALUES,
);
const withThree = await chips();
{
    eq('drei weitere Werte ergeben drei Einträge', withThree.length, 3);
    check('CO₂ steht gerundet da', (withThree[0]?.text ?? '').includes('493'), withThree[0]?.text);
    check('mit seiner Einheit', (withThree[0]?.text ?? '').includes('ppm'), withThree[0]?.text);
    check('und mit seiner Beschriftung', (withThree[0]?.text ?? '').includes('CO₂'), withThree[0]?.text);
    // 21,4 °C bei 52 % → Taupunkt 11,2 °C. Gerechnet, nicht abonniert.
    check(
        'der Taupunkt wird aus Temperatur und Feuchte gerechnet',
        /11[.,][0-4]/.test(withThree[2]?.text ?? ''),
        withThree[2]?.text,
    );
    const tops = new Set(withThree.map((c) => c.top));
    eq('mit einer Spalte steht jeder Wert in einer eigenen Zeile', tops.size, 3);
}
const heightThree = await gridHeight();

// ── 3. Mehr Spalten, weniger Zeilen ──────────────────────────────────────────
await show(
    {
        ...LEGACY_OPTS,
        metricColumns: 3,
        metrics: [
            { id: 'co2', datapoint: DP_CO2, label: 'CO₂', unit: 'ppm', decimals: 0 },
            { id: 'lux', datapoint: DP_LUX, label: 'Helligkeit', unit: 'lx', decimals: 0 },
            { id: 'dew', source: 'dewpoint', label: 'Taupunkt', unit: '°C', decimals: 1 },
        ],
    },
    BASE_VALUES,
);
{
    const c = await chips();
    eq('drei Spalten zeigen dieselben drei Werte', c.length, 3);
    eq('aber in einer einzigen Zeile', new Set(c.map((x) => x.top)).size, 1);
    const h = await gridHeight();
    check('und das Raster wird dadurch flacher', h < heightThree, `${h} px statt ${heightThree} px`);
}

// ── 4. Wertzuordnung statt Zahl ──────────────────────────────────────────────
await show(
    {
        ...LEGACY_OPTS,
        metrics: [
            {
                id: 'comfort',
                source: 'comfort',
                label: 'Behaglichkeit',
                display: 'badge',
                valueMap: [
                    { v: 0, label: 'unbehaglich' },
                    { v: 1, label: 'geht noch' },
                    { v: 2, label: 'behaglich' },
                ],
            },
        ],
    },
    BASE_VALUES,
);
{
    const c = await chips();
    check('21,4 °C bei 52 % ist behaglich', (c[0]?.text ?? '').includes('behaglich'), c[0]?.text);
    check('und steht ohne Zahl da', !/\d/.test(c[0]?.text ?? ''), c[0]?.text);
}

// ── 5. Ausgeblendete Werte ───────────────────────────────────────────────────
await show(
    {
        ...LEGACY_OPTS,
        metrics: [
            { id: 'co2', datapoint: DP_CO2, label: 'CO₂', unit: 'ppm' },
            { id: 'lux', datapoint: DP_LUX, label: 'Helligkeit', unit: 'lx', hidden: true },
        ],
    },
    BASE_VALUES,
);
eq('ein ausgeblendeter Wert wird nicht gezeichnet', (await chips()).length, 1);

check('keine Fehler auf der Seite', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\nclimate-metrics-ui: ${results.length - failed.length}/${results.length} passed\n`);
process.exit(failed.length ? 1 : 0);
