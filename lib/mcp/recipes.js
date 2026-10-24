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

/**
 * Row-major cell list of a custom grid from [row, col, cell] entries — the
 * floor-plan recipe places a handful of cells on a 10x10 grid.
 */
function gridCells(cols, rows, placed) {
    const cells = Array.from({ length: cols * rows }, () => ({ type: 'empty' }));
    for (const [r, c, cell] of placed) cells[r * cols + c] = cell;
    return cells;
}

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
        id: 'tagesbericht',
        title: 'Tagesbericht per Mail/Telegram: Listeninhalt als Datenpunkt',
        when: 'Der Nutzer will abends (oder zu einer festen Zeit) wissen, welche Fenster offen sind, welche Batterien schwach sind usw. — als Nachricht, ohne das Dashboard zu öffnen.',
        instead:
            'ein eigenes Skript, das alle Fensterkontakte selbst zusammensucht und die Filterlogik der Liste nachbaut',
        notes: [
            'publishCount: true lässt den Adapter den Inhalt nach aura.0.lists.<widgetId> schreiben: .count, .items (JSON), .text (Zeilen „Raum: Name (Wert)“), .ts. Der Adapter rechnet selbst — auch wenn kein Browser offen ist.',
            'publishFilter legt fest, welche Zeilen zählen ("active" = offen/an, oder die id eines filterPresets-Eintrags). Ohne publishFilter gilt valueFilter. Was ein Betrachter im Widget umschaltet, ändert den Bericht nicht.',
            'Versand und Zeitplan macht ein Skript des Nutzers, z. B. im javascript-Adapter: schedule("0 22 * * *", () => { const n = getState("aura.0.lists.w-fenster-offen.count").val; if (n) sendTo("telegram.0", { text: n + " Fenster offen\\n" + getState("aura.0.lists.w-fenster-offen.text").val }); });',
            'Funktioniert genauso mit autolist (Mitglieder aus den gespeicherten entries) und statusoverview (die Hinweise der Übersicht, inkl. gemerkter).',
        ],
        widgets: [
            {
                id: 'w-fenster-offen',
                type: 'list',
                title: 'Offene Fenster',
                datapoint: '',
                layout: 'default',
                gridPos: { x: 0, y: 0, w: 4, h: 6 },
                options: {
                    valueFilter: 'all',
                    publishCount: true,
                    publishFilter: 'active',
                    trueText: 'offen',
                    falseText: 'zu',
                    showRoom: true,
                    entries: [
                        { id: '%dp.fenster.bad%', label: 'Fenster Bad' },
                        { id: '%dp.fenster.kueche%', label: 'Fenster Küche' },
                        { id: '%dp.fenster.schlafzimmer%', label: 'Fenster Schlafzimmer' },
                    ],
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
        id: 'json-status-funktion',
        title: 'Status aus einem JSON-Datenpunkt per eigener Funktion',
        when: 'Ein Datenpunkt liefert ein JSON-Objekt und der angezeigte Text hängt an mehreren Feldern und Bedingungen — mehr, als ein Ausdruck mit ? : sinnvoll fasst.',
        instead: 'einem Skript im javascript-Adapter, das nur für die Anzeige einen zweiten Datenpunkt schreibt',
        notes: [
            'Die Funktion steht in Custom JS (Einstellungen → CSS & JS) und wird dort mit aura.registerFn("geraeteStatus", (dp) => …) angemeldet — das legt der Nutzer an, nicht das Widget.',
            'callback("name", dp) gibt es nur in valueExpr (Wert-Umrechnung der Listen), nicht in Bindings oder HTML. Nur angemeldete Funktionen sind aufrufbar.',
            'Die Funktion muss synchron zurückgeben; async, Fehler oder fehlende Anmeldung zeigen keinen Wert.',
            'Einfache Fälle brauchen keine Funktion: dp.feld * 0.4 | fixed(2) oder dp.status == "on" ? "An" : "Aus" reichen als Ausdruck.',
        ],
        widgets: [
            {
                id: 'w-json-status',
                type: 'list',
                title: 'Wärmepumpe',
                datapoint: '',
                layout: 'default',
                gridPos: { x: 0, y: 0, w: 6, h: 4 },
                options: {
                    entries: [
                        {
                            id: '%dp.geraet.json%',
                            label: 'Status',
                            displayType: 'value',
                            icon: 'mdi:heat-pump',
                            valueTransform: 'expr',
                            valueExpr: 'callback("geraeteStatus", dp)',
                        },
                        {
                            id: '%dp.geraet.json%',
                            label: 'Leistung',
                            displayType: 'value',
                            icon: 'mdi:flash',
                            unit: 'kW',
                            valueTransform: 'expr',
                            valueExpr: 'dp.leistung / 1000 | fixed(2)',
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
        id: 'farbe-hell-dunkel',
        title: 'Farbe, die auf hellem UND dunklem Theme funktioniert',
        when: 'Eine Farbe ist fest gesetzt (Icon, Text, Hintergrund, Schwellenwert) und das Dashboard läuft in beiden Helligkeiten.',
        instead: 'einem festen Hex-Wert, der auf einem der beiden Designs verschwindet',
        notes: [
            'Erste Wahl ist ein Theme-Token: var(--text-primary), var(--accent), var(--accent-green|yellow|red), ' +
                'var(--widget-bg), var(--app-border). Ein Token ist in jedem Theme schon richtig gesetzt, also ' +
                'braucht es dafür gar keine zweite Farbe.',
            'Muss es eine bestimmte Farbe sein, trägt der Wert beide: "light-dark(<hell>, <dunkel>)". Das gilt ' +
                'für JEDE Option, die im Schema "color": true trägt — auch in Zellen, Zeilen, Schwellen und Serien.',
            'Die erste Hälfte gilt auf hellem, die zweite auf dunklem Theme. Sind beide gleich, ist das Paar ' +
                'sinnlos — dann die einzelne Farbe schreiben.',
            'Eine Hälfte darf selbst ein Token sein: "light-dark(var(--accent), #93c5fd)".',
            'Eine Farbe mit Transparenz ist "#rrggbbaa"; das gilt in jeder Hälfte.',
            'Kommt die Farbe aus einem Gerät (WLED, Hue …), ist der ganze Wert eine Bindung: "{<state id>}" ' +
                'oder "[[<state id>]]" — auch als eine Hälfte: "light-dark(#000000, {wled.0.col})".',
        ],
        widgets: [
            {
                id: 'w-farbe-hell-dunkel',
                type: 'switch',
                title: 'Stehlampe',
                datapoint: '%dp.stehlampe%',
                layout: 'card',
                gridPos: { x: 0, y: 0, w: 4, h: 3 },
                options: {
                    icon: 'mdi:lamp',
                    iconSize: 28,
                    // Ein Token: folgt dem Theme von allein, braucht kein Paar.
                    onColor: 'var(--accent-yellow)',
                    // Ein Grau, das auf hellem Grund dunkel und auf dunklem hell sein
                    // muss — genau der Fall, für den das Paar da ist.
                    offColor: 'light-dark(#475569, #94a3b8)',
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
            'Andere Zeiträume als die eingebauten (z. B. nur Monate: 1M, 3M, 6M, 12M, 24M, total) setzt ' +
                'rangeChips — das ersetzt echartVisibleRanges; M und y zählen nach dem Kalender.',
            'Braucht History auf dem Datenpunkt; autoHistoryInstance sucht die passende Instanz selbst.',
            'Die Serienfarbe ist ein var(--token) wie überall sonst — das Widget löst sie auf, bevor sie ans ' +
                'Canvas geht, das Diagramm folgt also dem Theme.',
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
                            color: 'var(--accent-green)',
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
        id: 'vorjahr',
        title: 'Verbrauch mit Vorjahreswerten daneben',
        when: 'Monats- oder Tagesverbrauch soll mit demselben Zeitraum des Vorjahres verglichen werden.',
        instead: 'einem Skript, das die Vorjahreswerte als JSON in einen eigenen Datenpunkt schreibt',
        notes: [
            'Zweite Serie auf denselben Datenpunkt mit timeShift 1 und timeShiftUnit "year" — sie liest die ' +
                'History ein Jahr zurück und legt sie über den aktuellen Zeitraum.',
            'Gleiche aggregate/deltaBucket wie die aktuelle Serie, dann stehen die Balken je Monat nebeneinander.',
            'stack aus lassen, sonst werden die Jahre addiert. Eine gedämpfte Farbe hält das aktuelle Jahr vorn.',
            'Andere Vergleiche gehen genauso: timeShiftUnit "day" = gestern, "week" = Vorwoche.',
            'Die versetzte Serie wird nicht live aktualisiert; bei echartRange "total" wirkt der Versatz nicht.',
        ],
        widgets: [
            {
                id: 'w-vorjahr',
                type: 'echart',
                title: 'Heizung pro Monat',
                datapoint: '%dp.stromzaehler%',
                layout: 'default',
                gridPos: { x: 0, y: 0, w: 12, h: 5 },
                options: {
                    echartMode: 'timeseries',
                    echartRange: '1y',
                    autoHistoryInstance: true,
                    echartShowLegend: true,
                    echartLeftUnit: 'kWh',
                    decimals: 0,
                    echartSeries: [
                        {
                            id: 's-1',
                            name: 'Dieses Jahr',
                            datapointId: '%dp.stromzaehler%',
                            chartType: 'bar',
                            color: 'var(--accent)',
                            aggregate: 'delta',
                            deltaBucket: 'month',
                            yAxisIndex: 0,
                        },
                        {
                            id: 's-2',
                            name: 'Vorjahr',
                            datapointId: '%dp.stromzaehler%',
                            chartType: 'bar',
                            color: 'var(--text-secondary)',
                            aggregate: 'delta',
                            deltaBucket: 'month',
                            timeShift: 1,
                            timeShiftUnit: 'year',
                            yAxisIndex: 0,
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
                            color: 'var(--accent-yellow)',
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
                            color: 'var(--accent)',
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
        id: 'zeitraum-summe',
        title: 'Verbrauch/Ertrag im gewählten Zeitraum als Zahl',
        when:
            'Wie viel ist zwischen Anfang und Ende des Zeitraums dazugekommen — Bezug, Einspeisung, Gas, Wasser — ' +
            'als eine Zahl, die mit den Zeitraum-Knöpfen (24 h, 7 Tage, 30 Tage) mitgeht.',
        instead: 'einem Diagramm, an dessen Kurve man Anfangs- und Endwert ablesen und selbst abziehen muss',
        notes: [
            'Widget "energiebilanz" (Diagramm Verteilung): jeder Eintrag rechnet über den Zeitraum EINE Zahl aus; ' +
                'die Summe einer Gruppe steht über ihrem Balken.',
            'aggregate "consumption" summiert jeden Anstieg im Zeitraum — bei einem fortlaufenden Zähler genau ' +
                'Ende minus Anfang, und es bleibt richtig, wenn der Zähler zurückspringt (Tageszähler um Mitternacht, ' +
                'Zählerwechsel). "delta" rechnet stur Ende minus Anfang und wird dort negativ — für Zähler daher ' +
                'immer "consumption" nehmen.',
            'Eine Gruppe je Zähler, damit jede ihre eigene Summe zeigt. Zwei Einträge in EINER Gruppe zeigen ' +
                'stattdessen die Anteile beider an der gemeinsamen Summe (z. B. Eigenverbrauch gegen Einspeisung).',
            'visibleRanges bestimmt die Zeitraum-Knöpfe im Frontend; lockRange true blendet sie aus.',
            'Braucht History (history/influxdb/sql) auf beiden Datenpunkten; historyInstance leer = automatisch erkannt.',
            'Soll die Kurve dazu, reicht EIN echart mit periodValue an der Serie (Rezept "kurve-zeitraumwert") — ' +
                'kein zweites Widget nötig.',
        ],
        widgets: [
            {
                id: 'w-zeitraum-summe',
                type: 'energiebilanz',
                title: 'Netz',
                datapoint: '',
                layout: 'default',
                gridPos: { x: 0, y: 0, w: 6, h: 6 },
                options: {
                    range: '24h',
                    visibleRanges: ['24h', '7d', '30d'],
                    unit: 'kWh',
                    decimals: 1,
                    chartStyle: 'bars',
                    showTotals: true,
                    showPercent: false,
                    legendFormat: 'label-value',
                    bars: [
                        {
                            id: 'g-bezug',
                            title: 'Bezug',
                            entries: [
                                {
                                    id: 'e-bezug',
                                    datapointId: '%dp.zaehler.bezug%',
                                    label: 'Bezug',
                                    color: 'var(--accent-red)',
                                    aggregate: 'consumption',
                                },
                            ],
                        },
                        {
                            id: 'g-einspeisung',
                            title: 'Einspeisung',
                            entries: [
                                {
                                    id: 'e-einspeisung',
                                    datapointId: '%dp.zaehler.einspeisung%',
                                    label: 'Einspeisung',
                                    color: 'var(--accent-green)',
                                    aggregate: 'consumption',
                                },
                            ],
                        },
                    ],
                },
            },
        ],
    },
    {
        id: 'kurve-zeitraumwert',
        title: 'Kurve mit Verbrauch/Ertrag des Zeitraums in der Legende',
        when:
            'Ein Verlauf soll neben der Kurve eine Zahl über den gewählten Zeitraum zeigen — Einspeisung der letzten ' +
            '30 Tage, Höchsttemperatur der Woche, mittlere Leistung von heute.',
        instead: 'einem zweiten Widget (energiebilanz) neben dem Diagramm, dessen Zeitraum-Knöpfe getrennt laufen',
        notes: [
            'periodValue an der Serie: "consumption" (Summe der Anstiege — für Zähler, bleibt bei Tageszähler und ' +
                'Zählertausch richtig), "change" (Ende − Start), "min", "max", "average".',
            'Die Zahl geht mit Zeitraum-Knöpfen, Tagesnavigation und timeShift mit; für consumption holt das Widget ' +
                'dieselben Daten wie energiebilanz, beide zeigen also dieselbe Zahl.',
            'Bei aggregate "delta" (Verbrauchsbalken) kommt die Zahl aus den Balken: consumption = Summe, max = ' +
                'höchster Balken (z. B. höchster Tagesverbrauch).',
            'echartPeriodPlacement "legend" (Standard) hängt die Zahl an den Legendeneintrag, "row" gibt ihr eine ' +
                'eigene Zeile über dem Diagramm. Ohne Legende steht sie immer in der Zeile.',
            'Braucht History auf dem Datenpunkt; in den Modi comparison und json gibt es keine Zeitraum-Kennzahl.',
        ],
        widgets: [
            {
                id: 'w-kurve-zeitraumwert',
                type: 'echart',
                title: 'Netz',
                datapoint: '%dp.zaehler.einspeisung%',
                layout: 'default',
                gridPos: { x: 0, y: 0, w: 12, h: 5 },
                options: {
                    echartMode: 'timeseries',
                    echartRange: '30d',
                    echartVisibleRanges: ['24h', '7d', '30d', '1y'],
                    autoHistoryInstance: true,
                    echartShowLegend: true,
                    echartLeftUnit: 'kWh',
                    decimals: 2,
                    echartSeries: [
                        {
                            id: 's-einspeisung',
                            name: 'Einspeisung',
                            datapointId: '%dp.zaehler.einspeisung%',
                            chartType: 'line',
                            color: 'var(--accent-green)',
                            periodValue: 'consumption',
                            yAxisIndex: 0,
                        },
                        {
                            id: 's-bezug',
                            name: 'Bezug',
                            datapointId: '%dp.zaehler.bezug%',
                            chartType: 'line',
                            color: 'var(--accent-red)',
                            periodValue: 'consumption',
                            yAxisIndex: 0,
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
        id: 'batterie-merkliste',
        title: 'Schwache Batterien merken, bis sie gewechselt sind',
        when:
            'LOWBAT springt bei Kälte oder Last auf true und kurz darauf wieder auf false (HomeMatic) — eine schwache ' +
            'Batterie soll trotzdem in der Liste bleiben, bis jemand sie gewechselt hat.',
        instead: 'einem Skript mit eigener Merkliste und einem html-Widget für die Knöpfe',
        notes: [
            'latchBattery / latchUnreach / latchAlarm: der AURA-Adapter führt die Liste (aura.0.status.<battery|unreach|alarm>.list), ' +
                'alle Browser sehen dieselbe, „Gewechselt“ schließt überall gleichzeitig.',
            'Layout "twoline": zweizeilige Zeilen (Name fett, darunter Messwert und Hinweise) mit großen Knöpfen ' +
                '„N Tage später“ / „Gewechselt“ — für Wand-Tablets. Gemerkte, gerade stille Einträge sagen ' +
                '„meldet zurzeit nichts, bleibt aber gemerkt“; „später“ stellt um latchSnoozeDays zurück.',
            'latchRecheckDays: meldet das Gerät nach dem Wechsel erneut, öffnet sich der Eintrag wieder („trotz Wechsel am …“).',
            'latchAutoClose schließt selbst, wenn OPERATING_VOLTAGE bzw. der Prozentwert deutlich steigt. Geräte nur mit ' +
                'LOWBAT (klassisches HomeMatic) schließt nur „Gewechselt“.',
            'Batterie-Erkennung (catBattery): value.battery und LOWBAT/LOW_BAT. HomeMatic-LOWBAT zählt nur bei ' +
                'OPERATING_VOLTAGE am Gerät, einem Modell aus der Batterie-Bibliothek (HM-Sec-SCo, HM-Sec-RHS, …) oder ' +
                'einem zugewiesenen Batterietyp — Netz-Aktoren tragen ebenfalls LOWBAT. Kanal 0 und 1 → eine Zeile.',
            'rowActions sind zusätzliche Knöpfe, die einen Wert schreiben — Platzhalter {id} {device} {serial} {name} {room}.',
            'Skripte: aura.0.status.battery.cmd ("ack:<id>", "snooze:<id>", "add:<id>@<datum>", "remove:<id>"; <id> darf ' +
                'auch die Seriennummer sein) und .event (new / reopened / closed) für Telegram & Co.',
            'Rückblick: eine zweite Instanz mit layout "history" („Zuletzt gewechselt“) liest aura.0.status.battery.history — ' +
                'wann gewechselt, per Knopf oder automatisch erkannt, wie lange schwach, wie lange die Batterie davor hielt ' +
                '(showLifetime). maxRows macht die Höhe planbar (aura_measure), maxAgeDays begrenzt den Zeitraum. ' +
                '„Wieder öffnen“ (Symbol am Zeilenende, mit Rückfrage) nimmt einen versehentlich bestätigten Wechsel zurück. ' +
                'Die Latch-Optionen gehören NUR an die Live-Instanz; die History-Instanz meldet nichts beim Adapter an.',
            'Fehlalarme (eine leere Wallbox meldet 0 % für ein Auto, das nicht da ist): latchIgnore: true gibt jeder Zeile ' +
                '„Ignorieren“ (mit Rückfrage). Per Skript "ignore:<id>" / "unignore:<id>" auf aura.0.status.<cat>.cmd; die Liste ' +
                'steht in aura.0.status.<cat>.ignored. Ein ignorierter Datenpunkt wird nie mehr gemerkt und von keiner ' +
                'Statusübersicht gezeigt; .event meldet einmal closed mit reason "ignored" (kein Verlauf). showIgnored zeigt ' +
                'sie gedämpft mit „Aufnehmen“. Alternativ excludeIdPatterns — der Adapter liest die gespeicherten Filter ' +
                'selbst, ein Browser muss das Widget dafür nicht neu zeichnen.',
            'Mehrere Ids pro Befehl: "remove:<id1>,<id2>". Befehle laufen nacheinander; jeder wird mit ack=true bestätigt, ' +
                'das Ergebnis ({cmd, ok, done, errors, notes}) steht in aura.0.status.<cat>.cmdResult.',
            'Alter Verlauf eines Batterie-Skripts: "import:<JSON-Array>" auf aura.0.status.battery.cmd ' +
                '({datenpunkt, ts, seit, name, art}); 0_userdata.0.Batterien.Verlauf übernimmt der Adapter beim Start von selbst, ' +
                'solange der eigene Verlauf leer ist.',
        ],
        widgets: [
            {
                id: 'w-batterien',
                type: 'statusoverview',
                title: 'Batterien',
                datapoint: '',
                layout: 'twoline',
                gridPos: { x: 0, y: 0, w: 6, h: 4 },
                options: {
                    catWindow: false,
                    catBattery: true,
                    catUnreach: false,
                    catLight: false,
                    catAlarm: false,
                    latchBattery: true,
                    latchAutoClose: true,
                    latchSnoozeDays: 2,
                    latchRecheckDays: 7,
                    sinceCategories: ['battery'],
                    rowActions: [
                        {
                            label: 'Notiz',
                            targetDp: '%dp.befehl%',
                            value: 'notiz:{serial}',
                            categories: ['battery'],
                        },
                    ],
                    autoHeight: true,
                },
            },
            {
                id: 'w-batterien-verlauf',
                type: 'statusoverview',
                title: 'Zuletzt gewechselt',
                datapoint: '',
                layout: 'history',
                gridPos: { x: 6, y: 0, w: 6, h: 9 },
                options: {
                    catBattery: true,
                    catUnreach: false,
                    catAlarm: false,
                    maxRows: 5,
                    maxAgeDays: 730,
                    showReason: true,
                    showDuration: true,
                    showLifetime: true,
                },
            },
        ],
    },
    {
        id: 'rollladen-kreismenue',
        title: 'Rollladen als Kreismenü',
        when: 'Viele Rollläden auf wenig Platz, bedient über feste Positionen statt über einen Regler (FTUI-Circlemenu, #815).',
        instead: 'dem Standard-Layout mit Regler und Tastenspalte',
        notes: [
            'layout "circle" zeigt einen runden Knopf mit Grafik und Prozentwert; ein Tipp fächert Öffnen, die positionPresets, Schließen und Stopp im Kreis auf.',
            'Ohne positionPresets stehen nur Öffnen/Schließen/Stopp im Kreis — die Schnellwahl-Werte machen das Layout erst nützlich.',
            'circleDirection "auto" wählt Vollkreis oder Halbkreis nach dem Platz im Fenster; der Kreis füllt die Kachel und braucht keine Regler-Höhe (z. B. w 5, h 6).',
        ],
        widgets: [
            {
                id: 'w-rollladen-kreis',
                type: 'shutter',
                title: 'Rollladen Küche',
                datapoint: '%dp.position%',
                layout: 'circle',
                gridPos: { x: 0, y: 0, w: 5, h: 6 },
                options: {
                    positionPresets: [{ pos: 75 }, { pos: 50 }, { pos: 30, label: 'Schatten' }],
                    circleDirection: 'auto',
                },
            },
        ],
    },
    {
        id: 'thermostat-kreismenue',
        title: 'Thermostat als Kreismenü',
        when: 'Heizkörper auf wenig Platz, bedient über feste Temperaturen statt über Skala oder Tasten (#815).',
        instead: 'der Rundskala oder dem Standard-Layout mit Tastenspalte',
        notes: [
            'layout "circle" zeigt einen runden Knopf mit Soll- und Ist-Temperatur; ein Tipp fächert −, die presets und + im Kreis auf.',
            '− und + lassen das Menü offen und zeigen den neuen Sollwert in der Mitte; ein Preset schließt es.',
            'Ohne presets und mit showControls false bleibt der Kreis leer — mindestens eins von beiden setzen.',
        ],
        widgets: [
            {
                id: 'w-thermostat-kreis',
                type: 'thermostat',
                title: 'Heizung Bad',
                datapoint: '%dp.solltemperatur%',
                layout: 'circle',
                gridPos: { x: 0, y: 0, w: 4, h: 5 },
                options: {
                    actualDatapoint: '%dp.isttemperatur%',
                    presets: [17, 19, 21, 23],
                    circleDirection: 'auto',
                },
            },
        ],
    },
    {
        id: 'auswahl-kreismenue',
        title: 'Auswahlfeld als Kreismenü',
        when: 'Ein Datenpunkt mit wenigen festen Werten (Szene, Betriebsmodus, Lüfterstufe) soll mit einem Tipp umschaltbar sein (#815).',
        instead: 'einem Dropdown oder einer Reihe einzelner Tasten',
        notes: [
            'Widget enum mit layout "circle": jeder Eintrag aus entries wird ein Knopf im Kreis, in der Reihenfolge der Liste.',
            'Einträge mit render "icon" und icon (oder render "image") erscheinen als Bild, sonst als Text — kurze Labels wählen, ein Knopf misst 48 px.',
            'Der runde Knopf zeigt Icon/Bild und Label des aktiven Eintrags; color eines Eintrags färbt Ring und Label.',
            'Alle Einträge schreiben in denselben Datenpunkt — für Knöpfe mit verschiedenen Zielen ist dieses Layout nicht gedacht.',
        ],
        widgets: [
            {
                id: 'w-auswahl-kreis',
                type: 'enum',
                title: 'Lüftung',
                datapoint: '%dp.befehl%',
                layout: 'circle',
                gridPos: { x: 0, y: 0, w: 4, h: 5 },
                options: {
                    entries: [
                        { value: '0', label: 'Aus', render: 'icon', icon: 'mdi:fan-off' },
                        { value: '1', label: 'Stufe 1', render: 'icon', icon: 'mdi:fan-speed-1' },
                        { value: '2', label: 'Stufe 2', render: 'icon', icon: 'mdi:fan-speed-2' },
                        {
                            value: '3',
                            label: 'Stufe 3',
                            render: 'icon',
                            icon: 'mdi:fan-speed-3',
                            color: 'var(--accent-red)',
                        },
                    ],
                    circleDirection: 'auto',
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
        id: 'status-symbol-schaltbar',
        title: 'Eigenes Status-Symbol an einem Gerät (z. B. Bewegungsmelder gesperrt)',
        when:
            'An einer Lampe, einem Schalter oder Thermostat soll ein Nebenzustand als kleines Symbol erscheinen ' +
            '(Bewegungsmelder gesperrt, Automatik aus, Urlaubsmodus) und per Klick umschaltbar sein.',
        instead: 'einem zweiten Widget daneben oder einem Wechsel ins Layout custom',
        notes: [
            'statusItems hängt eigene Symbole an die Statuszeile unten rechts (dieselbe wie batteryDp/windowDp).',
            'activeValues entscheidet aktiv/inaktiv; icon/iconInactive und color/colorInactive je Zustand.',
            'action "toggle" schreibt offValue (wenn aktiv) bzw. onValue in writeDp (leer = dp); leer = true/false, bei Zahlen 1/0.',
            'Ein Klick aufs Symbol schaltet NICHT die Kachel mit; confirmAction des Widgets fragt auch hier nach.',
            'statusOrder legt die Reihenfolge fest: ids der statusItems und battery, reach, window, lock.',
            'show "active" zeigt das Symbol nur im aktiven Zustand (statusBadgesAlertOnly wirkt genauso).',
        ],
        widgets: [
            {
                id: 'w-flurlicht',
                type: 'light',
                title: 'Flurlicht',
                datapoint: '%dp.licht%',
                layout: 'light-all',
                gridPos: { x: 0, y: 0, w: 4, h: 3 },
                options: {
                    statusItems: [
                        {
                            id: 'si-bwm-sperre',
                            dp: '%dp.bewegungsmelderSperre%',
                            activeValues: 'true,1',
                            icon: 'mdi:motion-sensor-off',
                            iconInactive: 'mdi:motion-sensor',
                            color: 'var(--accent-red)',
                            label: 'Bewegungsmelder gesperrt',
                            labelInactive: 'Bewegungsmelder aktiv',
                            action: 'toggle',
                        },
                    ],
                    statusOrder: ['si-bwm-sperre', 'battery', 'reach'],
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
        id: 'multiroom',
        title: 'Multiroom-Audio: mehrere Player auf einer Seite',
        when: 'Echo, Sonos, Squeezebox — ein Tab, auf dem jeder Raum seinen Player hat.',
        instead: 'je Gerät eine Reihe aus Play-Taste, Lautstärkeregler und Titel-Wertkachel',
        notes: [
            'Der Player zeichnet seine eigene Kopfzeile: showTitle wirkt hier NUR im Layout "custom". In "default" und "compact" bleibt es wirkungslos — der Gerätename gehört in title.',
            'Höhe: der Player füllt die Karte, über der Mindesthöhe ist h frei wählbar (aura_measure nennt sie als „fills“). "default" mit Cover braucht spürbar mehr als "compact" — für eine Spalte aus vier Räumen ist compact das richtige.',
            'Geräte NICHT einzeln zusammensuchen: list_devices des ioBroker-MCP liefert Medien-Geräte samt Rollen über den Type-Detector. search_objects danach nur noch für einzelne Datenpunkte, sonst kommt jedes Wecker-, Erinnerungs- und Timer-Unterobjekt mit.',
            'Alexa hat keinen schreibbaren Mute-Datenpunkt: muteViaVolume: true schaltet über die Lautstärke stumm.',
            'playValue ist der Wert von playStateDp, der „spielt“ bedeutet — bei alexa2 "PLAYING", bei sonos true.',
            'chips sind die Direktwahl (Radiosender, Playlist, Sprachbefehl): jeder Chip schreibt value in dp.',
            'Vor dem Bauen aura_review health laufen lassen — ein Gerät, das seit Monaten nichts mehr gemeldet hat, sieht in der Konfiguration genauso aus wie ein laufendes.',
        ],
        widgets: [
            {
                id: 'w-player-wohnzimmer',
                type: 'mediaplayer',
                title: 'Wohnzimmer',
                datapoint: '',
                layout: 'default',
                gridPos: { x: 0, y: 0, w: 6, h: 9 },
                options: {
                    titleDp: '%dp.player.title%',
                    artistDp: '%dp.player.artist%',
                    albumDp: '%dp.player.album%',
                    coverDp: '%dp.player.cover%',
                    playStateDp: '%dp.player.state%',
                    playValue: 'PLAYING',
                    playDp: '%dp.player.play%',
                    pauseDp: '%dp.player.pause%',
                    prevDp: '%dp.player.prev%',
                    nextDp: '%dp.player.next%',
                    volumeDp: '%dp.player.volume%',
                    volumeMin: 0,
                    volumeMax: 100,
                    volumeStep: 5,
                    muteViaVolume: true,
                    showCover: true,
                    showSubtitle: true,
                    showVolume: true,
                    showPrev: true,
                    showNext: true,
                    showChips: true,
                    chips: [
                        {
                            id: 'chip-radio',
                            label: '%Sendername%',
                            icon: 'Radio',
                            dp: '%dp.player.command%',
                            value: '%Sprachbefehl oder Sender%',
                        },
                    ],
                },
            },
            {
                id: 'w-player-kueche',
                type: 'mediaplayer',
                title: 'Küche',
                datapoint: '',
                layout: 'compact',
                gridPos: { x: 6, y: 0, w: 6, h: 5 },
                options: {
                    titleDp: '%dp.player2.title%',
                    artistDp: '%dp.player2.artist%',
                    playStateDp: '%dp.player2.state%',
                    playValue: 'PLAYING',
                    playDp: '%dp.player2.play%',
                    pauseDp: '%dp.player2.pause%',
                    nextDp: '%dp.player2.next%',
                    volumeDp: '%dp.player2.volume%',
                    volumeMax: 100,
                    volumeStep: 5,
                    muteViaVolume: true,
                    showCover: false,
                    showVolume: true,
                    showPrev: false,
                    showChips: false,
                },
            },
            {
                id: 'w-player-alle',
                type: 'chips',
                title: 'Alle Räume',
                datapoint: '',
                layout: 'default',
                gridPos: { x: 6, y: 5, w: 6, h: 4 },
                options: {
                    chips: [
                        { id: 'c-aus', label: 'Alles aus', icon: 'Power', dp: '%dp.alle.stop%', value: true },
                        { id: 'c-leise', label: 'Leise', icon: 'Volume1', dp: '%dp.alle.volume%', value: 15 },
                        { id: 'c-party', label: 'Party', icon: 'PartyPopper', dp: '%dp.szene.party%', value: true },
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
                            color: 'var(--accent-yellow)',
                            smooth: true,
                            areaOpacity: 20,
                            decimals: 1,
                        },
                    ],
                },
            },
        ],
    },
    {
        id: 'html-bedienung',
        title: 'Eigenes HTML, das auch schaltet',
        when: 'Eine Darstellung, die kein Widget hergibt — eigenes SVG, eigene Tabelle, eigenes Bedienfeld — und die nicht nur anzeigen, sondern auch schreiben soll.',
        instead: 'einem html-Widget, das nur anzeigt, plus einer zweiten Schalt-Kachel daneben',
        notes: [
            'Bindings sind die Lese-Richtung: {%dp%} setzt den Wert in den Text, {{ … }} rechnet damit.',
            'Die Schreib-Richtung ist window.aura im HTML: aura.setState(id, wert, ack?), aura.toggle(id), aura.getState(id), aura.subscribe(id, cb), aura.sendTo(ziel, befehl, daten). Alles liefert ein Promise.',
            'Voreingestellt an; htmlApi: false schaltet es ab. Es braucht eine Sandbox, die Skripte erlaubt — "minimal" genügt, "standard" ist die Voreinstellung.',
            'Jede Binding-Änderung baut das Dokument neu auf. Soll im HTML etwas laufen (Eingabe, Animation, Canvas), statt eines Bindings aura.subscribe benutzen und nur den Text austauschen.',
            'Das Widget rendert in einer Sandbox: Klicks darin erreichen die Klick-Aktion des Widgets nicht, dafür gibt es die kleine Taste oben rechts. Aus demselben Grund gelten die Theme-Token (var(--…)) im HTML nicht — Farben ausschreiben.',
        ],
        widgets: [
            {
                id: 'w-html-bedienung',
                type: 'html',
                title: 'Beleuchtung',
                datapoint: '',
                layout: 'default',
                gridPos: { x: 0, y: 0, w: 4, h: 5 },
                options: {
                    htmlContent: [
                        '<div style="display:flex;gap:8px;align-items:center">',
                        '  <span style="font-weight:{{ %dp.licht% ? 700 : 400 }}">',
                        "    {{ %dp.licht% ? 'an' : 'aus' }}",
                        '  </span>',
                        '  <button onclick="aura.toggle(\'%dp.licht%\')">Umschalten</button>',
                        '</div>',
                        '<input type="range" min="0" max="100" value="{%dp.dimmer%}"',
                        '       onchange="aura.setState(\'%dp.dimmer%\', Number(this.value))">',
                        '<span>{%dp.dimmer%} %</span>',
                    ].join('\n'),
                    htmlApi: true,
                    sandboxPreset: 'standard',
                    showTitle: true,
                },
            },
        ],
    },
    {
        id: 'klimaanlage-daikin',
        title: 'Klimaanlage mit Datenpunkten je Betriebsart',
        when: 'Eine Klimaanlage, deren Adapter Sollwert, Luefter und Lamellen pro Betriebsart getrennt fuehrt — Daikin ueber daikin-cloud.',
        instead:
            'einer aircontrol-Kachel, die auf den Sollwert genau einer Betriebsart zeigt und in allen anderen leer bleibt',
        notes: [
            'deviceType waehlt das Herstellerprofil: "daikin-cloud", "mitsubishi-local-control" oder "custom" fuer frei gewaehlte Datenpunkte.',
            'Der Platzhalter {mode} in einer Datenpunkt-Id wird zur Laufzeit durch den Namen der laufenden Betriebsart ersetzt. Den Namen liefert common.states von modeDp — bei Daikin 0 = fanOnly, 1 = heating, 2 = cooling, 3 = auto, 4 = dry.',
            'Bei Daikin sehen die Ids so aus: <geraet>.climateControl.temperatureControl.operationModes.{mode}.setpoints.roomTemperature fuer den Sollwert und <geraet>.climateControl.fanControl.operationModes.{mode}.fanSpeed.currentMode fuer den Luefter. {mode} bleibt woertlich in der Id stehen.',
            'Betriebsarten ohne den Datenpunkt zeigen ihn einfach nicht: in "dry" und "fanOnly" gibt es keinen Sollwert, die Soll-Temperatur verschwindet dort von selbst.',
            'tempMin/tempMax/tempStep weglassen — die Grenzen stehen am aufgeloesten Sollwert-Datenpunkt und sind je Betriebsart andere (Heizen 10..30, Kuehlen 18..32).',
            'fanSpeedFixedDp ist die feste Stufe 1..5 und erscheint nur, solange fanSpeedDp auf "fixed" steht.',
            'Die Beschriftungen kommen aus common.states des Geraets; bekannte Rohnamen (cooling, quiet, windNice) werden uebersetzt, unbekannte stehen so da, wie der Adapter sie schreibt.',
        ],
        widgets: [
            {
                id: 'w-klima-wohnzimmer',
                type: 'aircontrol',
                title: 'Klima Wohnzimmer',
                datapoint: '',
                layout: 'default',
                gridPos: { x: 0, y: 0, w: 6, h: 8 },
                options: {
                    deviceType: 'daikin-cloud',
                    powerDp: '%dp.klima.onOffMode%',
                    modeDp: '%dp.klima.operationMode%',
                    currentTempDp: '%dp.klima.roomTemperature%',
                    targetTempDp: '%dp.klima.setpoint.{mode}%',
                    fanSpeedDp: '%dp.klima.fanSpeed.{mode}%',
                    fanSpeedFixedDp: '%dp.klima.fanSpeedFixed.{mode}%',
                    vaneVDp: '%dp.klima.vaneVertical.{mode}%',
                    vaneHDp: '%dp.klima.vaneHorizontal.{mode}%',
                    boostDp: '%dp.klima.powerfulMode%',
                    onlineDp: '%dp.klima.cloudConnected%',
                    errorDp: '%dp.klima.isInErrorState%',
                    humidityDp: '%dp.klima.roomHumidity%',
                    outsideTempDp: '%dp.klima.outdoorTemperature%',
                    showVanes: true,
                    showBoost: true,
                    showHumidity: true,
                    showOutside: true,
                },
            },
        ],
    },
    {
        id: 'uebersicht',
        title: 'Übersichtsseite aller Bereiche und Tabs',
        when: 'Ein Layout hat so viele Bereiche und Tabs, dass niemand mehr weiß, wo was liegt — eine Startseite, die alles auflistet und beim Tippen dorthin springt.',
        instead:
            'einer von Hand gepflegten Seite aus button-Widgets, die bei jedem neuen oder verschobenen Tab nachgezogen werden muss',
        notes: [
            'Das Menü-Widget im Modus "overview" baut die Seite aus dem Layout selbst: je Bereich eine Gruppe (Icon + Name), darunter die Tabs als Chips. Umbenennen, Verschieben und neue Tabs sind sofort drin.',
            'showSearch blendet ein Suchfeld ein, das die Chips live nach Tab- oder Bereichsnamen filtert — bei über hundert Tabs der schnellste Weg.',
            'menuSource "all" listet zusätzlich die Bereiche der anderen Layouts mit dem Layout-Namen als Überschrift; Standard ist nur das aktuelle Layout.',
            'hiddenItems nimmt hier Bereichs-IDs (oder -Slugs) auf und lässt ganze Gruppen weg. Als hidden markierte Bereiche und Tabs fehlen ohnehin.',
            'Die Höhe folgt der Zahl der Tabs — den Chip-Bereich großzügig ziehen, der Inhalt scrollt sonst im Widget.',
        ],
        widgets: [
            {
                id: 'w-uebersicht',
                type: 'menu',
                title: 'Übersicht',
                datapoint: '',
                layout: 'default',
                gridPos: { x: 0, y: 0, w: 12, h: 8 },
                options: {
                    menuMode: 'overview',
                    menuSource: 'layout',
                    showSearch: true,
                    groupTitle: 'iconName',
                    chipSize: 'md',
                    indicatorStyle: 'pills',
                    gap: 8,
                },
            },
        ],
    },
    {
        id: 'akku-status',
        title: 'Akku mit Lade-, Entlade- und Verbindungsanzeige',
        when: 'Ein Gerät meldet neben dem Ladestand auch, ob es gerade lädt oder entlädt und ob es erreichbar ist — Handy, HmIP-Sensor, PV-Speicher.',
        instead:
            'einer Füllstandsanzeige in einer transparenten Gruppe, daneben zwei weitere Kacheln für Laden und Verbindung',
        notes: [
            'chargeDatapoint, dischargeDatapoint und connectedDatapoint werden nur gelesen. Leeres Feld = die Anzeige bleibt genau wie vorher.',
            'chargeCondition sagt, was der Wert bedeutet: true für ein Flag, gt0 für eine Ladeleistung, lt0 für eine Einspeisung.',
            'Eine vorzeichenbehaftete Leistung (packPower) deckt beides ab: denselben Datenpunkt in chargeDatapoint mit gt0 und in dischargeDatapoint mit lt0 — lt0 ist dort ohnehin der Standard.',
            'dischargeColor ist Orange (#f97316) statt des Lade-Grüns; dischargeEffect kennt dieselben drei Effekte. Lädt und entlädt zugleich, gewinnt das Laden den Effekt.',
            'Ein UNREACH-Datenpunkt meldet die Störung, nicht die Verbindung — dort connectedCondition auf "false" setzen, sonst steht das Gerät dauerhaft auf getrennt.',
            'chargeEffect "blink" lässt die Füllung pulsieren, "scan" schickt ein Lauflicht über den gefüllten Teil; das Blitz-Icon zeigt den Zustand auch ohne Effekt.',
            'Ohne Wert gilt ein Datenpunkt weder als ladend noch als getrennt — nach einem Reload graut nichts aus, bevor die Werte da sind.',
        ],
        widgets: [
            {
                id: 'w-akku',
                type: 'fill',
                title: 'Handy-Akku',
                datapoint: '%dp.akku.ladestand%',
                layout: 'battery',
                gridPos: { x: 0, y: 0, w: 4, h: 8 },
                options: {
                    unit: '%',
                    decimals: 0,
                    minValue: 0,
                    maxValue: 100,
                    orientation: 'vertical',
                    showValue: true,
                    chargeDatapoint: '%dp.akku.laedt%',
                    chargeCondition: 'true',
                    chargeEffect: 'blink',
                    showChargeIcon: true,
                    dischargeDatapoint: '%dp.akku.leistung%',
                    dischargeCondition: 'lt0',
                    dischargeEffect: 'blink',
                    showDischargeIcon: true,
                    connectedDatapoint: '%dp.akku.unreach%',
                    connectedCondition: 'false',
                    showOfflineIcon: true,
                    offlineDim: true,
                },
            },
        ],
    },
    {
        id: 'countdown',
        title: 'Verbraucher für eine Weile einschalten',
        when: 'Etwas soll für 30 Minuten laufen und dann von selbst ausgehen — Pumpe, Heizlüfter, Bewässerung, Steckdose.',
        instead:
            'eines Schalters, an dem der Nutzer das Ausschalten selbst erinnern muss, oder eines Skripts mit eigenem Timer',
        notes: [
            'Der Countdown läuft im Adapter, nicht im Browser: Tab zu, Tablet aus — er endet trotzdem und schreibt targetDp.',
            'valueOnStart "true" + valueOnEnd "false" ist das Muster „für N Minuten einschalten“. Stopp schaltet dann ebenfalls zurück (stopWritesEnd greift automatisch, sobald valueOnStart gesetzt ist).',
            'Ohne valueOnStart ist der Countdown eine reine Endaktion (z. B. eine Meldung oder ein Skript-Trigger); Stopp bricht dann still ab.',
            'Skripte steuern das Widget über aura.0.countdowns.<key>.cmd: start, pause, resume, toggle, stop, end, +60, -60, =300. Der Pfad steht nach dem ersten Rendern in stateBaseId — nicht selbst vergeben. In Popup-Ansicht/Gerätekarte mit targetDp "{{dp}}" hat jedes Gerät einen eigenen Kanal <key>_<hash>.',
            'durationSec ist der Startwert; ±-Tasten, Chips und =N ändern die laufende Einstellung, ohne die Option zu überschreiben.',
            'Ein fremder Countdown (mytime.0.Countdowns.<n>.end) wird mit source "datapoint" und dpKind "end-ts" nur angezeigt — dann trägt das Widget den Datenpunkt in datapoint.',
            'Soll der Countdown auch starten, wenn das Gerät anders eingeschaltet wird (Taster, App, Skript), siehe Rezept "countdown-ausloeser" (triggerDp).',
        ],
        widgets: [
            {
                id: 'w-countdown',
                type: 'countdown',
                title: 'Zirkulationspumpe',
                datapoint: '',
                layout: 'default',
                gridPos: { x: 0, y: 0, w: 6, h: 6 },
                options: {
                    durationSec: 1800,
                    stepSec: 300,
                    presets: [900, 1800, 3600],
                    targetDp: '%dp.pumpe.schalter%',
                    valueOnStart: 'true',
                    valueOnEnd: 'false',
                    format: 'auto',
                    showProgress: true,
                    showControls: true,
                    showStep: true,
                    showPresets: true,
                    endedText: 'Fertig',
                    icon: 'mdi:water-pump',
                },
            },
        ],
    },
    {
        id: 'countdown-ausloeser',
        title: 'Nachlauf: nach dem Einschalten automatisch wieder aus',
        when: 'Ein Gerät wird irgendwie eingeschaltet (Taster, App, Skript, Bewegungsmelder) und soll nach x Minuten von selbst ausgehen — Steckdose, Treppenhauslicht, Lüfter-Nachlauf.',
        instead:
            'eines Skripts mit eigenem Timer oder einer Zeitschaltuhr (die kennt nur Uhrzeiten, keine relative Zeit)',
        notes: [
            'Countdown mit triggerDp = targetDp: Der Adapter überwacht den Datenpunkt und startet den Countdown beim Wechsel auf triggerValue (Standard "true"); läuft ohne offenen Browser.',
            'valueOnStart "" (das Gerät ist ja schon an), valueOnEnd "false". Was der Countdown selbst schreibt, löst ihn nicht erneut aus.',
            'triggerStopOnRevert: true — von Hand ausgeschaltet beendet den Countdown still. triggerRestart: true — erneutes Auslösen beginnt die Zeit von vorn.',
            'Bewegungsmelder: triggerDp = Melder, targetDp = Licht, valueOnStart "true", triggerRestart true, triggerStopOnRevert aus (sonst endet er mit der Bewegung).',
            'Nur der Wechsel zählt: Der Wert beim Adapter-Start und gleiche Aktualisierungen lösen nicht aus.',
        ],
        widgets: [
            {
                id: 'w-countdown-nachlauf',
                type: 'countdown',
                title: 'Steckdose Nachlauf',
                datapoint: '',
                layout: 'default',
                gridPos: { x: 0, y: 0, w: 6, h: 6 },
                options: {
                    durationSec: 1800,
                    targetDp: '%dp.steckdose.schalter%',
                    triggerDp: '%dp.steckdose.schalter%',
                    triggerValue: 'true',
                    triggerStopOnRevert: true,
                    valueOnStart: '',
                    valueOnEnd: 'false',
                    showProgress: true,
                    showControls: true,
                    showStep: false,
                    showPresets: false,
                    icon: 'mdi:power-socket-de',
                },
            },
        ],
    },
    {
        id: 'regler-andere-einheit',
        title: 'Regler in einer anderen Einheit als der Datenpunkt',
        when: 'Der Datenpunkt zählt in Sekunden, Millisekunden oder 0…255, bedient werden soll er in Minuten, Sekunden oder Prozent.',
        instead: 'eines Skripts, das zwischen einem Anzeige-Datenpunkt und dem echten hin- und herrechnet',
        notes: [
            'valueFactor/valueOffset wirken an slider, knob, dimmer und input (inputMode "number") in BEIDE Richtungen: gelesen wird Rohwert × Faktor + Offset, geschrieben (Eingabe − Offset) ÷ Faktor.',
            'Alles andere am Widget steht in der UMGERECHNETEN Einheit — min, max, step, unit, die Skala und der angezeigte Wert. Der Datenpunkt behält seine eigene.',
            'Gängige Faktoren: Sekunden → Minuten 0.016666666666666666, Sekunden → Stunden 0.0002777777777777778, Millisekunden → Sekunden 0.001, 0…255 → 0…100 % 0.39215686274509803.',
            'Der Dimmer arbeitet immer in 0…100 %; dort ersetzt der Faktor den Wertebereich des Datenpunkts, min/max gibt es nicht.',
            'Bei wert-anzeige, gauge, chart und fuellstand wirken dieselben Schlüssel nur auf die Anzeige — dort wird nichts geschrieben.',
        ],
        widgets: [
            {
                id: 'w-regler-minuten',
                type: 'slider',
                title: 'Nachlaufzeit',
                datapoint: '%dp.luefter.nachlauf_sekunden%',
                layout: 'default',
                gridPos: { x: 0, y: 0, w: 6, h: 4 },
                options: {
                    valueFactor: 0.016666666666666666,
                    min: 0,
                    max: 60,
                    step: 1,
                    unit: ' min',
                    showValue: true,
                    showScale: true,
                    scaleLabelEvery: 10,
                    commitOnRelease: true,
                    icon: 'mdi:fan-clock',
                },
            },
            {
                id: 'w-dimmer-255',
                type: 'dimmer',
                title: 'Deckenlicht',
                datapoint: '%dp.licht.brightness_0_255%',
                layout: 'default',
                gridPos: { x: 6, y: 0, w: 6, h: 4 },
                options: {
                    valueFactor: 0.39215686274509803,
                    sendOnRelease: true,
                    showToggle: true,
                    icon: 'mdi:ceiling-light',
                },
            },
        ],
    },
    {
        id: 'raumklima-multisensor',
        title: 'Raumklima mit CO₂, Taupunkt und Ampel',
        when: 'Ein Multisensor meldet mehr als Temperatur und Feuchte — CO₂, VOC, Luftqualität, Helligkeit, Präsenz.',
        instead: 'einer Reihe einzelner value-Kacheln neben der Raumklima-Kachel',
        notes: [
            'Temperatur steht in datapoint, Soll/Feuchte/Luftdruck in ihren eigenen Optionen. Jeder WEITERE Wert ist ein Eintrag in metrics — es gibt bewusst keine Optionen co2Datapoint, vocDatapoint o. ä.',
            'metrics[].id muss im Widget eindeutig sein; sie ist auch der Reihen-Schlüssel im Diagramm.',
            'slot "grid" (Vorgabe) stellt den Wert ins Raster unter die Hauptwerte, "secondary" in die rechte Spalte, "primary" groß neben die Temperatur.',
            'thresholds sind [Obergrenze, Farbe] und färben den Wert; valueMap macht aus einer Zahl einen Text (Behaglichkeit 0/1/2, Schulnote 1–6) und sticht dabei die Schwelle — die Einheit entfällt dann.',
            'source "dewpoint", "absoluteHumidity" und "comfort" rechnen aus Ist-Temperatur und Luftfeuchte; sie brauchen keinen Datenpunkt und können nicht ins Diagramm.',
            'inChart zeichnet den Wert als eigene Reihe. Ein Wert in einer ganz anderen Größenordnung gehört auf chartAxis "right", sonst drückt er die Temperaturkurve platt.',
            'Das Diagramm erscheint nur mit gesetzter historyInstance; die Werte müssen dort aufgezeichnet werden.',
            'Die Luftfeuchte kommt mit humidityInChart: true ins Diagramm (Vorgabe rechte Achse) — NICHT als metrics-Eintrag. tempInChart: false nimmt die Temperatur-Reihe heraus.',
        ],
        widgets: [
            {
                id: 'w-raumklima',
                type: 'climate',
                title: 'Wohnzimmer',
                datapoint: '%dp.wohnzimmer.temperatur%',
                layout: 'default',
                gridPos: { x: 0, y: 0, w: 10, h: 8 },
                options: {
                    humidityDatapoint: '%dp.wohnzimmer.luftfeuchte%',
                    unit: '°C',
                    decimals: 1,
                    historyInstance: 'history.0',
                    historyRange: '24h',
                    showYAxis: true,
                    metricColumns: 2,
                    metrics: [
                        {
                            id: 'co2',
                            source: 'datapoint',
                            datapoint: '%dp.wohnzimmer.co2%',
                            label: 'CO₂',
                            icon: 'Wind',
                            unit: 'ppm',
                            decimals: 0,
                            thresholds: [
                                [800, 'var(--accent-green)'],
                                [1400, 'var(--accent-yellow)'],
                                [2000, 'var(--accent-red)'],
                            ],
                            inChart: true,
                            chartAxis: 'right',
                        },
                        {
                            id: 'voc',
                            source: 'datapoint',
                            datapoint: '%dp.wohnzimmer.voc%',
                            label: 'VOC',
                            icon: 'Waves',
                            unit: 'ppb',
                            decimals: 0,
                        },
                        {
                            id: 'dewpoint',
                            source: 'dewpoint',
                            label: 'Taupunkt',
                            icon: 'Droplet',
                            unit: '°C',
                            decimals: 1,
                        },
                        {
                            id: 'comfort',
                            source: 'comfort',
                            label: 'Behaglichkeit',
                            icon: 'Smile',
                            display: 'badge',
                            valueMap: [
                                { v: 0, label: 'unbehaglich', color: 'var(--accent-red)' },
                                { v: 1, label: 'geht noch', color: 'var(--accent-yellow)' },
                                { v: 2, label: 'behaglich', color: 'var(--accent-green)' },
                            ],
                        },
                        {
                            id: 'motion',
                            source: 'datapoint',
                            datapoint: '%dp.wohnzimmer.bewegung%',
                            label: 'Bewegung',
                            display: 'dot',
                            slot: 'secondary',
                            valueMap: [
                                { v: true, label: 'Bewegung', color: 'var(--accent-green)' },
                                { v: false, label: 'ruhig' },
                            ],
                        },
                    ],
                },
            },
        ],
    },
    {
        id: 'eingeklappt-mit-wert',
        title: 'Eingeklapptes Widget, das seinen wichtigsten Wert zeigt',
        when: 'Ein Widget soll wenig Platz belegen (eingeklappt), der Kernwert aber ohne Aufklappen lesbar sein.',
        instead: 'eine zweite value-Kachel neben dem eingeklappten Widget, oder der Wert als [[dp]] im Titel',
        notes: [
            'defaultCollapsed klappt das Widget ein; die Kopfzeile zeigt dann Titel plus die headerItems.',
            'source "widget" nimmt Werte, die das Widget schon hat: "main" = eigener Datenpunkt mit Einheit, Nachkommastellen und valueFactor; bei list/autolist "list:sum", "list:avg", "list:min", "list:max", "list:count", "list:active".',
            'source "dp" zeigt einen beliebigen Datenpunkt; source "text" einen Text mit Bindings ({id}, {id;round(1)}, {dp}, {{ a + b }}, bei Listen auch {sum} {count} {active} …).',
            'slot "r1-left" steht am linken Ende der Titelzeile, "r1-center"/"r1-right" neben dem Titel; ein Element auf "r2-*" erzeugt eine zweite Zeile und macht die eingeklappte Karte eine Kopfzeile höher.',
            'show "collapsed" zeigt ein Element nur im eingeklappten Zustand; ohne show steht es auch aufgeklappt in der Titelzeile.',
            'source "action" setzt das Klick-Aktions-Symbol auf einen Platz (braucht eine clickAction).',
            'clauses blendet ein Element nur bei erfüllter Bedingung ein — hier „2 von 3 an“ nur, solange etwas läuft.',
        ],
        widgets: [
            {
                id: 'w-verbraucher-eingeklappt',
                type: 'list',
                title: 'Verbraucher',
                datapoint: '',
                layout: 'default',
                gridPos: { x: 0, y: 0, w: 6, h: 8 },
                options: {
                    defaultCollapsed: true,
                    entries: [
                        { id: '%dp.waschmaschine.leistung%', label: 'Waschmaschine', unit: 'W' },
                        { id: '%dp.trockner.leistung%', label: 'Trockner', unit: 'W' },
                    ],
                    headerItems: [
                        { id: 'hi-summe', source: 'widget', widgetValue: 'list:sum', slot: 'r1-right' },
                        {
                            id: 'hi-pv',
                            source: 'dp',
                            dp: '%dp.pv.leistung%',
                            decimals: 0,
                            unit: 'W',
                            icon: 'mdi:solar-power',
                            slot: 'r2-left',
                            show: 'collapsed',
                        },
                        {
                            id: 'hi-aktiv',
                            source: 'text',
                            text: '{active} von {count} an',
                            slot: 'r2-right',
                            clauses: [{ datapoint: '{list:active}', operator: '>', value: '0' }],
                        },
                    ],
                },
            },
        ],
    },
    {
        id: 'geraetekarte',
        title: 'Gleiche Geräte: eine Gerätekarte, beliebig oft',
        when: 'Mehrere gleiche Geräte (Thermostate, Fenster, Steckdosen), die jeweils dieselbe Kachel bekommen sollen.',
        instead: 'dieselbe Gruppe oder Liste pro Gerät von Hand nachbauen und jede Änderung N-mal nachziehen',
        notes: [
            'type "devicecard" ist eine Gruppe mit GETEILTEM Aufbau: alle Karten mit derselben defId zeigen dieselben Kinder.',
            'Die Kinder nennen ihre Datenpunkte mit Platzhaltern. Aufgelöst wird gegen den `datapoint` der jeweiligen Karte: ' +
                '{{dp}} = der Datenpunkt selbst, {{parent}} = der Strang darüber, {{parent2}} eine Ebene höher, {{name}} = letztes Segment. ' +
                'Für Titel/Texte: {{dpname}} = common.name des Datenpunkts, {{parentname}}/{{parent2name}} … = common.name ' +
                'von {{parent}}/{{parent2}} … (Gerät, Kanal) — keine IDs, nur zur Anzeige.',
            'Weitere Geräte: nur eine Karte mit derselben defId und anderem `datapoint` in die widgets — ohne groupDefs. ' +
                'groupDefs nur beim ersten Anlegen des Aufbaus (oder für eine neue defId) mitschicken.',
            'Der Kartentitel darf Platzhalter enthalten — {{parentname}} liefert meist den Gerätenamen aus dem Objekt, ' +
                'statt jeder Karte einen festen Titel zu geben.',
            'Eine Änderung an einem Kind gilt für alle Karten. Soll ein Gerät abweichen: im Editor „Als eigene Karte abspalten“.',
        ],
        widgets: [
            {
                id: 'w-karte-bad',
                type: 'devicecard',
                title: 'Bad',
                datapoint: '%dp.thermostat.bad.ist%',
                gridPos: { x: 0, y: 0, w: 8, h: 6 },
                options: { defId: 'gdef-thermostat', showIcon: false },
            },
            {
                id: 'w-karte-kueche',
                type: 'devicecard',
                title: 'Küche',
                datapoint: '%dp.thermostat.kueche.ist%',
                gridPos: { x: 8, y: 0, w: 8, h: 6 },
                options: { defId: 'gdef-thermostat', showIcon: false },
            },
        ],
        groupDefs: {
            'gdef-thermostat': [
                {
                    id: 'child-ist',
                    type: 'value',
                    title: 'Ist',
                    datapoint: '{{parent}}.ACTUAL_TEMPERATURE',
                    gridPos: { x: 0, y: 0, w: 4, h: 3 },
                    options: { unit: '°C', decimals: 1 },
                },
                {
                    id: 'child-soll',
                    type: 'value',
                    title: 'Soll',
                    datapoint: '{{parent}}.SET_POINT_TEMPERATURE',
                    gridPos: { x: 4, y: 0, w: 4, h: 3 },
                    options: { unit: '°C', decimals: 1 },
                },
            ],
        },
    },
    {
        id: 'verlaufstabelle',
        title: 'Letzte Werte oder Schaltvorgänge als Tabelle',
        when: 'Wann zuletzt geschaltet/geöffnet wurde, die letzten Zählerstände oder Messwerte zum Ablesen — mit Datum und Uhrzeit (#760).',
        instead:
            'ein Diagramm, aus dem man Zeitpunkte und genaue Werte nicht ablesen kann, oder eine JSON-Tabelle mit eigenem Skript',
        notes: [
            'historytable liest die Rohwerte aus dem History-Adapter (history, sql, influxdb) — der Datenpunkt muss dort geloggt sein.',
            'historyMode "count" = die letzten historyCount Werte (Höhe planbar: eine Zeile je Wert), "range" = alles aus historyRange (Zeilenzahl erst zur Laufzeit).',
            'hideDuplicates fasst gleiche Werte hintereinander zusammen — für Schaltzustände, die der Adapter wiederholt schreibt.',
            'historyInterval (ms) legt ein festes Raster an, z. B. 1800000 = Werte um 08:00, 08:30 …; historyAggregate "last" = Stand zum Zeitpunkt, "average"/"min"/"max"/"total" = je Schritt vom Adapter gerechnet (Zahlen). Für „Stundenmittel der letzten 24 h“ oder „Zählerstand jeden Tag um Mitternacht“.',
            'valueLabels übersetzt Zahlen und true/false ("0=zu; 1=offen"); ohne die Option gelten die Texte aus common.states.',
            'timeColumns "split" gibt Datum und Uhrzeit eigene Spalten; dateFormat/timeFormat sind Muster wie "EE dd.MM." und "HH:mm".',
            'columns passt einzelne Spalten an wie bei der JSON-Tabelle (ausblenden, Reihenfolge, Farben, Umbruch, Präfix/Suffix); sortRules [{column: "value", order: "desc"}] zeigt z. B. die höchsten der letzten N Werte oben.',
        ],
        widgets: [
            {
                id: 'w-verlaufstabelle',
                type: 'historytable',
                title: '%Titel%',
                datapoint: '%dp.kontakt%',
                layout: 'default',
                gridPos: { x: 0, y: 0, w: 8, h: 10 },
                options: {
                    historyInstance: '%history.0%',
                    historyMode: 'count',
                    historyCount: 10,
                    hideDuplicates: true,
                    timeColumns: 'split',
                    dateFormat: 'EE dd.MM.',
                    timeFormat: 'HH:mm',
                    valueLabels: '0=zu; 1=offen',
                    colValueLabel: 'Zustand',
                },
            },
        ],
    },
    {
        id: 'szenen',
        title: 'Szenen auslösen und im Dashboard anlegen',
        when: 'Der Nutzer will Lichtstimmungen/Szenen („Fernsehabend“, „Alles aus“) per Tipp auslösen oder selbst im Dashboard anlegen und lernen (#825).',
        instead:
            'eine eigene Szenen-Logik aus Tasten, Skripten oder einer Liste mit festen Werten nachbauen — die Szenen gehören dem ioBroker-Szenen-Adapter',
        notes: [
            'Voraussetzung: ioBroker-Adapter "scenes" installiert. Aura speichert keine Szenen selbst; sie liegen als scene.0.* im Szenen-Adapter und funktionieren auch in Skripten, Blockly und Alexa.',
            'Ein Tipp schreibt true auf die Szene. Hervorgehoben ist die Szene, deren State true ist — der Adapter setzt ihn, solange alle Geräte auf ihren Werten stehen.',
            'Szenen selbst (Geräte und deren Werte) legt der Nutzer im Bearbeiten-Dialog des Widgets an („Szenen verwalten“), mit allowEdit auch zur Laufzeit im Dashboard — über das MCP nicht anlegbar. Jeder beschreibbare Datenpunkt außer system.* und scene.* ist erlaubt; die Reihenfolge der Geräte ist die Schaltreihenfolge.',
            'In Aura angelegte Szenen liegen unter scene.0.aura.*; Werte je Gerät von Hand (an/aus, Zahl, Auswahlliste) oder „Aktuelle Werte“ übernehmen. Im Admin des Szenen-Adapters gebaute Szenen zeigt showForeignScenes (nur auslösen).',
            'Höhe: eine Zeile je Szene, die Zahl kennt erst der Adapter zur Laufzeit. Für eine feste Wandtafel autoHeight einschalten oder großzügig planen; layout "card" stellt die Szenen als Kacheln dar.',
        ],
        widgets: [
            {
                id: 'w-szenen',
                type: 'scenes',
                title: '%Titel%',
                datapoint: '',
                layout: 'default',
                gridPos: { x: 0, y: 0, w: 8, h: 9 },
                options: { showForeignScenes: true },
            },
        ],
    },
    {
        id: 'energiefluss',
        title: 'Energiefluss-erweitert-Diagramm einbetten',
        when: 'Der Nutzer hat den Adapter energiefluss-erweitert und will dessen animiertes Energiefluss-Diagramm im Dashboard (#642).',
        instead: 'den Fluss aus Einzelwerten und Pfeilen nachbauen oder das Diagramm mit Farbschema "theme" einbetten',
        notes: [
            'Ein Diagramm pro Adapter-Instanz: die Konfiguration liegt komplett in energiefluss-erweitert.<n>.configuration. Ein zweites Diagramm braucht eine zweite Instanz und ?instance=<n> in der URL.',
            'Die Seite läuft nur über den Web-Adapter (Standard-Port 8082), weil sie /socket.io relativ lädt — nicht über Auras Port und nicht über useProxy.',
            'iframeColorScheme "neutral" (Standard für diese URL, wenn nicht gesetzt): bei "theme" malt der Browser eine weiße Fläche hinter das transparente Diagramm.',
            'Farben von Icons und Texten kommen aus der Energiefluss-Konfiguration, nicht aus Aura; theme=dark in der URL färbt nur die Adapter-Oberfläche. Für ein dunkles Dashboard dort helle Farben wählen.',
            'interactionMode "action" legt eine Sperrschicht darüber, damit Wischen und Klick-Aktion beim Dashboard bleiben; "content", wenn Elemente des Diagramms selbst anklickbar sein sollen.',
            'Das Diagramm skaliert auf die Breite; das Seitenverhältnis stammt aus basic.width/basic.height der Energiefluss-Konfiguration — die Widget-Höhe danach wählen.',
        ],
        widgets: [
            {
                id: 'w-energiefluss',
                type: 'iframe',
                title: 'Energiefluss',
                datapoint: '',
                layout: 'default',
                gridPos: { x: 0, y: 0, w: 8, h: 4 },
                options: {
                    iframeUrl: 'https://%iobroker-host%:8082/energiefluss-erweitert/index.html?instance=0',
                    iframeColorScheme: 'neutral',
                    interactionMode: 'action',
                    showTitle: false,
                    showIcon: false,
                },
            },
        ],
    },
    {
        id: 'custom-aus-layout',
        title: 'Festes Layout als Custom-Raster weiterbauen',
        when: 'Ein Widget soll aussehen wie eines seiner festen Layouts (Rundskala, Karte, Kompakt …), aber eine Zeile mehr zeigen — z. B. die Luftfeuchte unter dem Thermostat.',
        instead: 'ein leeres Custom-Raster von Grund auf, oder ein zweites Widget direkt darunter',
        notes: [
            'aura_widget_schema mit customFrom="<layout>" liefert das Raster, das der Editor beim Wechsel auf Custom baut (#768) — als options.customGrid übernehmen, dann Zeilen anhängen.',
            'Die Zellen verweisen auf Felder und Komponenten des Widgets selbst (hier "dial" und "presets" des Thermostats); sie bleiben live, wie im festen Layout.',
            'Farben wie var(--aura-state-color) setzt das Widget je Zustand (Heizen/Kühlen, an/aus, Schwellwert) — nicht durch feste Farben ersetzen, sonst geht der Zustand verloren.',
            'Karten-Layouts bringen bg/borderColor am Raster mit (Verlauf + Rahmen); weglassen = schlichte Kachel.',
            'Die Vorlage ist mit Standard-Optionen gebaut: ist showTitle/showIcon/showPresets aus, die zugehörige Zelle bzw. Zeile entfernen.',
        ],
        widgets: [
            {
                id: 'w-custom-aus-layout',
                type: 'thermostat',
                title: '%Raumname%',
                datapoint: '%dp.sollwert%',
                layout: 'custom',
                gridPos: { x: 0, y: 0, w: 10, h: 9 },
                options: {
                    actualDatapoint: '%dp.istwert%',
                    customGrid: {
                        cols: 1,
                        rows: 3,
                        cells: [
                            { type: 'component', componentKey: 'dial', align: 'center', valign: 'middle' },
                            { type: 'component', componentKey: 'presets', align: 'center', valign: 'middle' },
                            {
                                type: 'dp',
                                dpId: '%dp.luftfeuchte%',
                                prefix: 'Luftfeuchte ',
                                suffix: ' %',
                                decimals: 0,
                                fontSize: 12,
                                color: 'var(--text-secondary)',
                                align: 'center',
                                valign: 'middle',
                            },
                        ],
                        rowSizes: ['1fr', 'auto', 'auto'],
                    },
                },
            },
        ],
    },
    {
        id: 'grundriss',
        title: 'Grundriss mit Bedienelementen',
        when: 'Ein Grundriss- oder Raumbild, auf dem Lampen, Temperaturen und Türen an ihrer Stelle im Raum sitzen.',
        instead: 'einem Bild-Widget mit lauter einzelnen Kacheln daneben',
        notes: [
            'Bild-Widget (jedes Widget mit layout "custom" geht): Zelle 0 ist eine image-Zelle mit colSpan = cols und rowSpan = rows, sie liegt unter dem ganzen Raster.',
            'Alle übrigen nicht leeren Zellen liegen auf dem Bild und werden darüber gezeichnet. Position = Index row * cols + col; auf 1×1-Zellen geht das genauso wie auf Zellen mit Spanne.',
            'objectFit "fill" streckt das Bild genau auf das Raster: die Elemente bleiben bei jeder Widget-Größe auf ihrem Raum. Das Seitenverhältnis des Widgets dem Bild ungefähr angleichen, sonst wird es verzerrt.',
            'Ein feineres Raster (z. B. 20×20) setzt die Elemente genauer; colSpan gibt Beschriftungen Platz.',
            'Anzeigezellen bekommen clickAction: popup-switch / popup-dimmer / popup-shutter für das Gerät der Zelle, popup-thermostat mit setpointDp, link-tab für ein anderes Stockwerk.',
            'Text auf dem Bild mit bg "var(--widget-bg)" und bgMode "content" als Etikett hinterlegen, sonst ist er auf Linien schlecht lesbar.',
            'Ein schaltender Datenpunkt wie die Haustür als switch-Zelle mit controlMode "icon" und confirmAction.',
        ],
        widgets: [
            {
                id: 'w-grundriss',
                type: 'image',
                title: 'Erdgeschoss',
                datapoint: '',
                layout: 'custom',
                gridPos: { x: 0, y: 0, w: 10, h: 12 },
                options: {
                    showTitle: false,
                    showIcon: false,
                    customGrid: {
                        cols: 10,
                        rows: 10,
                        cells: gridCells(10, 10, [
                            [
                                0,
                                0,
                                {
                                    type: 'image',
                                    imageUrl: '%bild.grundriss%',
                                    objectFit: 'fill',
                                    colSpan: 10,
                                    rowSpan: 10,
                                },
                            ],
                            [
                                2,
                                3,
                                {
                                    type: 'state-icon',
                                    dpId: '%dp.licht.essen%',
                                    trueIcon: 'Lightbulb',
                                    falseIcon: 'Lightbulb',
                                    trueColor: 'var(--accent-yellow)',
                                    falseColor: 'var(--text-secondary)',
                                    fontSize: 24,
                                    align: 'center',
                                    clickAction: { kind: 'popup-switch' },
                                    popup: { title: 'Licht Essen' },
                                },
                            ],
                            [
                                3,
                                5,
                                {
                                    type: 'dp',
                                    dpId: '%dp.temperatur.wohnen%',
                                    prefix: '🌡 ',
                                    suffix: ' °C',
                                    decimals: 1,
                                    bold: true,
                                    color: 'var(--text-primary)',
                                    bg: 'var(--widget-bg)',
                                    bgMode: 'content',
                                    align: 'center',
                                    colSpan: 2,
                                    clickAction: { kind: 'popup-thermostat', setpointDp: '%dp.solltemperatur.wohnen%' },
                                    popup: { title: 'Heizung Wohnen' },
                                },
                            ],
                            [
                                9,
                                5,
                                {
                                    type: 'switch',
                                    dpId: '%dp.haustuer.verriegelt%',
                                    controlMode: 'icon',
                                    trueIcon: 'Lock',
                                    falseIcon: 'LockOpen',
                                    trueColor: 'var(--accent-green)',
                                    falseColor: 'var(--accent-red)',
                                    fontSize: 24,
                                    align: 'center',
                                    confirmAction: true,
                                    confirmText: 'Haustür umschalten?',
                                },
                            ],
                        ]),
                    },
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
    const defsJson = recipe.groupDefs ? JSON.stringify(recipe.groupDefs) : '';
    const placeholders = [...new Set([...(json.match(PLACEHOLDER) || []), ...(defsJson.match(PLACEHOLDER) || [])])];
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
    if (recipe.groupDefs) {
        parts.push(
            '## groupDefs',
            'Die Kinder der Gruppen/Karten — als Feld "groupDefs" mit an das Schreib-Werkzeug geben.',
            JSON.stringify(recipe.groupDefs, null, 2),
            '',
        );
    }
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
