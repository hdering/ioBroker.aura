'use strict';

/**
 * Worked examples of AURA widgets, handed out by aura_recipes.
 *
 * The schema says what is *allowed*. Nothing in it said what is *good*, and the
 * result was reproducible: faced with autolist's 115 documented options, in no
 * particular order and without a single example, a model fills the required
 * fields and stops. Whole rooms came out as a row of bare value widgets while
 * conditions, colour thresholds, second lines and the list displays sat in the
 * schema unused.
 *
 * A complete, valid widget is the one input a model reuses well, so that is what
 * this file holds — not prose about good design. Each recipe is the finished
 * JSON of something worth building, with the surrounding options that make it
 * readable, and a note on which cheaper construction it replaces.
 *
 * Datapoint ids are %…% placeholders on purpose. A recipe carrying
 * plausible-looking real ids would get written verbatim, which is exactly the
 * failure the instructions warn about; a placeholder cannot be mistaken for an
 * id, and aura_validate names it when one survives.
 */

/** Marks every value the model has to replace before writing. */
const PLACEHOLDER = /%[^%\s]+%/g;

const RECIPES = [
    {
        id: 'raum-liste',
        title: 'Raumliste statt vieler Einzelkacheln',
        when: 'Mehrere Geräte eines Raums oder eines Gewerks auf einmal — Licht, Steckdosen, Sensoren.',
        instead: 'sechs bis zehn einzelne value- oder switch-Kacheln nebeneinander',
        notes: [
            'Die Zeilen kommen aus Raum + Gewerk, nicht aus einer gepflegten Liste: neue Geräte erscheinen von selbst.',
            'entryDisplay setzt die Darstellung für alle Zeilen; displayType "auto" wählt pro Datenpunkt Schalter, Regler oder Wert.',
            'rowConditions gilt für JEDE Zeile. Ein leerer clause-datapoint meint den Wert der Zeile selbst, sonst darf die Klausel {{parent}} / {{dp}} / {{name}} benutzen und wird pro Zeile aufgelöst.',
            'subDpTemplate hängt an jede Zeile eine zweite Zeile — hier der Batteriestand, versteckt wo es ihn nicht gibt.',
            'namePattern kürzt die Beschriftung; Platzhalter sind <Raum> <Gerät> <DPName> <Name> <ID>.',
        ],
        widgets: [
            {
                id: 'w-raum-liste',
                type: 'autolist',
                title: '%Raumname%',
                datapoint: '',
                layout: 'default',
                gridPos: { x: 0, y: 0, w: 6, h: 8 },
                options: {
                    filterRooms: '%Raumname%',
                    filterFuncs: 'Licht,Steckdose',
                    filterRelevant: true,
                    namePattern: '<Gerät>',
                    showDividers: true,
                    hideFilterButton: true,
                    entryIcon: 'mdi:lightbulb-outline',
                    entryIconSize: 20,
                    entryDisplay: { displayType: 'auto' },
                    sortRules: [{ source: 'name', order: 'asc', mode: 'text' }],
                    subDpTemplate: [
                        {
                            id: '{{parent}}.BATTERY',
                            align: 'right',
                            icon: 'mdi:battery-outline',
                            unit: '%',
                            decimals: 0,
                            fontSize: 9,
                        },
                    ],
                    subDpTemplateHideMissing: true,
                    rowConditions: [
                        {
                            id: 'cond-an',
                            label: 'eingeschaltet',
                            logic: 'AND',
                            clauses: [{ datapoint: '', operator: 'true', value: '' }],
                            target: 'icon',
                            iconColor: 'var(--accent-yellow)',
                        },
                    ],
                    showCount: true,
                },
            },
        ],
    },
    {
        id: 'zeilenregel',
        title: 'Eine Regel für alle Zeilen statt einer Regel je Zeile',
        when: 'Jede Zeile einer Liste soll nach demselben Muster reagieren — Betriebsart, Störung, Fenster offen, Batterie leer.',
        instead:
            'einer eigenen Bedingung je Zeile (sechzehn Geräte = sechzehn Regeln, die alle mitgepflegt werden müssen)',
        notes: [
            'rowConditions gilt für JEDE Zeile. Der Datenpunkt der Klausel wird pro Zeile aufgelöst, deshalb ' +
                'beschreibt EINE Regel das ganze Muster.',
            'Die Platzhalter: {{parent}} = der Strang über dem Datenpunkt der Zeile (aus "hm-rpc.0.ABC.1.STATE" ' +
                'wird "hm-rpc.0.ABC.1"), {{dp}} = der Datenpunkt der Zeile selbst, {{name}} = ihr Name. ' +
                'Ein LEERER clause-datapoint meint den Wert der Zeile.',
            'Mehrere Regeln in rowConditions werden von oben nach unten angewandt; die letzte zutreffende ' +
                'gewinnt je Feld. Eine Bedingung am Eintrag selbst (entries[].conditions) wird danach ' +
                'angewandt und schlägt die Zeilenregel — der Sonderfall bleibt also möglich.',
            'target sagt, WAS gefärbt wird: "icon", "name", "value" oder "row" (die ganze Zeile).',
            'Farben als var(--token), nicht als Hex-Wert — aura_theme nennt die Token dieses Dashboards.',
            'Prüfen lässt sich das nur am fertigen Widget: aura_measure liefert die URL des Tabs mit.',
        ],
        widgets: [
            {
                id: 'w-zeilenregel',
                type: 'autolist',
                title: 'Heizkörper',
                datapoint: '',
                layout: 'default',
                gridPos: { x: 0, y: 0, w: 8, h: 10 },
                options: {
                    filterFuncs: 'Heizung',
                    filterRelevant: true,
                    namePattern: '<Raum>',
                    entryDisplay: { displayType: 'auto' },
                    hideFilterButton: true,
                    sortRules: [{ source: 'name', order: 'asc', mode: 'text' }],
                    rowConditions: [
                        {
                            id: 'rc-boost',
                            label: 'Boost',
                            logic: 'AND',
                            clauses: [{ datapoint: '{{parent}}.CONTROL_MODE', operator: '==', value: '3' }],
                            target: 'row',
                            icon: 'mdi:fire',
                            color: 'var(--accent-red)',
                        },
                        {
                            id: 'rc-manu',
                            label: 'Handbetrieb',
                            logic: 'AND',
                            clauses: [{ datapoint: '{{parent}}.CONTROL_MODE', operator: '==', value: '1' }],
                            target: 'icon',
                            icon: 'mdi:hand-back-right',
                            iconColor: 'var(--accent-yellow)',
                        },
                        {
                            id: 'rc-fenster',
                            label: 'Fenster offen',
                            logic: 'AND',
                            clauses: [{ datapoint: '{{parent}}.WINDOW_STATE', operator: 'true', value: '' }],
                            target: 'row',
                            bg: 'var(--app-bg)',
                            icon: 'mdi:window-open-variant',
                            color: 'var(--accent)',
                        },
                    ],
                    subDpTemplate: [
                        {
                            id: '{{parent}}.ACTUAL_TEMPERATURE',
                            align: 'right',
                            unit: '°C',
                            decimals: 1,
                            fontSize: 9,
                        },
                    ],
                    subDpTemplateHideMissing: true,
                    maxRows: 8,
                },
            },
        ],
    },
    {
        id: 'geraete-liste',
        title: 'Gepflegte Liste mit gemischten Bedienelementen',
        when: 'Eine feste Auswahl von Geräten, die jeweils anders bedient werden — Schalter, Dimmer, Rollladen.',
        instead: 'je einem eigenen Widget pro Gerät',
        notes: [
            'Jede Zeile wählt ihren displayType selbst und bekommt dazu die Optionen des jeweiligen Widgets.',
            'divider: true macht aus einer Zeile eine Überschrift; sie braucht keinen Datenpunkt.',
            'conditions auf der Zeile färbt nur diese Zeile, rowConditions auf dem Widget gilt für alle.',
            'Die Datenpunkt-Id IST das Feld "id" der Zeile — es gibt kein eigenes datapoint-Feld je Eintrag. Trennzeilen bekommen eine synthetische id divider:<n>.',
        ],
        widgets: [
            {
                id: 'w-geraete-liste',
                type: 'list',
                title: 'Wohnzimmer',
                datapoint: '',
                layout: 'default',
                gridPos: { x: 0, y: 0, w: 6, h: 8 },
                options: {
                    showDividers: true,
                    entries: [
                        { id: 'divider:1', divider: true, dividerLabel: 'Licht' },
                        {
                            id: '%dp.deckenlampe%',
                            label: 'Deckenlampe',
                            displayType: 'switch',
                            icon: 'mdi:ceiling-light',
                            switchStyle: 'slide',
                        },
                        {
                            id: '%dp.stehlampe.dimmer%',
                            label: 'Stehlampe',
                            displayType: 'slider',
                            icon: 'mdi:floor-lamp',
                            unit: '%',
                            sliderMin: 0,
                            sliderMax: 100,
                            sliderStep: 1,
                            sliderShowValue: true,
                            sliderShowUnit: true,
                            sliderCommitOnRelease: true,
                        },
                        { id: 'divider:2', divider: true, dividerLabel: 'Beschattung' },
                        {
                            id: '%dp.rollladen.level%',
                            label: 'Rollladen',
                            displayType: 'shutter',
                            icon: 'mdi:window-shutter',
                            shutterMode: 'position',
                            shutterShowSlider: true,
                            shutterShowClosedPercent: true,
                        },
                        {
                            id: '%dp.temperatur%',
                            label: 'Temperatur',
                            displayType: 'value',
                            icon: 'mdi:thermometer',
                            unit: '°C',
                            decimals: 1,
                            colorThresholds: [
                                [18, 'var(--accent)'],
                                [24, 'var(--accent-green)'],
                                [99, 'var(--accent-red)'],
                            ],
                            subDps: [
                                {
                                    id: '%dp.luftfeuchte%',
                                    align: 'right',
                                    icon: 'mdi:water-percent',
                                    unit: '%',
                                    decimals: 0,
                                },
                            ],
                        },
                    ],
                },
            },
        ],
    },
    {
        id: 'wert-kachel',
        title: 'Wertkachel, die etwas aussagt',
        when: 'Ein einzelner Messwert soll wirklich als eigene Kachel stehen.',
        instead: 'einer nackten value-Kachel, die nur eine Zahl zeigt',
        notes: [
            'colorThresholds färbt den Wert nach Höhe: [Obergrenze, Farbe], aufsteigend sortiert.',
            'conditions arbeitet auf dem ganzen Widget — effect "border" pulst nur den Rahmen, der Inhalt bleibt lesbar.',
            'elements setzt Titel, Icon oder Wert einzeln: Text, Farbe, Größe, Sichtbarkeit. Schlüssel sind title, icon, value.',
            'badges markieren die Ecke, hier nur solange die Klausel zutrifft.',
        ],
        widgets: [
            {
                id: 'w-wert',
                type: 'value',
                title: 'Außentemperatur',
                datapoint: '%dp.aussentemperatur%',
                layout: 'default',
                gridPos: { x: 0, y: 0, w: 4, h: 3 },
                options: {
                    unit: '°C',
                    decimals: 1,
                    icon: 'mdi:thermometer',
                    iconSize: 28,
                    showValue: true,
                    colorThresholds: [
                        [0, 'var(--accent)'],
                        [18, 'var(--accent-green)'],
                        [28, 'var(--accent-yellow)'],
                        [99, 'var(--accent-red)'],
                    ],
                    conditions: [
                        {
                            id: 'cond-frost',
                            label: 'Frost',
                            logic: 'AND',
                            clauses: [{ datapoint: '%dp.aussentemperatur%', operator: '<', value: '0' }],
                            style: { ringColor: 'var(--accent)' },
                            effect: 'border',
                            elements: {
                                icon: { icon: 'mdi:snowflake', color: 'var(--accent)' },
                                title: { text: 'Frostgefahr', bold: true },
                            },
                        },
                    ],
                    badges: [
                        {
                            id: 'badge-frost',
                            style: 'dot',
                            corner: 'top-right',
                            color: 'var(--accent)',
                            visibility: 'condition',
                            logic: 'AND',
                            clauses: [{ datapoint: '%dp.aussentemperatur%', operator: '<', value: '0' }],
                        },
                    ],
                },
            },
        ],
    },
    {
        id: 'verbrauch',
        title: 'Verbrauchsbalken pro Tag, Monat, Jahr',
        when: 'Ein Zähler (Strom, Gas, Wasser) soll als Verbrauch je Zeitraum erscheinen, nicht als Zählerstand.',
        instead: 'einer Linie, die nur den steigenden Zählerstand zeigt',
        notes: [
            'aggregate "delta" bildet die Differenz je Bucket — genau das, was ein Zähler für einen Verbrauch braucht.',
            'deltaBucket bestimmt die Balkenbreite, echartRange den sichtbaren Zeitraum.',
            'echartVisibleRanges gibt dem Nutzer die Umschalter im Frontend.',
            'Braucht History auf dem Datenpunkt; autoHistoryInstance sucht die passende Instanz selbst.',
            'Die Serienfarbe steht als fester Wert da, weil eCharts auf ein Canvas zeichnet — ein var(--token) ' +
                'wird dort nicht aufgelöst. Überall sonst gehört die Farbe als Token in die Konfiguration ' +
                '(aura_theme nennt sie).',
        ],
        widgets: [
            {
                id: 'w-verbrauch',
                type: 'echart',
                title: 'Stromverbrauch',
                datapoint: '%dp.stromzaehler%',
                layout: 'default',
                gridPos: { x: 0, y: 0, w: 12, h: 5 },
                options: {
                    echartMode: 'timeseries',
                    echartRange: '30d',
                    echartVisibleRanges: ['24h', '7d', '30d', '1y'],
                    echartDayNav: true,
                    autoHistoryInstance: true,
                    echartShowLegend: true,
                    echartShowGridLines: true,
                    echartShowValues: true,
                    echartLeftUnit: 'kWh',
                    decimals: 1,
                    echartSeries: [
                        {
                            id: 's-1',
                            name: 'Verbrauch',
                            datapointId: '%dp.stromzaehler%',
                            chartType: 'bar',
                            color: '#22c55e',
                            aggregate: 'delta',
                            deltaBucket: 'day',
                            yAxisIndex: 0,
                            decimals: 1,
                        },
                    ],
                },
            },
        ],
    },
    {
        id: 'verlauf',
        title: 'Verlauf mit zwei Größen auf zwei Achsen',
        when: 'Zwei Messreihen, die zusammengehören, aber nicht dieselbe Einheit haben.',
        instead: 'zwei getrennten Diagrammen untereinander',
        notes: [
            'yAxisIndex 1 legt die zweite Reihe auf die rechte Achse, mit eigener Einheit und eigenen Grenzen.',
            'Die Fläche unter der Linie (chartType "area") liest sich als Hintergrund, die Linie darüber bleibt scharf.',
            'echartShowCurrent blendet den aktuellen Wert groß ein — spart die eigene Wertkachel daneben.',
        ],
        widgets: [
            {
                id: 'w-verlauf',
                type: 'echart',
                title: 'Klima Wohnzimmer',
                datapoint: '%dp.temperatur%',
                layout: 'default',
                gridPos: { x: 0, y: 0, w: 12, h: 5 },
                options: {
                    echartMode: 'timeseries',
                    echartRange: '24h',
                    echartVisibleRanges: ['6h', '24h', '7d'],
                    autoHistoryInstance: true,
                    echartShowLegend: true,
                    echartShowGridLines: true,
                    echartShowCurrent: true,
                    echartShowYAxisRight: true,
                    echartLeftUnit: '°C',
                    echartRightUnit: '%',
                    echartRightMin: 0,
                    echartRightMax: 100,
                    echartSeries: [
                        {
                            id: 's-temp',
                            name: 'Temperatur',
                            datapointId: '%dp.temperatur%',
                            chartType: 'area',
                            color: '#f59e0b',
                            smooth: true,
                            areaOpacity: 20,
                            yAxisIndex: 0,
                            decimals: 1,
                        },
                        {
                            id: 's-hum',
                            name: 'Luftfeuchte',
                            datapointId: '%dp.luftfeuchte%',
                            chartType: 'line',
                            color: '#3b82f6',
                            smooth: true,
                            lineWidth: 2,
                            yAxisIndex: 1,
                            decimals: 0,
                        },
                    ],
                },
            },
        ],
    },
    {
        id: 'status',
        title: 'Statusübersicht statt Fensterkacheln',
        when: 'Offene Fenster, leere Batterien, nicht erreichbare Geräte, brennendes Licht — alles, was auffallen soll.',
        instead: 'einer Kachel je Fensterkontakt',
        notes: [
            'Findet die Geräte selbst über Rollen und Gewerke — es gibt keine Liste zu pflegen.',
            'valueFilter "alerts" zeigt nur, was Aufmerksamkeit braucht; showAllClear meldet ausdrücklich, wenn nichts ansteht.',
            'autoHeight lässt das Widget mit der Zahl der Meldungen wachsen.',
        ],
        widgets: [
            {
                id: 'w-status',
                type: 'statusoverview',
                title: 'Status',
                datapoint: '',
                layout: 'default',
                gridPos: { x: 0, y: 0, w: 6, h: 4 },
                options: {
                    catWindow: true,
                    catBattery: true,
                    catUnreach: true,
                    catLight: true,
                    catAlarm: false,
                    batteryThreshold: 20,
                    valueFilter: 'alerts',
                    showAllClear: true,
                    allClearText: 'Alles in Ordnung',
                    showRoom: true,
                    showSince: true,
                    showCount: true,
                    sortBy: 'severity',
                    autoHeight: true,
                },
            },
        ],
    },
    {
        id: 'heizung',
        title: 'Thermostat als Rundskala',
        when: 'Ein Heizkörper- oder Raumthermostat soll bedienbar sein, nicht nur ablesbar.',
        instead: 'einer Wertkachel mit der Solltemperatur',
        notes: [
            'layout "dial" gibt die Rundskala mit ziehbarem Griff; actualDatapoint zeigt die Ist-Temperatur.',
            'dialColorThresholds färbt die Skala nach Sollwert: [Obergrenze, Farbe].',
            'batteryDp und unreachDp blenden die Statusmarker ein — ohne sie merkt niemand, dass das Ventil offline ist.',
        ],
        widgets: [
            {
                id: 'w-heizung',
                type: 'thermostat',
                title: 'Heizung Wohnzimmer',
                datapoint: '%dp.solltemperatur%',
                layout: 'dial',
                gridPos: { x: 0, y: 0, w: 5, h: 6 },
                options: {
                    actualDatapoint: '%dp.isttemperatur%',
                    minTemp: 5,
                    maxTemp: 30,
                    step: 0.5,
                    showActualTemp: true,
                    showSetpoint: true,
                    showControls: true,
                    dialThickness: 14,
                    dialColorThresholds: [
                        [18, 'var(--accent)'],
                        [22, 'var(--accent-green)'],
                        [30, 'var(--accent-red)'],
                    ],
                    batteryDp: '%dp.batterie%',
                    unreachDp: '%dp.unreach%',
                    showStatusBadges: true,
                    statusBadgesAlertOnly: true,
                    decimals: 1,
                },
            },
        ],
    },
    {
        id: 'fuellstand',
        title: 'Füllstand mit Warnbereich',
        when: 'Zisterne, Öltank, Pelletlager, Akku — ein Wert zwischen leer und voll.',
        instead: 'einer Prozentzahl ohne Bezug',
        notes: [
            'zones färbt den Balken abschnittsweise: jede Zone gilt bis zu ihrem max.',
            'maxDatapoint statt maxValue, wenn die Obergrenze selbst aus einem Datenpunkt kommt.',
            'barSize ist die Balkenbreite in Prozent der Widget-Breite.',
        ],
        widgets: [
            {
                id: 'w-fuellstand',
                type: 'fill',
                title: 'Zisterne',
                datapoint: '%dp.fuellstand%',
                layout: 'default',
                gridPos: { x: 0, y: 0, w: 4, h: 6 },
                options: {
                    minValue: 0,
                    maxValue: 100,
                    unit: '%',
                    decimals: 0,
                    orientation: 'vertical',
                    showValue: true,
                    showTicks: true,
                    barSize: 60,
                    colorZones: true,
                    zones: [
                        { max: 20, color: 'var(--accent-red)' },
                        { max: 50, color: 'var(--accent-yellow)' },
                        { max: 100, color: 'var(--accent-green)' },
                    ],
                },
            },
        ],
    },
    {
        id: 'raum-tab',
        title: 'Kompletter Raum-Tab',
        when: 'Ein Raum bekommt eine eigene Seite. Zeigt das Zusammenspiel, nicht das einzelne Widget.',
        instead: 'einem Raster gleich großer Einzelkacheln',
        notes: [
            'Aufteilung: links die Liste aller Geräte, rechts oben was sofort auffallen muss, darunter der Verlauf.',
            'Zwölf Spalten, keine Überlappung — x + w darf die Spaltenzahl aus aura_dashboard nicht überschreiten.',
            'Die Einzelteile stehen als eigene Rezepte bereit: raum-liste, heizung, status, verlauf.',
            'Die Serienfarbe des Verlaufs steht als fester Wert da — eCharts zeichnet auf ein Canvas und ' +
                'löst dort kein var(--token) auf. Überall sonst gehört die Farbe als Token hinein.',
        ],
        widgets: [
            {
                id: 'w-tab-liste',
                type: 'autolist',
                title: 'Geräte',
                datapoint: '',
                layout: 'default',
                gridPos: { x: 0, y: 0, w: 6, h: 9 },
                options: {
                    filterRooms: '%Raumname%',
                    filterRelevant: true,
                    namePattern: '<Gerät>',
                    showDividers: true,
                    hideFilterButton: true,
                    entryDisplay: { displayType: 'auto' },
                    sortRules: [{ source: 'name', order: 'asc', mode: 'text' }],
                },
            },
            {
                id: 'w-tab-heizung',
                type: 'thermostat',
                title: 'Heizung',
                datapoint: '%dp.solltemperatur%',
                layout: 'dial',
                gridPos: { x: 6, y: 0, w: 3, h: 5 },
                options: {
                    actualDatapoint: '%dp.isttemperatur%',
                    minTemp: 5,
                    maxTemp: 30,
                    step: 0.5,
                    showActualTemp: true,
                    showControls: true,
                    decimals: 1,
                },
            },
            {
                id: 'w-tab-status',
                type: 'statusoverview',
                title: 'Status',
                datapoint: '',
                layout: 'compact',
                gridPos: { x: 9, y: 0, w: 3, h: 5 },
                options: {
                    filterRooms: '%Raumname%',
                    catWindow: true,
                    catBattery: true,
                    catUnreach: true,
                    valueFilter: 'alerts',
                    showAllClear: true,
                    autoHeight: true,
                },
            },
            {
                id: 'w-tab-verlauf',
                type: 'echart',
                title: 'Klima',
                datapoint: '%dp.temperatur%',
                layout: 'default',
                gridPos: { x: 6, y: 5, w: 6, h: 4 },
                options: {
                    echartMode: 'timeseries',
                    echartRange: '24h',
                    echartVisibleRanges: ['24h', '7d'],
                    autoHistoryInstance: true,
                    echartShowLegend: true,
                    echartShowCurrent: true,
                    echartLeftUnit: '°C',
                    echartSeries: [
                        {
                            id: 's-temp',
                            name: 'Temperatur',
                            datapointId: '%dp.temperatur%',
                            chartType: 'area',
                            // A fixed value, not var(--accent-yellow): eCharts paints on
                            // a canvas and does not resolve a CSS variable there.
                            color: '#eab308',
                            smooth: true,
                            areaOpacity: 20,
                            decimals: 1,
                        },
                    ],
                },
            },
        ],
    },
];

