// Die Hauptreihen im Diagramm des Raumklima-Widgets (#724):
//
//   npm run dev            (oder AURA_BASE setzen)
//   node tools/tests/climate-chart-series.mjs
//
// Was das absichert:
//  * ohne neue Optionen bleibt das Diagramm wie vorher — nur die Temperatur-Fläche,
//  * humidityInChart legt die Feuchte als Linie auf eine eigene rechte Achse,
//    auch wenn ihre Zeile (showHumidity) ausgeblendet ist,
//  * tempInChart: false nimmt die Temperatur heraus, die Feuchte rückt nach links,
//  * bleibt gar keine Reihe übrig, entfällt das Diagramm, statt ewig „Lade Verlauf…“
//    zu zeigen.
//
// Der Verlauf kommt aus dem Generator der Harness (enableHistory).
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

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1000, height: 800 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
await page.evaluate(() => window.__auraShot.enableHistory(true));

let seq = 0;
const VALUES = { [DP_TEMP]: 21.4, [DP_HUM]: 52 };
const BASE_OPTS = { humidityDatapoint: DP_HUM, historyInstance: 'history.0', showYAxis: true, decimals: 1 };

/** Mountet die Kachel frisch und zählt, was das Diagramm zeichnet. */
async function show(options) {
    const id = `climchart${++seq}`;
    const sel = `.aura-widget-${id}`;
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
                    gridPos: { x: 0, y: 0, w: 24, h: 14 },
                    options: opts,
                },
            ]);
        },
        [id, { ...BASE_OPTS, ...options }, VALUES, DP_TEMP],
    );
    await page.waitForSelector(`${sel} .aura-widget-value`, { timeout: 10000 });
    // Auf die erste Kurve warten; die Fälle ohne Diagramm laufen in den Timeout.
    try {
        await page.waitForFunction((s) => !!document.querySelector(`${s} .recharts-line, ${s} .recharts-area`), sel, {
            timeout: 8000,
        });
    } catch {
        /* die Zählung unten meldet das leere Bild */
    }
    await page.waitForTimeout(400);
    return page.evaluate((s) => {
        const root = document.querySelector(s);
        const q = (c) => root.querySelectorAll(c).length;
        return {
            chart: q('.recharts-wrapper'),
            areas: q('.recharts-area'),
            lines: q('.recharts-line'),
            leftAxis: q('.recharts-yAxis.yAxis .recharts-cartesian-axis-tick') > 0 ? 1 : 0,
            axes: q('.recharts-yAxis'),
            legend: q('.recharts-legend-item'),
            placeholder: /Lade Verlauf|Warte auf Daten/.test(root.textContent ?? ''),
            lineStroke: root.querySelector('.recharts-line path')?.getAttribute('stroke') ?? null,
        };
    }, sel);
}

// 1. Vorgabe: nur die Temperatur
{
    const r = await show({});
    eq('Vorgabe: Diagramm da', r.chart, 1);
    eq('Vorgabe: eine Fläche (Temperatur)', r.areas, 1);
    eq('Vorgabe: keine Linie', r.lines, 0);
    eq('Vorgabe: eine Achse', r.axes, 1);
    eq('Vorgabe: keine Legende', r.legend, 0);
}

// 2. Feuchte dazu — rechte Achse, Legende, Vorgabefarbe
{
    const r = await show({ humidityInChart: true });
    eq('Feuchte an: Fläche bleibt', r.areas, 1);
    eq('Feuchte an: eine Linie', r.lines, 1);
    eq('Feuchte an: zweite Achse', r.axes, 2);
    eq('Feuchte an: Legende mit zwei Einträgen', r.legend, 2);
    eq('Feuchte an: Vorgabefarbe', r.lineStroke, '#14b8a6');
}

// 3. Feuchte auf die linke Achse, eigene Farbe
{
    const r = await show({ humidityInChart: true, humidityChartAxis: 'left', humidityChartColor: '#ff0000' });
    eq('Achse links: nur eine Achse', r.axes, 1);
    eq('Achse links: eigene Farbe', r.lineStroke, '#ff0000');
}

// 4. Zeile aus, Verlauf an
{
    const r = await show({ humidityInChart: true, showHumidity: false });
    eq('Zeile aus: Linie trotzdem da', r.lines, 1);
}

// 5. Temperatur raus, nur Feuchte
{
    const r = await show({ humidityInChart: true, tempInChart: false });
    eq('Ohne Temperatur: keine Fläche', r.areas, 0);
    eq('Ohne Temperatur: eine Linie', r.lines, 1);
    eq('Ohne Temperatur: Feuchte auf der einzigen Achse', r.axes, 1);
    eq('Ohne Temperatur: keine Legende bei einer Reihe', r.legend, 0);
}

