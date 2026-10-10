// The chart gallery: worked examples for "Diagramm (erweitert)" (echart) and
// "Diagramm (Verteilung)" (energiebilanz), each one answering real requests from the
// issue tracker.
//
// One entry is the single source for everything the gallery shows about it:
//   - `widget`  — exactly what lands in the export JSON (Editor → Importieren)
//   - `data()`  — the history, live values and objects the screenshot runs on
//   - `title`, `intro`, `issues`, `keys` — the text of the docs page
//
// tools/screenshots/chart-gallery.mjs renders the pictures, writes the JSON files and
// generates the pages; tools/tests/chart-gallery.mjs validates every widget against the
// widget schema, so an option renamed in the code fails the test instead of a user's import.
//
// Datapoint ids are `demo.0.*` on purpose: they name what the datapoint has to hold and
// cannot be mistaken for a real one. After an import they are replaced in the editor.
import * as D from './data.mjs';

const { NOW, DAY, HOUR } = D;
const MIN = 60_000;

// ── datapoints ───────────────────────────────────────────────────────────────
export const DP = {
    pvTotal: 'demo.0.PV.Ertrag_Gesamt',
    pvDay: 'demo.0.PV.Ertrag_Heute',
    pvPower: 'demo.0.PV.Leistung',
    pvForecast: 'demo.0.PV.Prognose_JSON',
    gridIn: 'demo.0.Netz.Bezug_Gesamt',
    gridOut: 'demo.0.Netz.Einspeisung_Gesamt',
    gridOutDay: 'demo.0.Netz.Einspeisung_Heute',
    battCharge: 'demo.0.Speicher.Laden_Gesamt',
    battChargeDay: 'demo.0.Speicher.Laden_Heute',
    battDischarge: 'demo.0.Speicher.Entladen_Gesamt',
    pvDirect: 'demo.0.Haus.PV_Direkt_Gesamt',
    pvDirectDay: 'demo.0.Haus.PV_Direkt_Heute',
    home: 'demo.0.Haus.Verbrauch_Gesamt',
    ev: 'demo.0.Wallbox.Geladen_Gesamt',
    load: 'demo.0.Haus.Leistung',
    loadBattery: 'demo.0.Haus.Leistung_aus_Speicher',
    loadGrid: 'demo.0.Haus.Leistung_aus_Netz',
    gas: 'demo.0.Gas.Zaehlerstand',
    outdoor: 'demo.0.Wetter.Aussentemperatur',
    burner: 'demo.0.Heizung.Brenner',
    flowTemp: 'demo.0.Heizung.Vorlauf',
    returnTemp: 'demo.0.Heizung.Ruecklauf',
    heatingCurve: 'demo.0.Heizung.Heizkurve_JSON',
    trafficDown: 'demo.0.Router.Download_Monate_JSON',
    trafficUp: 'demo.0.Router.Upload_Monate_JSON',
    rolling: 'demo.0.Wetter.Verlauf_JSON',
    bounded: 'demo.0.Skript.Auslastung_JSON',
    roomLiving: 'demo.0.Raum.Wohnzimmer.Temperatur',
    roomKitchen: 'demo.0.Raum.Kueche.Temperatur',
    roomBed: 'demo.0.Raum.Schlafzimmer.Temperatur',
    roomBath: 'demo.0.Raum.Bad.Temperatur',
    roomKids: 'demo.0.Raum.Kinderzimmer.Temperatur',
    cost: 'demo.0.Strom.Kosten_Jahr',
    budget: 'demo.0.Strom.Abschlag_Jahr',
};

// ── builders ─────────────────────────────────────────────────────────────────
function echart(title, series, options = {}, size = {}) {
    return {
        id: 'w-chart',
        type: 'echart',
        title,
        datapoint: series[0]?.datapointId ?? '',
        layout: 'default',
        gridPos: { x: 0, y: 0, w: size.w ?? 30, h: size.h ?? 12 },
        options: {
            echartMode: 'timeseries',
            autoHistoryInstance: true,
            echartShowLegend: series.length > 1,
            echartShowCurrent: true,
            ...options,
            echartSeries: series,
        },
    };
}

let seriesNo = 0;
function serie(name, datapointId, chartType, color, extra = {}) {
    return { id: `s${++seriesNo}`, name, datapointId, chartType, color, yAxisIndex: 0, ...extra };
}

function verteilung(title, bars, options = {}, size = {}) {
    return {
        id: 'w-verteilung',
        type: 'energiebilanz',
        title,
        datapoint: '',
        layout: 'default',
        gridPos: { x: 0, y: 0, w: size.w ?? 22, h: size.h ?? 13 },
        options: { unit: 'kWh', decimals: 1, ...options, bars },
    };
}

function entry(id, label, datapointId, color, icon, extra = {}) {
    return { id, label, datapointId, color, icon, aggregate: 'consumption', ...extra };
}

/** History window starting `days` back, with a margin for the bucket before it. */
const since = (days) => NOW - (days + 2) * DAY;