/**
 * @param {string} id recipe id, case-insensitive
 * @returns {object|null} the recipe, or null when there is none
 */
function findRecipe(id) {
    const wanted = String(id || '')
        .trim()
        .toLowerCase();
    return RECIPES.find((r) => r.id === wanted) || null;
}

/** One block per recipe: enough to pick one, not enough to build from. */
function renderRecipeIndex() {
    const rows = RECIPES.map((r) => `- ${r.id} — ${r.title}\n  Wann: ${r.when}\n  Statt: ${r.instead}`);
    return [
        `# Rezepte (${RECIPES.length})`,
        '',
        'Fertige, gültige Widgets zum Übernehmen und Anpassen. Sie zeigen, wie ein AURA-Dashboard aussieht,',
        'das mehr kann als eine Zahl je Kachel — Listen statt Kachelreihen, Bedingungen, Farbschwellen,',
        'zweite Zeilen, Diagramm-Aggregationen.',
        '',
        rows.join('\n'),
        '',
        'aura_recipes mit id=<id> liefert das vollständige JSON.',
    ].join('\n');
}

/**
 * The full recipe: what it is for, what to watch out for, and the JSON itself.
 *
 * @param {object} recipe one entry of RECIPES
 * @returns {string} the text handed to the model
 */
function renderRecipe(recipe) {
    const json = JSON.stringify(recipe.widgets.length === 1 ? recipe.widgets[0] : recipe.widgets, null, 2);
    const placeholders = [...new Set(json.match(PLACEHOLDER) || [])];
    const parts = [
        `# ${recipe.id} — ${recipe.title}`,
        `Wann: ${recipe.when}`,
        `Statt: ${recipe.instead}`,
        '',
        `## Hinweise\n${recipe.notes.map((n) => `- ${n}`).join('\n')}`,
        '',
        '## JSON',
        json,
        '',
    ];
    if (placeholders.length) {
        parts.push(
            `## Vor dem Schreiben ersetzen\n${placeholders.join(', ')}`,
            'Datenpunkt-Ids kommen aus dem ioBroker-MCP. Keine erfinden — eine erfundene Id geht als String durch',
            'und ergibt ein Widget, das stumm nichts anzeigt.',
        );
    }
    parts.push(
        'Ids und gridPos anpassen: jede Widget-Id muss im Tab einmalig sein, Widgets dürfen sich nicht überlappen.',
        'Danach aura_validate, dann schreiben.',
    );
    return parts.join('\n');
}

module.exports = { RECIPES, findRecipe, renderRecipe, renderRecipeIndex };
