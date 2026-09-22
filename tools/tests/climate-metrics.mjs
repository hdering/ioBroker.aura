// Die Werteliste des Raumklima-Widgets (#698):
//
//   node tools/tests/climate-metrics.mjs
//
// Kein Dev-Server nötig — was hier zählt, ist reine Rechnerei, deshalb wird
// src-vis/utils/climateMetrics.ts mit esbuild gebündelt und direkt aufgerufen.
//
// Was das absichert:
//   * die drei Altoptionen (Soll / Feuchte / Luftdruck) ergeben ohne `metrics`
//     GENAU das Bild von vorher — Reihenfolge, Platz, Schriftgröße, Einheiten,
//     und der Luftdruck weiter mit seinen eigenen Nachkommastellen,
//   * Taupunkt, absolute Feuchte und Behaglichkeit gegen bekannte Werte,
//   * die Wertzuordnung sticht die Farbschwelle und lässt die Einheit weg,
//   * eine Zuordnung trifft 1, '1' und true gleichermaßen,
//   * ein gerechneter Wert taucht nicht in der Abo-Liste auf.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-climate-metrics-${process.pid}.mjs`);
await build({
    stdin: {
        contents:
            'export { dewPoint, absoluteHumidity, comfortLevel, resolveClimateMetrics, climateMetricRefs, ' +
            'formatMetric, metricsInSlot, metricFromTemplate, matchValueMap, mergeChartRows, CLIMATE_METRIC_TEMPLATES, ' +
            "LEGACY_TARGET, LEGACY_HUMIDITY, LEGACY_PRESSURE } from './src-vis/utils/climateMetrics.ts';",
        resolveDir: process.cwd(),
        loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'warning',
    // formatValue zieht den Einstellungs-Store mit, und der zieht die
    // Socket-Anbindung samt `import.meta.env` nach — nichts davon wird hier
    // aufgerufen, also wird der Store durch eine leere Hülle ersetzt.
    plugins: [
        {
            name: 'stub-store',
            setup(b) {
                b.onResolve({ filter: /globalSettingsStore$/ }, (a) => ({ path: a.path, namespace: 'stub' }));
                b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
                    contents:
                        'export const useGlobalSettingsStore = () => ({});\n' +
                        "useGlobalSettingsStore.getState = () => ({ numberFormat: 'de', defaultDecimals: 1 });",
                    loader: 'js',
                }));
            },
        },
    ],
});
const {
    dewPoint,
    absoluteHumidity,
    comfortLevel,
    resolveClimateMetrics,
    climateMetricRefs,
    formatMetric,
    metricsInSlot,
    metricFromTemplate,
    matchValueMap,
    mergeChartRows,
    CLIMATE_METRIC_TEMPLATES,
    LEGACY_TARGET,
    LEGACY_HUMIDITY,
    LEGACY_PRESSURE,
} = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