// ── examples ─────────────────────────────────────────────────────────────────
export const EXAMPLES = [
    // ── Zähler und Verbrauch ─────────────────────────────────────────────────
    {
        id: 'zaehler-tagesverbrauch',
        section: 'Zähler und Verbrauch',
        title: 'Zählerstand als Verbrauch pro Tag',
        issues: [521, 545],
        intro: 'Ein fortlaufender Zähler (Strom, Gas, Wasser, PV-Gesamtertrag) wird als Balken je Tag gezeichnet statt als steigende Linie.',
        keys: [
            ['echartSeries[].aggregate', '`delta`', 'Differenz je Zeiteinheit statt Zählerstand'],
            ['echartSeries[].deltaBucket', '`day`', 'ein Balken pro Tag'],
            ['echartRange', '`30d`', ''],
        ],
        widget: echart(
            'PV-Ertrag pro Tag',
            [
                serie('PV-Ertrag', DP.pvTotal, 'bar', 'var(--accent-yellow)', {
                    aggregate: 'delta',
                    deltaBucket: 'day',
                    decimals: 1,
                }),
            ],
            { echartRange: '30d', echartVisibleRanges: ['7d', '30d'], echartLeftUnit: 'kWh', decimals: 1 },
        ),
        data: () => ({
            history: { [DP.pvTotal]: D.totalSeries('pv', since(32), NOW, HOUR) },
            values: { [DP.pvTotal]: D.totalAt('pv', NOW) },
        }),
    },
    {
        id: 'tageszaehler-monatswerte',
        section: 'Zähler und Verbrauch',
        title: 'Tageszähler als Monatssummen',
        issues: [545, 562, 536],
        intro: 'Ein Zähler, der jede Nacht auf 0 springt (z. B. `lastDayData` eines Wechselrichters), ergibt trotzdem richtige Monatssummen. `auto` wählt die Zeiteinheit passend zum Zeitraum — 30 Tage zeigen Tagesbalken, 1 Jahr Monatsbalken.',
        keys: [
            ['echartSeries[].aggregate', '`delta`', 'der Sprung auf 0 um Mitternacht zählt als Reset, nicht als Minus'],
            [
                'echartSeries[].deltaBucket',
                '`auto`',
                'bis 45 Tage pro Tag, bis 180 Tage pro Woche, bis 1 Jahr pro Monat, darüber pro Jahr',
            ],
            ['echartVisibleRanges', '`["30d","1y"]`', 'Umschalter im Frontend'],
        ],
        widget: echart(
            'PV-Ertrag (Tageszähler)',
            [
                serie('PV-Ertrag', DP.pvDay, 'bar', 'var(--accent-yellow)', {
                    aggregate: 'delta',
                    deltaBucket: 'auto',
                    decimals: 0,
                }),
            ],
            {
                echartRange: '1y',
                echartVisibleRanges: ['30d', '1y'],
                echartLeftUnit: 'kWh',
                echartShowValues: true,
                decimals: 0,
            },
        ),
        data: () => ({
            history: { [DP.pvDay]: D.daySeries('pv', since(400), NOW, HOUR) },
            values: { [DP.pvDay]: D.dayAt('pv', NOW) },
        }),
    },
    {
        id: 'gesamt-jahreswerte',
        section: 'Zähler und Verbrauch',
        title: 'Jahreswerte über die ganze Historie',
        issues: [570, 280],
        intro: 'Zeitraum „Gesamt“ liest alles, was der History-Adapter hat; mit `auto` wird daraus ein Balken pro Kalenderjahr.',
        keys: [
            ['echartRange', '`total`', 'Fensterstart wird beim Adapter ermittelt'],
            ['echartSeries[].deltaBucket', '`auto`', 'ab 400 Tagen Historie pro Jahr'],
            ['echartShowValues', '`true`', 'Wert über jedem Balken'],
        ],
        widget: echart(
            'Erzeugung und Netzbezug je Jahr',
            [
                serie('PV-Erzeugung', DP.pvTotal, 'bar', 'var(--accent-yellow)', {
                    aggregate: 'delta',
                    deltaBucket: 'auto',
                }),
                serie('Netzbezug', DP.gridIn, 'bar', 'var(--accent-red)', { aggregate: 'delta', deltaBucket: 'auto' }),
            ],
            {
                echartRange: 'total',
                echartVisibleRanges: ['30d', '1y', 'total'],
                echartLeftUnit: 'kWh',
                echartShowValues: true,
                decimals: 0,
            },
        ),
        data: () => ({
            history: {
                [DP.pvTotal]: D.totalSeries('pv', D.ANCHOR, NOW, 6 * HOUR),
                [DP.gridIn]: D.totalSeries('gridIn', D.ANCHOR, NOW, 6 * HOUR),
            },
            values: { [DP.pvTotal]: D.totalAt('pv', NOW), [DP.gridIn]: D.totalAt('gridIn', NOW) },
        }),
    },
    {
        id: 'eigene-zeitraeume',
        section: 'Zähler und Verbrauch',
        title: 'Eigene Zeiträume in Monaten',
        issues: [709, 280],
        intro: 'Statt der eingebauten Knöpfe eigene Zeiträume nach Kalender — hier Monate und Jahre für den Gaszähler, mit eigener Beschriftung „Quartal“.',
        keys: [
            [
                'rangeChips',
                '`["1M","3M=Quartal","6M","12M","24M","total"]`',
                'Zahl + Einheit (h, d, w, M, y) oder total; Text nach `=` ist die Beschriftung',
            ],
            ['echartRange', '`custom` + `echartRangeCustomValue: 12`, `echartRangeCustomUnit: M`', 'Startzeitraum'],
            ['echartSeries[].deltaBucket', '`auto`', 'wechselt mit dem gewählten Chip'],
        ],
        widget: echart(
            'Gasverbrauch',
            [serie('Gas', DP.gas, 'bar', 'var(--accent)', { aggregate: 'delta', deltaBucket: 'auto', decimals: 0 })],
            {
                echartRange: 'custom',
                echartRangeCustomValue: 12,
                echartRangeCustomUnit: 'M',
                rangeChips: ['1M', '3M=Quartal', '6M', '12M', '24M', 'total'],
                echartLeftUnit: 'm³',
                decimals: 0,
            },
        ),
        data: () => ({ history: { [DP.gas]: D.gasSeries(since(400), NOW, HOUR) }, values: { [DP.gas]: D.gasAt(NOW) } }),
    },
    {
        id: 'vorjahresvergleich',
        section: 'Zähler und Verbrauch',
        title: 'Monatsverbrauch neben dem Vorjahr',
        issues: [730],
        intro: 'Zweite Serie auf denselben Datenpunkt, ein Jahr zurückversetzt — die Balken stehen je Monat nebeneinander.',
        keys: [
            ['echartSeries[1].timeShift', '`1`', 'im Editor: „+ Vorjahres-Serie anlegen“'],
            ['echartSeries[1].timeShiftUnit', '`year`', '`day` = gestern, `week` = Vorwoche, `month` = Vormonat'],
            [
                'echartSeries[].deltaBucket',
                '`month`',
                'bei beiden Serien gleich, sonst stehen die Balken nicht nebeneinander',
            ],
        ],
        widget: echart(
            'Gas je Monat',
            [
                serie('Dieses Jahr', DP.gas, 'bar', 'var(--accent)', { aggregate: 'delta', deltaBucket: 'month' }),
                serie('Vorjahr', DP.gas, 'bar', 'var(--text-secondary)', {
                    aggregate: 'delta',
                    deltaBucket: 'month',
                    timeShift: 1,
                    timeShiftUnit: 'year',
                }),
            ],
            { echartRange: '1y', lockRange: true, echartLeftUnit: 'm³', decimals: 0 },
        ),
        data: () => ({ history: { [DP.gas]: D.gasSeries(since(800), NOW, HOUR) }, values: { [DP.gas]: D.gasAt(NOW) } }),
    },
    {
        id: 'einspeisung-negativ',
        section: 'Zähler und Verbrauch',
        title: 'Bezug nach oben, Einspeisung nach unten',
        issues: [594],
        intro: 'Werte, die als positive Zahl geliefert werden (Einspeisung, Batterie laden), unter der Nulllinie zeichnen — gestapelt mit Bezug und Entladung.',
        keys: [
            ['echartSeries[].valueFactor', '`-1`', 'ƒx neben dem Datenpunkt → „Negativ darstellen (× −1)“'],
            ['echartSeries[].stack', '`true`', 'positive Serien stapeln nach oben, negative nach unten'],
            ['echartSeries[].aggregate', '`delta`', 'das Vorzeichen kommt nach der Differenz auf die Balken'],
        ],
        widget: echart(
            'Netz und Speicher je Tag',
            [
                serie('Netzbezug', DP.gridIn, 'bar', 'var(--accent-red)', {
                    aggregate: 'delta',
                    deltaBucket: 'day',
                    stack: true,
                }),
                serie('Speicher entladen', DP.battDischarge, 'bar', 'var(--accent)', {
                    aggregate: 'delta',
                    deltaBucket: 'day',
                    stack: true,
                }),
                serie('Einspeisung', DP.gridOut, 'bar', 'var(--accent-green)', {
                    aggregate: 'delta',
                    deltaBucket: 'day',
                    stack: true,
                    valueFactor: -1,
                }),
                serie('Speicher laden', DP.battCharge, 'bar', 'var(--accent-yellow)', {
                    aggregate: 'delta',
                    deltaBucket: 'day',
                    stack: true,
                    valueFactor: -1,
                }),
            ],
            {
                echartRange: '7d',
                echartVisibleRanges: ['7d', '30d'],
                echartLeftUnit: 'kWh',
                echartShowCurrent: false,
                decimals: 1,
            },
        ),
        data: () => ({
            history: Object.fromEntries(
                [
                    [DP.gridIn, 'gridIn'],
                    [DP.battDischarge, 'battDischarge'],
                    [DP.gridOut, 'gridOut'],
                    [DP.battCharge, 'battCharge'],
                ].map(([dp, c]) => [dp, D.totalSeries(c, since(32), NOW, HOUR)]),
            ),
            values: {},
        }),
    },

    {
        id: 'zeitraum-kennzahl',
        section: 'Zähler und Verbrauch',
        title: 'Einspeisung und Bezug des Zeitraums in der Legende',
        issues: [749],
        intro: 'Die Zählerstände als Kurve, dahinter in der Legende die Menge im gewählten Zeitraum — geht mit den Zeitraum-Knöpfen mit, kein zweites Widget nötig.',
        keys: [
            [
                'echartSeries[].periodValue',
                '`consumption`',
                'im Editor: Serie → „Verlauf“ → „Zeitraum-Kennzahl“ → „Verbrauch/Ertrag“',
            ],
            ['echartPeriodPlacement', '`legend`', '`row` = eigene Zeile über dem Diagramm'],
            ['echartVisibleRanges', '`24h` · `7d` · `30d`', 'die Zahl folgt dem gewählten Knopf'],
            [
                'echartSeries[1].yAxisIndex',
                '`1`',
                'zweiter Zähler auf der rechten Achse — sonst liegen beide Kurven flach',
            ],
        ],
        widget: echart(
            'Netz',
            [
                serie('Einspeisung', DP.gridOut, 'line', 'var(--accent-green)', { periodValue: 'consumption' }),
                serie('Bezug', DP.gridIn, 'line', 'var(--accent-red)', { periodValue: 'consumption', yAxisIndex: 1 }),
            ],
            {
                echartRange: '30d',
                echartVisibleRanges: ['24h', '7d', '30d'],
                echartLeftUnit: 'kWh',
                echartRightUnit: 'kWh',
                echartShowCurrent: false,
                decimals: 1,
            },
        ),
        data: () => ({
            history: Object.fromEntries(
                [
                    [DP.gridOut, 'gridOut'],
                    [DP.gridIn, 'gridIn'],
                ].map(([dp, c]) => [dp, D.totalSeries(c, since(32), NOW, HOUR)]),
            ),
            values: {},
        }),
    },

    // ── Darstellung ──────────────────────────────────────────────────────────
    {
        id: 'einheit-umrechnen',
        section: 'Darstellung',
        title: 'Watt in Kilowatt anzeigen',
        issues: [540],
        intro: 'Reine Anzeige-Umrechnung je Serie — der Datenpunkt und seine History bleiben in W. Gilt für Kurve, Tooltip und aktuellen Wert.',
        keys: [
            ['echartSeries[].valueTransform', '`w-kw`', 'Preset im ƒx-Dialog; setzt die Achsen-Einheit gleich mit'],
            ['echartSeries[].valueFactor', '`0.001`', 'Wert × Faktor + Offset'],
            ['echartLeftUnit', '`kW`', ''],
        ],
        widget: echart(
            'Hausverbrauch',
            [
                serie('Leistung', DP.load, 'area', 'var(--accent)', {
                    valueTransform: 'w-kw',
                    valueFactor: 0.001,
                    decimals: 2,
                }),
            ],
            { echartRange: '24h', echartVisibleRanges: ['6h', '24h', '7d'], echartLeftUnit: 'kW', decimals: 2 },
        ),
        data: () => ({
            history: { [DP.load]: D.loadSeries(since(2), NOW, 2 * MIN) },
            values: { [DP.load]: D.loadAt(NOW) },
        }),
    },
    {
        id: 'flaechen-stapeln',
        section: 'Darstellung',
        title: 'Flächen stapeln: woher der Strom kommt',
        issues: [541, 557],
        intro: 'Zwei Leistungen als Bänder übereinander — zusammen ergeben sie den Hausverbrauch. Der Tooltip zeigt zusätzlich die Summe.',
        keys: [
            ['echartSeries[].stack', '`true`', 'stapelt auf die anderen gestapelten Serien derselben Y-Achse'],
            ['echartSeries[].chartType', '`area`', 'gestapelte Flächen sind deckend gefüllt'],
            ['echartSeries[].areaOpacity', '`85`', 'optional weicher; `stackOutline` zeichnet die Bandkontur'],
        ],
        widget: echart(
            'Hausverbrauch nach Quelle',
            [
                serie('Aus dem Netz', DP.loadGrid, 'area', 'var(--accent-red)', { stack: true, areaOpacity: 85 }),
                serie('Aus dem Speicher', DP.loadBattery, 'area', 'var(--accent)', { stack: true, areaOpacity: 85 }),
            ],
            { echartRange: '24h', echartVisibleRanges: ['6h', '24h'], echartLeftUnit: 'W', decimals: 0 },
        ),
        data: () => ({
            history: {
                [DP.loadGrid]: D.gridCoverSeries(since(2), NOW, 5 * MIN),
                [DP.loadBattery]: D.batteryCoverSeries(since(2), NOW, 5 * MIN),
            },
            values: {},
        }),
    },
    {
        id: 'stapel-prozent',
        section: 'Darstellung',
        title: 'Anteile im Stapel in Prozent',
        issues: [569],
        intro: 'Woher der Tagesverbrauch kam — Wert und Anteil an der Tagessumme an jedem Balkenstück.',
        keys: [
            ['echartShowStackPercent', '`true`', 'erscheint im Editor, sobald eine Serie stapelt'],
            ['echartShowValues', 'aus', 'an: Wert und Anteil in Klammern — braucht breite Balken'],
            ['echartSeries[].stack', '`true`', ''],
        ],
        widget: echart(
            'Hausverbrauch nach Quelle je Tag',
            [
                serie('PV direkt', DP.pvDirect, 'bar', 'var(--accent-yellow)', {
                    aggregate: 'delta',
                    deltaBucket: 'day',
                    stack: true,
                }),
                serie('Speicher', DP.battDischarge, 'bar', 'var(--accent)', {
                    aggregate: 'delta',
                    deltaBucket: 'day',
                    stack: true,
                }),
                serie('Netz', DP.gridIn, 'bar', 'var(--accent-red)', {
                    aggregate: 'delta',
                    deltaBucket: 'day',
                    stack: true,
                }),
            ],
            {
                echartRange: 'custom',
                echartRangeCustomValue: 5,
                echartRangeCustomUnit: 'd',
                lockRange: true,
                echartShowStackPercent: true,
                echartShowCurrent: false,
                echartLeftUnit: 'kWh',
                decimals: 1,
            },
            { w: 34, h: 14 },
        ),
        data: () => ({
            history: {
                [DP.pvDirect]: D.totalSeries('pvDirect', since(8), NOW, HOUR),
                [DP.battDischarge]: D.totalSeries('battDischarge', since(8), NOW, HOUR),
                [DP.gridIn]: D.totalSeries('gridIn', since(8), NOW, HOUR),
            },
            values: {},
        }),
    },
    {
        id: 'balken-und-temperatur',
        section: 'Darstellung',
        title: 'Tagesverbrauch mit Temperaturkurve',
        issues: [598, 584, 600],
        intro: 'Balken links, Kurve rechts mit eigener Achse. Werte stehen nur an den Balken, jede Serie hat ihre eigenen Nachkommastellen.',
        keys: [
            ['echartSeries[1].yAxisIndex', '`1`', 'rechte Y-Achse mit eigener Einheit'],
            ['echartSeries[].showValues', '`true` / `false`', 'Werte je Serie statt fürs ganze Diagramm'],
            ['echartSeries[].decimals', '`1` / `0`', 'Nachkommastellen je Serie'],
        ],
        widget: echart(
            'Gas und Außentemperatur',
            [
                serie('Gas', DP.gas, 'bar', 'var(--accent)', {
                    aggregate: 'delta',
                    deltaBucket: 'day',
                    showValues: true,
                    decimals: 1,
                }),
                serie('Außentemperatur', DP.outdoor, 'line', 'var(--accent-red)', {
                    yAxisIndex: 1,
                    showValues: false,
                    decimals: 0,
                    smooth: true,
                }),
            ],
            { echartRange: '7d', echartVisibleRanges: ['7d', '30d'], echartLeftUnit: 'm³', echartRightUnit: '°C' },
        ),
        data: () => ({
            history: {
                [DP.gas]: D.gasSeries(since(9), NOW, HOUR),
                [DP.outdoor]: D.outdoorSeries(since(9), NOW, 30 * MIN),
            },
            values: { [DP.gas]: D.gasAt(NOW), [DP.outdoor]: D.outdoorAt(NOW) },
        }),
    },
    {
        id: 'achse-datenbereich',
        section: 'Darstellung',
        title: 'Y-Achse auf den Datenbereich zoomen',
        issues: [83],
        intro: 'Die Achse beginnt und endet bei den tatsächlich vorkommenden Werten statt bei runden Grenzen — kleine Schwankungen werden sichtbar.',
        keys: [
            ['echartLeftMin', '`dataMin`', 'Zahl, `dataMin` oder leer (automatisch)'],
            ['echartLeftMax', '`dataMax`', ''],
            [
                'echartLeftMinDp / echartLeftMaxDp',
                'Datenpunkt',
                'Grenze aus einem Datenpunkt, gewinnt über die feste Eingabe',
            ],
        ],
        widget: echart(
            'Außentemperatur',
            [serie('Außen', DP.outdoor, 'line', 'var(--accent-red)', { smooth: true, decimals: 1 })],
            {
                echartRange: '7d',
                echartVisibleRanges: ['24h', '7d'],
                echartLeftUnit: '°C',
                echartLeftMin: 'dataMin',
                echartLeftMax: 'dataMax',
                decimals: 1,
            },
        ),
        data: () => ({
            history: { [DP.outdoor]: D.outdoorSeries(since(8), NOW, 30 * MIN) },
            values: { [DP.outdoor]: D.outdoorAt(NOW) },
        }),
    },
    {
        id: 'schaltzustand-mit-temperatur',
        section: 'Darstellung',
        title: 'Brenner An/Aus neben Vorlauf und Rücklauf',
        issues: [718],
        intro: 'Ein boolescher Datenpunkt als Treppe auf der rechten Achse, beschriftet mit „An“/„Aus“ statt 1/0.',
        keys: [
            ['echartSeries[].step', '`true`', 'Wert hält bis zum nächsten; bei booleschen Datenpunkten automatisch'],
            ['echartSeries[].valueLabels', '`0=Aus; 1=An`', 'Text statt Zahl in Achse, Tooltip und aktuellem Wert'],
            ['echartSeries[].aggregate', 'leer', 'boolesche Werte werden mit `max` gebündelt'],
        ],
        widget: echart(
            'Heizung',
            [
                serie('Vorlauf', DP.flowTemp, 'line', 'var(--accent-red)', { decimals: 1 }),
                serie('Rücklauf', DP.returnTemp, 'line', 'var(--accent)', { decimals: 1 }),
                serie('Brenner', DP.burner, 'area', 'var(--accent-yellow)', {
                    yAxisIndex: 1,
                    step: true,
                    valueLabels: '0=Aus; 1=An',
                    areaOpacity: 25,
                }),
            ],
            { echartRange: '6h', echartVisibleRanges: ['6h', '24h'], echartLeftUnit: '°C' },
        ),
        data: () => ({
            history: {
                [DP.flowTemp]: D.flowTempSeries(since(1), NOW, 2 * MIN),
                [DP.returnTemp]: D.returnTempSeries(since(1), NOW, 2 * MIN),
                [DP.burner]: D.burnerSeries(since(1), NOW, MIN).map(([ts, v]) => [ts, v === 1]),
            },
            values: { [DP.burner]: D.burnerAt(NOW) === 1 },
        }),
    },
    {
        id: 'kompakt-ohne-achsen',
        section: 'Darstellung',
        title: 'Kompakt: Treppenlinie ohne Achsen',
        issues: [282, 240],
        intro: 'Ein schmaler Verlauf als Hintergrund für den aktuellen Wert — ohne Achsen, Legende und Gitter.',
        keys: [
            ['echartShowXAxis / echartShowYAxis', '`false`', ''],
            ['echartShowGridLines', '`false`', ''],
            ['echartSeries[].step', '`true`', 'Treppe statt Linie'],
        ],
        widget: echart(
            'Hausverbrauch',
            [serie('Leistung', DP.load, 'area', 'var(--accent)', { step: true, decimals: 0 })],
            {
                echartRange: '6h',
                lockRange: true,
                echartShowXAxis: false,
                echartShowYAxis: false,
                echartShowGridLines: false,
                echartShowLegend: false,
                echartLeftUnit: 'W',
                decimals: 0,
            },
            { w: 18, h: 7 },
        ),
        data: () => ({
            history: { [DP.load]: D.loadSeries(since(1), NOW, 5 * MIN) },
            values: { [DP.load]: D.loadAt(NOW) },
        }),
    },
    {
        id: 'vergleich-aktuelle-werte',
        section: 'Darstellung',
        title: 'Aktuelle Werte nebeneinander',
        issues: [200, 253, 742],
        intro: 'Modus Vergleich: ein Balken je Datenpunkt mit seinem aktuellen Wert — ohne History.',
        keys: [
            ['echartMode', '`comparison`', 'im Editor „Vergleich“'],
            ['echartShowValues', '`true`', 'Wert über jedem Balken'],
            ['echartSeries[].name', 'Raumname', 'steht an der X-Achse'],
        ],
        widget: echart(
            'Raumtemperaturen',
            [
                serie('Wohnzimmer', DP.roomLiving, 'bar', 'var(--accent)'),
                serie('Küche', DP.roomKitchen, 'bar', 'var(--accent)'),
                serie('Schlafzimmer', DP.roomBed, 'bar', 'var(--accent)'),
                serie('Bad', DP.roomBath, 'bar', 'var(--accent-red)'),
                serie('Kinderzimmer', DP.roomKids, 'bar', 'var(--accent)'),
            ],
            {
                echartMode: 'comparison',
                autoHistoryInstance: false,
                echartShowLegend: false,
                echartShowValues: true,
                echartShowCurrent: false,
                echartLeftUnit: '°C',
                echartLeftMin: 15,
                decimals: 1,
            },
        ),
        data: () => ({
            history: {},
            values: {
                [DP.roomLiving]: 21.4,
                [DP.roomKitchen]: 20.1,
                [DP.roomBed]: 17.8,
                [DP.roomBath]: 23.2,
                [DP.roomKids]: 20.6,
            },
        }),
    },

    // ── JSON-Datenpunkte ─────────────────────────────────────────────────────
    {
        id: 'json-kategorien',
        section: 'JSON-Datenpunkte',
        title: 'Monatswerte aus JSON-Datenpunkten',
        issues: [543, 509, 713],
        intro: 'Ein Skript schreibt `[{"label":"Jan","value":312.5}, …]` in einen Datenpunkt — die Beschriftungen werden zur X-Achse, mehrere Serien richten sich nach gleichen Beschriftungen aus.',
        keys: [
            ['echartMode', '`json`', 'im Editor „Kategorien (JSON)“'],
            ['echartSeries[].source', '`json`', ''],
            ['echartSeries[].jsonLabelKey / jsonValueKey', 'leer', 'der Editor erkennt die Felder selbst'],
        ],
        widget: echart(
            'Router-Datenvolumen',
            [
                serie('Download', DP.trafficDown, 'bar', 'var(--accent)', { source: 'json' }),
                serie('Upload', DP.trafficUp, 'bar', 'var(--accent-green)', { source: 'json' }),
            ],
            {
                echartMode: 'json',
                autoHistoryInstance: false,
                echartShowValues: true,
                echartShowCurrent: false,
                echartLeftUnit: 'GB',
                decimals: 0,
            },
            { w: 34, h: 13 },
        ),
        data: () => ({
            history: {},
            values: { [DP.trafficDown]: D.trafficJson('down'), [DP.trafficUp]: D.trafficJson('up') },
        }),
        sample: () => D.trafficJson('down'),
    },
    {
        id: 'json-erster-wert',
        section: 'JSON-Datenpunkte',
        title: 'Rollierende Liste: neuester Wert vorne',
        issues: [549],
        intro: 'Steht der neueste Eintrag zuerst im JSON, nimmt der aktuelle Wert oben den ersten statt den letzten Punkt.',
        keys: [
            ['echartCurrentFrom', '`first`', 'Standard `last`'],
            ['echartCurrentAlign', '`left`', 'Block links, über dem neuesten Punkt'],
            ['echartMode', '`json`', ''],
        ],
        widget: echart(
            'Temperatur der letzten 24 h',
            [serie('Außen', DP.rolling, 'line', 'var(--accent-red)', { source: 'json', smooth: true, decimals: 1 })],
            {
                echartMode: 'json',
                autoHistoryInstance: false,
                echartCurrentFrom: 'first',
                echartCurrentAlign: 'left',
                echartLeftUnit: '°C',
                decimals: 1,
            },
        ),
        data: () => ({ history: {}, values: { [DP.rolling]: D.rollingTempJson() } }),
        sample: () => D.rollingTempJson(),
    },
    {
        id: 'json-prognose',
        section: 'JSON-Datenpunkte',
        title: 'Messwerte plus Solarprognose',
        issues: [595, 509],
        intro: 'Verlauf aus dem History-Adapter und eine Prognose aus einem JSON-Datenpunkt in einem Diagramm — die Zeitachse reicht über „jetzt“ hinaus bis zum Ende der Prognose.',
        keys: [
            ['echartSeries[0].source', '`history`', 'Messwerte; Zeitraum-Umschalter wirkt nur hierauf'],
            ['echartSeries[1].source', '`json`', 'Beschriftungen müssen Zeitstempel sein (ms, s oder ISO)'],
            ['echartMode', '`timeseries`', ''],
        ],
        widget: echart(
            'PV-Leistung und Prognose',
            [
                serie('Gemessen', DP.pvPower, 'area', 'var(--accent-yellow)', { decimals: 0 }),
                serie('Prognose', DP.pvForecast, 'line', 'var(--text-secondary)', { source: 'json', decimals: 0 }),
            ],
            { echartRange: '24h', lockRange: true, echartShowCurrent: false, echartLeftUnit: 'W', decimals: 0 },
        ),
        data: () => ({
            history: { [DP.pvPower]: D.pvPowerSeries(since(1), NOW, 10 * MIN) },
            values: { [DP.pvForecast]: D.forecastJson() },
        }),
        sample: () => D.forecastJson(),
    },
    {
        id: 'json-heizkurve',
        section: 'JSON-Datenpunkte',
        title: 'Heizkurve aus JSON mit eigenen Feldnamen',
        issues: [703],
        intro: 'Die X-Achse muss keine Zeit sein: Vorlauftemperatur über der Außentemperatur, Feldnamen frei gewählt.',
        keys: [
            ['echartSeries[].jsonLabelKey', '`aussentemperatur`', 'X-Beschriftung'],
            ['echartSeries[].jsonValueKey', '`vorlauftemperatur`', 'Y-Wert'],
            ['echartLeftMin / echartLeftMax', '`20` / `50`', 'feste Skala'],
        ],
        widget: echart(
            'Heizkurve',
            [
                serie('Vorlauf', DP.heatingCurve, 'area', 'var(--accent-red)', {
                    source: 'json',
                    jsonLabelKey: 'aussentemperatur',
                    jsonValueKey: 'vorlauftemperatur',
                    showValues: true,
                    decimals: 1,
                }),
            ],
            {
                echartMode: 'json',
                autoHistoryInstance: false,
                echartShowCurrent: false,
                echartLeftUnit: '°C',
                echartLeftMin: 20,
                echartLeftMax: 50,
                decimals: 1,
            },
        ),
        data: () => ({ history: {}, values: { [DP.heatingCurve]: D.heatingCurveJson() } }),
        sample: () => D.heatingCurveJson(),
    },
    {
        id: 'json-achsgrenzen',
        section: 'JSON-Datenpunkte',
        title: 'Achsengrenzen aus dem JSON',
        issues: [550],
        intro: 'Das Skript liefert neben den Daten die Grenzen der Y-Achse mit — die Achse skaliert nach dem Skript, hier fest 0–100 %.',
        keys: [
            ['echartJsonAxisBounds', '`true`', 'min/max-Block im Datenpunkt übernehmen'],
            ['echartSeries[].jsonPath', '`data`', 'Pfad zum Array'],
            ['echartSeries[].jsonAxisPath', 'leer', 'Block wird gesucht (`axis`, `yAxis`, `range` …)'],
        ],
        widget: echart(
            'CPU-Auslastung',
            [
                serie('Auslastung', DP.bounded, 'area', 'var(--accent)', {
                    source: 'json',
                    jsonPath: 'data',
                    decimals: 0,
                }),
            ],
            {
                echartMode: 'json',
                autoHistoryInstance: false,
                echartJsonAxisBounds: true,
                echartLeftUnit: '%',
                decimals: 0,
            },
        ),
        data: () => ({ history: {}, values: { [DP.bounded]: D.boundedJson() } }),
        sample: () => D.boundedJson(),
    },

    // ── Diagramm (Verteilung) ────────────────────────────────────────────────
    {
        id: 'vt-energiebilanz',
        section: 'Verteilung',
        title: 'Energiebilanz: Erzeugung gegen Verbrauch',
        issues: [404],
        intro: 'Zwei Gruppen — woher die Energie kam und wohin sie ging. Jeder Eintrag rechnet den Zuwachs seines Zählers im Zeitraum aus, beide Seiten ergeben dieselbe Summe.',
        keys: [
            ['bars[]', '2 Gruppen', 'je Gruppe ein Balken'],
            ['bars[].entries[].aggregate', '`consumption`', 'Zuwachs des Zählers im Zeitraum'],
            ['legendSide', '`left` / `right`', 'je Gruppe'],
        ],
        widget: verteilung(
            'Energiebilanz',
            [
                {
                    id: 'g-erz',
                    title: 'Erzeugung',
                    legendSide: 'left',
                    entries: [
                        entry('e-pv', 'PV', DP.pvTotal, 'var(--accent-yellow)', 'Sun'),
                        entry('e-sp', 'Speicher', DP.battDischarge, 'var(--accent)', 'BatteryCharging'),
                        entry('e-nb', 'Netz', DP.gridIn, 'var(--accent-red)', 'Zap'),
                    ],
                },
                {
                    id: 'g-ver',
                    title: 'Verbrauch',
                    legendSide: 'right',
                    entries: [
                        entry('e-haus', 'Haus', DP.home, 'var(--accent-green)', 'House'),
                        entry('e-ev', 'Wallbox', DP.ev, 'var(--accent)', 'Car'),
                        entry('e-lad', 'Speicher', DP.battCharge, 'var(--accent-yellow)', 'BatteryFull'),
                        entry('e-ein', 'Einspeisung', DP.gridOut, 'var(--text-secondary)', 'Zap'),
                    ],
                },
            ],
            { range: '7d', visibleRanges: ['24h', '7d', '30d'], showSegmentIcon: true, legendFormat: 'icon-value' },
        ),
        data: () => ({
            history: Object.fromEntries(
                [
                    [DP.pvTotal, 'pv'],
                    [DP.battDischarge, 'battDischarge'],
                    [DP.gridIn, 'gridIn'],
                    [DP.home, 'home'],
                    [DP.ev, 'ev'],
                    [DP.battCharge, 'battCharge'],
                    [DP.gridOut, 'gridOut'],
                ].map(([dp, c]) => [dp, D.totalSeries(c, since(32), NOW, HOUR)]),
            ),
            values: {},
        }),
    },
    {
        id: 'vt-zeitraum-summe',
        section: 'Verteilung',
        title: 'Verbrauch/Ertrag im gewählten Zeitraum',
        issues: [749, 479],
        intro: 'Die Differenz zwischen Anfang und Ende des Zeitraums als Zahl — je Zähler eine eigene Gruppe, damit jede ihre eigene Summe zeigt.',
        keys: [
            [
                'bars[].entries[].aggregate',
                '`consumption`',
                'Ende minus Anfang; bleibt richtig, wenn der Zähler zurückspringt',
            ],
            ['showTotals / showPercent', '`true` / `false`', 'Summe über dem Balken, keine 100 %'],
            ['visibleRanges', '`["24h","7d","30d"]`', 'Umschalter im Frontend'],
        ],
        widget: verteilung(
            'Netz im Zeitraum',
            [
                {
                    id: 'g-bezug',
                    title: 'Bezug',
                    entries: [entry('e-bezug', 'Bezug', DP.gridIn, 'var(--accent-red)', 'Zap')],
                },
                {
                    id: 'g-einsp',
                    title: 'Einspeisung',
                    entries: [entry('e-einsp', 'Einspeisung', DP.gridOut, 'var(--accent-green)', 'Zap')],
                },
            ],
            {
                range: '30d',
                visibleRanges: ['24h', '7d', '30d'],
                showTotals: true,
                showPercent: false,
                legendFormat: 'label-value',
            },
            { w: 15, h: 12 },
        ),
        data: () => ({
            history: {
                [DP.gridIn]: D.totalSeries('gridIn', since(32), NOW, HOUR),
                [DP.gridOut]: D.totalSeries('gridOut', since(32), NOW, HOUR),
            },
            values: {},
        }),
    },
    {
        id: 'vt-tageszaehler',
        section: 'Verteilung',
        title: 'Anteile aus Tageszählern',
        issues: [561],
        intro: 'Wohin der PV-Strom der letzten 7 Tage ging — aus Zählern, die jede Nacht auf 0 springen. `consumption` summiert die Anstiege, der Reset zählt nicht.',
        keys: [
            ['bars[].entries[].aggregate', '`consumption`', '`delta` würde hier negativ'],
            ['chartStyle', '`pie`', '`bars`, `pie` oder `donut`'],
            ['legendFormat', '`icon-label-value`', ''],
        ],
        widget: verteilung(
            'PV-Strom der letzten 7 Tage',
            [
                {
                    id: 'g-pv',
                    title: 'PV',
                    legendSide: 'right',
                    entries: [
                        entry('e-direkt', 'Ins Haus', DP.pvDirectDay, 'var(--accent-green)', 'House'),
                        entry('e-batt', 'In den Speicher', DP.battChargeDay, 'var(--accent)', 'BatteryFull'),
                        entry('e-netz', 'Ins Netz', DP.gridOutDay, 'var(--accent-yellow)', 'Zap'),
                    ],
                },
            ],
            {
                range: '7d',
                lockRange: true,
                chartStyle: 'pie',
                pieSize: 180,
                legendFormat: 'icon-label-value',
                showSegmentIcon: true,
            },
            { w: 18, h: 11 },
        ),
        data: () => ({
            history: {
                [DP.pvDirectDay]: D.daySeries('pvDirect', since(9), NOW, HOUR),
                [DP.battChargeDay]: D.daySeries('battCharge', since(9), NOW, HOUR),
                [DP.gridOutDay]: D.daySeries('gridOut', since(9), NOW, HOUR),
            },
            values: {},
        }),
    },
    {
        id: 'vt-budget',
        section: 'Verteilung',
        title: 'Abschlag: wie viel ist verbraucht?',
        issues: [596],
        intro: 'Eine Gruppe mit Vorgabe aus einem Datenpunkt (der Jahresabschlag) — der Balken füllt sich von unten, der Rest heißt „Offen“, ab 90 % wechselt die Farbe.',
        keys: [
            ['bars[].totalDatapoint', 'Datenpunkt', '100 %-Bezug; alternativ fest `totalValue`'],
            ['bars[].overActive / overThreshold', '`true` / `90`', 'Warnfarbe ab 90 % der Vorgabe'],
            ['barDirection', '`up`', 'füllt von unten wie ein Tank'],
        ],
        widget: verteilung(
            'Stromkosten 2026',
            [
                {
                    id: 'g-kosten',
                    title: 'Abschlag',
                    totalDatapoint: DP.budget,
                    restLabel: 'Offen',
                    overActive: true,
                    overThreshold: 90,
                    entries: [entry('e-kosten', 'Verbraucht', DP.cost, 'var(--accent)', 'Euro', { aggregate: 'last' })],
                },
            ],
            { unit: '€', decimals: 0, range: '24h', lockRange: true, barDirection: 'up', legendFormat: 'label-value' },
            { w: 12, h: 13 },
        ),
        data: () => ({ history: {}, values: { [DP.cost]: 1486, [DP.budget]: 1600 } }),
    },
];

/** Sections in page order, per widget. */
export const PAGES = [
    {
        file: 'beispiele-diagramm-erweitert',
        title: 'Beispiele: Diagramm (erweitert)',
        widgetPage: './diagramm-erweitert',
        widgetLabel: 'Diagramm (erweitert)',
        sections: ['Zähler und Verbrauch', 'Darstellung', 'JSON-Datenpunkte'],
    },
    {
        file: 'beispiele-verteilung',
        title: 'Beispiele: Diagramm (Verteilung)',
        widgetPage: './verteilung',
        widgetLabel: 'Diagramm (Verteilung)',
        sections: ['Verteilung'],
    },
];