// 6. Gar keine Reihe → kein Diagramm, kein Platzhalter
{
    const r = await show({ tempInChart: false });
    eq('Keine Reihe: kein Diagramm', r.chart, 0);
    eq('Keine Reihe: kein Platzhalter', r.placeholder, false);
}

// 7. Feuchte an, aber ohne Datenpunkt → wie Vorgabe
{
    const r = await show({ humidityInChart: true, humidityDatapoint: '' });
    eq('Ohne Feuchte-DP: keine Linie', r.lines, 0);
}

// 8. Editor: je Hauptwert EIN Schalter, kein eigener „Verlaufsdiagramm“-Schalter mehr
{
    await show({});
    const wid = `climchart${seq}`;
    await page.evaluate(() => window.__auraShot.setEditMode(true));
    await page.waitForTimeout(300);
    const card = page.locator(`.aura-widget-${wid}`).first();
    await card.hover();
    await card.locator('.aura-edit-chrome button').first().click();
    await page
        .locator('button:text-is("Bearbeiten")')
        .click()
        .catch(() => {});
    await page.waitForSelector('p:text-is("Verlauf")', { timeout: 10000 });
    const toggle = (label) => page.locator(`div.flex:has(> span:text-is("${label}")) > button`).last();
    const opts = () =>
        page.evaluate((id) => {
            const o = window.__auraShot.widgetOptions(id) ?? {};
            return JSON.stringify([o.showChart, o.tempInChart, o.humidityInChart]);
        }, wid);

    eq('Editor: kein Schalter „Verlaufsdiagramm“', await page.locator('span:text-is("Verlaufsdiagramm")').count(), 0);
    await toggle('Luftfeuchtigkeit').click();
    await page.waitForTimeout(250);
    eq('Editor: Feuchte an', await opts(), JSON.stringify([undefined, undefined, true]));
    await toggle('Temperatur').click();
    await page.waitForTimeout(250);
    eq('Editor: nur Feuchte', await opts(), JSON.stringify([undefined, false, true]));
    await toggle('Luftfeuchtigkeit').click();
    await page.waitForTimeout(250);
    eq('Editor: beides aus = showChart false', await opts(), JSON.stringify([false, undefined, undefined]));
    await toggle('Temperatur').click();
    await page.waitForTimeout(250);
    eq('Editor: Temperatur wieder an = Vorgabe', await opts(), JSON.stringify([undefined, undefined, undefined]));
    await page.evaluate(() => window.__auraShot.setEditMode(false));
}

// 9. Altes Widget mit showChart false: im Editor sind beide Schalter aus
{
    await show({ showChart: false });
    const wid = `climchart${seq}`;
    await page.evaluate(() => window.__auraShot.setEditMode(true));
    await page.waitForTimeout(300);
    const card = page.locator(`.aura-widget-${wid}`).first();
    await card.hover();
    await card.locator('.aura-edit-chrome button').first().click();
    await page
        .locator('button:text-is("Bearbeiten")')
        .click()
        .catch(() => {});
    await page.waitForSelector('p:text-is("Verlauf")', { timeout: 10000 });
    const bg = (label) =>
        page
            .locator(`div.flex:has(> span:text-is("${label}")) > button`)
            .last()
            .evaluate((b) => b.style.background);
    eq('Alt-Widget: Temperatur-Schalter aus', await bg('Temperatur'), 'var(--app-border)');
    eq('Alt-Widget: Feuchte-Schalter aus', await bg('Luftfeuchtigkeit'), 'var(--app-border)');

    // 10. Die Überschrift jedes Werts trägt seinen „anzeigen“-Schalter (showX)
    const header = (label) => page.locator(`div.flex:has(> p:text-is("${label}")) button`).first();
    const shown = () =>
        page.evaluate((id) => {
            const o = window.__auraShot.widgetOptions(id) ?? {};
            return JSON.stringify([o.showActualTemp, o.showTargetTemp, o.showHumidity, o.showPressure]);
        }, wid);
    for (const label of ['Temperatur', 'Soll-Temperatur', 'Luftfeuchtigkeit', 'Luftdruck']) {
        await header(label).click();
        await page.waitForTimeout(200);
    }
    eq('Überschriften: alle vier Werte aus', await shown(), JSON.stringify([false, false, false, false]));
    await page.evaluate(() => window.__auraShot.setEditMode(false));
}

eq('keine Seitenfehler', pageErrors.length, 0);
await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `\n${failed.length} check(s) failed.` : '\nAll climate-chart checks passed.');
process.exit(failed.length ? 1 : 0);