let failed = 0;
const check = (label, ok, detail = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok || !detail ? '' : ` — ${detail}`}`);
    if (!ok) failed++;
};
const eq = (label, actual, expected) =>
    check(label, JSON.stringify(actual) === JSON.stringify(expected), `got ${JSON.stringify(actual)}`);
const near = (label, actual, expected, tol = 0.1) =>
    check(label, actual !== null && Math.abs(actual - expected) <= tol, `got ${actual}, erwartet ~${expected}`);

const LEGACY = {
    showTargetTemp: true,
    targetDatapoint: 'dp.soll',
    unit: '°C',
    showHumidity: true,
    humidityDatapoint: 'dp.feuchte',
    humidityIcon: undefined,
    humidityUnit: '%',
    showPressure: true,
    pressureDatapoint: 'dp.druck',
    pressureIcon: undefined,
    pressureUnit: 'hPa',
    pressureDecimals: 0,
};
const DEFAULTS = { decimals: 1 };
const NO_CTX = { temperature: null, humidity: null };

// ── Abgeleitete Werte ────────────────────────────────────────────────────────
// Referenz: 20 °C / 50 % r. F. → Taupunkt 9,3 °C, absolute Feuchte 8,7 g/m³.
near('Taupunkt bei 20 °C und 50 %', dewPoint(20, 50), 9.3, 0.2);
near('Taupunkt bei 25 °C und 80 %', dewPoint(25, 80), 21.3, 0.2);
near('Taupunkt bei 100 % ist die Temperatur selbst', dewPoint(18, 100), 18, 0.05);
check('Taupunkt ohne Feuchte ist leer', dewPoint(20, null) === null);
check('Taupunkt bleibt endlich, auch bei 0 %', Number.isFinite(dewPoint(20, 0)));
near('absolute Feuchte bei 20 °C und 50 %', absoluteHumidity(20, 50), 8.7, 0.2);
near('absolute Feuchte bei 0 °C und 100 %', absoluteHumidity(0, 100), 4.8, 0.2);
check('absolute Feuchte ohne Temperatur ist leer', absoluteHumidity(null, 50) === null);

eq('behaglich: 21 °C, 50 %', comfortLevel(21, 50), 2);
eq('geht noch: 26 °C, 50 %', comfortLevel(26, 50), 1);
eq('geht noch: 21 °C, 65 %', comfortLevel(21, 65), 1);
eq('unbehaglich: 30 °C, 80 %', comfortLevel(30, 80), 0);
eq('die schlechtere der beiden Achsen gewinnt', comfortLevel(21, 85), 0);
check('Behaglichkeit ohne jeden Wert ist leer', comfortLevel(null, null) === null);

// ── Altoptionen ──────────────────────────────────────────────────────────────
{
    const m = resolveClimateMetrics(LEGACY, undefined);
    eq('ohne metrics stehen genau die drei Altwerte da', m.map((x) => x.id), [
        LEGACY_TARGET,
        LEGACY_HUMIDITY,
        LEGACY_PRESSURE,
    ]);
    check('alle drei stehen in der rechten Spalte', m.every((x) => x.slot === 'secondary'));
    check('alle drei sind als Altbestand markiert', m.every((x) => x.legacy === true));
    eq('die Schriftgrößen von vor der Liste', m.map((x) => x.fontSize), [11, 14, 13]);
    eq('die Soll-Temperatur bleibt eine Pille', m[0].display, 'badge');
    eq('die Feuchte behält ihr Vorgabe-Icon', m[1].icon, 'Droplets');
    eq('der Luftdruck behält sein Vorgabe-Icon', m[2].icon, 'Gauge');
    eq('der Luftdruck behält seine eigenen Nachkommastellen', m[2].decimals, 0);
    eq('abonniert werden genau die drei Datenpunkte', climateMetricRefs(m), ['dp.druck', 'dp.feuchte', 'dp.soll']);
}
{
    const m = resolveClimateMetrics({ ...LEGACY, showHumidity: false, showPressure: false }, undefined);
    eq('abgeschaltete Zeilen fallen weg', m.map((x) => x.id), [LEGACY_TARGET]);
}
{
    // Genau wie vorher: ohne Datenpunkt gibt es keine Soll-Pille und keine
    // Luftdruckzeile, die Feuchte dagegen zeigt weiter ihren Strich.
    const m = resolveClimateMetrics({ ...LEGACY, targetDatapoint: '', pressureDatapoint: '' }, undefined);
    eq('ohne Datenpunkt bleiben nur Soll und Druck weg', m.map((x) => x.id), [LEGACY_HUMIDITY]);
}
{
    const m = resolveClimateMetrics(LEGACY, [
        { id: 'co2', datapoint: 'dp.co2' },
        { id: 'weg', datapoint: 'dp.x', hidden: true },
    ]);
    eq('weitere Werte hängen hinten an', m.map((x) => x.id), [
        LEGACY_TARGET,
        LEGACY_HUMIDITY,
        LEGACY_PRESSURE,
        'co2',
    ]);
    eq('ohne slot steht ein Wert im Raster', m[3].slot, 'grid');
    check('ein ausgeblendeter Wert wird nirgends abonniert', !climateMetricRefs(m).includes('dp.x'));
    eq('das Raster hält genau den einen', metricsInSlot(m, 'grid').map((x) => x.id), ['co2']);
}

// ── Formatierung ─────────────────────────────────────────────────────────────
{
    const [m] = resolveClimateMetrics({ ...LEGACY, showTargetTemp: false, showPressure: false }, []);
    const f = formatMetric(m, { 'dp.feuchte': 52.4 }, NO_CTX, DEFAULTS);
    eq('die Feuchte kommt mit ihrer Einheit', [f.text, f.unit], ['52,4', '%']);
    // Prozent und Grad haengen an der Zahl, alles andere bekommt den Abstand,
    // den der Luftdruck schon vor der Werteliste hatte.
    const [, , druck] = resolveClimateMetrics(LEGACY, []);
    eq('der Luftdruck behaelt sein Leerzeichen', formatMetric(druck, { 'dp.druck': 1013 }, NO_CTX, DEFAULTS).unit, ' hPa');
    const leer = formatMetric(m, {}, NO_CTX, DEFAULTS);
    eq('ohne Wert steht der Strich da', [leer.text, leer.empty], ['–', true]);
}
{
    const m = {
        id: 'co2',
        slot: 'grid',
        datapoint: 'dp.co2',
        unit: 'ppm',
        decimals: 0,
        thresholds: [
            [800, 'green'],
            [1400, 'yellow'],
            [2000, 'red'],
        ],
    };
    eq('unter der ersten Schwelle grün', formatMetric(m, { 'dp.co2': 480 }, NO_CTX, DEFAULTS).color, 'green');
    eq('dazwischen gelb', formatMetric(m, { 'dp.co2': 1200 }, NO_CTX, DEFAULTS).color, 'yellow');
    eq('über der letzten Schwelle bleibt die oberste Farbe', formatMetric(m, { 'dp.co2': 3000 }, NO_CTX, DEFAULTS).color, 'red');
    eq('gerundet wird je Wert, nicht global', formatMetric(m, { 'dp.co2': 493.12 }, NO_CTX, DEFAULTS).text, '493');
}
{
    const m = {
        id: 'comfort',
        slot: 'grid',
        source: 'comfort',
        unit: 'x',
        valueMap: [
            { v: 0, label: 'unbehaglich', color: 'red' },
            { v: 1, label: 'geht noch', color: 'yellow' },
            { v: 2, label: 'behaglich', color: 'green' },
        ],
    };
    const f = formatMetric(m, {}, { temperature: 21, humidity: 50 }, DEFAULTS);
    eq('die Zuordnung ersetzt die Zahl', [f.text, f.color], ['behaglich', 'green']);
    eq('und lässt die Einheit weg', f.unit, '');
    check('ein gerechneter Wert braucht keinen Datenpunkt', climateMetricRefs([m]).length === 0);
}
{
    const m = {
        id: 'motion',
        slot: 'secondary',
        datapoint: 'dp.motion',
        display: 'dot',
        valueMap: [
            { v: true, label: 'Bewegung', color: 'green' },
            { v: false, label: 'ruhig' },
        ],
    };
    eq('true trifft die Zeile', formatMetric(m, { 'dp.motion': true }, NO_CTX, DEFAULTS).text, 'Bewegung');
    eq('false trifft die andere', formatMetric(m, { 'dp.motion': false }, NO_CTX, DEFAULTS).text, 'ruhig');
    check('true leuchtet', formatMetric(m, { 'dp.motion': true }, NO_CTX, DEFAULTS).active === true);
    check('false leuchtet nicht', formatMetric(m, { 'dp.motion': false }, NO_CTX, DEFAULTS).active === false);
    eq('1 trifft dieselbe Zeile wie true', matchValueMap(m, 1)?.label, 'Bewegung');
    eq("'1' ebenfalls", matchValueMap(m, '1')?.label, 'Bewegung');
}
{
    const m = { id: 'lux', slot: 'grid', datapoint: 'dp.lux', unit: 'lx', decimals: 0, valueFactor: 2, valueOffset: 5 };
    eq('Faktor und Versatz wirken auf die Anzeige', formatMetric(m, { 'dp.lux': 10 }, NO_CTX, DEFAULTS).text, '25');
}

// ── Vorlagen ─────────────────────────────────────────────────────────────────
{
    const ids = CLIMATE_METRIC_TEMPLATES.map((t) => t.key);
    eq('jede Vorlage hat eine eigene Kennung', ids.length, new Set(ids).size);
    check(
        'die Werte aus dem Issue sind alle als Vorlage da',
        ['co2', 'eco2', 'voc', 'dewpoint', 'comfort', 'airQuality', 'lux', 'motion'].every((k) => ids.includes(k)),
    );
    check(
        'jede Vorlage bringt Beschriftung oder Wertzuordnung mit',
        CLIMATE_METRIC_TEMPLATES.every((t) => t.key === 'custom' || t.metric.label || t.metric.valueMap),
    );
    const a = metricFromTemplate('co2');
    const b = metricFromTemplate('co2', [a]);
    check('eine zweite Vorlage derselben Art bekommt eine eigene Kennung', a.id !== b.id, `${a.id} / ${b.id}`);
    a.thresholds[0][0] = 1;
    check('die Vorlage selbst bleibt unangetastet', CLIMATE_METRIC_TEMPLATES.find((t) => t.key === 'co2').metric.thresholds[0][0] === 800);
}

// ── Diagramm: gemeinsame Zeitachse ───────────────────────────────────────────
// Jede Reihe kommt mit eigenen Zeitstempeln aus der Historie; recharts braucht
// eine Zeilenliste. Eine Luecke muss eine Luecke BLEIBEN — ein erfundener
// Zwischenwert waere eine Messung, die es nie gab.
{
    const rows = mergeChartRows(['a', 'b'], (id) =>
        id === 'a'
            ? [
                  [200, 1],
                  [100, 2],
              ]
            : [
                  [100, 9],
                  [300, 8],
              ],
    );
    eq('die Zeilen stehen nach Zeit sortiert', rows.map((r) => r.t), [100, 200, 300]);
    eq('gleiche Zeitstempel teilen sich eine Zeile', rows[0], { t: 100, a: 2, b: 9 });
    check('wo eine Reihe nichts hat, steht auch nichts', !('b' in rows[1]), JSON.stringify(rows[1]));
    eq('und die andere Reihe behaelt ihren Punkt', rows[2], { t: 300, b: 8 });
    eq('ohne Reihen bleibt die Liste leer', mergeChartRows([], () => undefined), []);
    eq('eine Reihe ganz ohne Daten stoert nicht', mergeChartRows(['a'], () => undefined), []);
}

console.log(failed === 0 ? '\nAll climate-metric checks passed.' : `\n${failed} check(s) failed.`);
process.exit(failed ? 1 : 0);
