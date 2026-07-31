# Diagramm (erweitert)

Mehrere Datenpunkte in einem Diagramm — pro Serie eigener Typ (Linie, Fläche, Balken, Punkte), Farbe und Y-Achse. Auf ECharts basierend, mit zwei Y-Achsen, Legende, Vergleichs- und Gauge-Modus sowie einem JSON-Override für ECharts-Feineinstellungen.

## Datenpunkt

Das Widget hat keinen eigenen Haupt-Datenpunkt — jede Serie trägt ihren Datenpunkt selbst.

| Feld | Pflicht | Typ | |
| --- | --- | --- | --- |
| `echartSeries[].datapointId` | ja | `number` · `string` | Datenpunkt der Serie (`string` im JSON-Modus) |
| `echartSeries[].historyInstance` | nein | — | History-Adapter; leer = Live-Daten |
| `echartSeries[].source` | nein | — | `history` (Standard) · `json` |

## Layouts

Das Diagramm-Verhalten steuert die Option `echartMode`; das Widget-Layout `gauge` schaltet auf eine Tacho-Anzeige.

### Timeseries
Zeitachsen-Diagramm mit allen Serien über die Zeit — Standard.

### Comparison
Kategorisches Balkendiagramm — je Serie ein Balken mit ihrem aktuellen Wert.

### JSON
Kategorisches Diagramm aus einem JSON-Datenpunkt statt aus einem History-Adapter — die Labels bilden die X-Achse, in der Reihenfolge des Arrays. Kein Zeitraum-Umschalter, keine Tages-Navigation.

Erwartetes Format im Datenpunkt (String oder Objekt):

```json
[
  { "label": "12:00", "value": "0.5" },
  { "label": "13:00", "value": "1.2" }
]
```

Werte dürfen Strings sein und werden in Zahlen gewandelt; Einträge ohne gültige Zahl entfallen. Mehrere Serien werden über gleiche Labels ausgerichtet, fehlende Labels lassen die Linie brechen.

Sind die Beschriftungen Zeitstempel, schaltet `echartJsonTimeAxis` auf eine echte Zeitachse mit korrekten Abständen:

```json
[
  { "ts": "1785362400000", "val": 0 },
  { "ts": "1785366000000", "val": 2.5 }
]
```

Dann `jsonLabelKey: ts` und `jsonValueKey: val` setzen. Erkannt werden Epoch in Millisekunden, Epoch in Sekunden und ISO-Datumsstrings; Einträge ohne gültigen Zeitstempel entfallen. Reine Jahreszahlen wie `2024` gelten nicht als Zeitstempel — dafür die Option ausgeschaltet lassen.

### Gauge
Tacho-Anzeige des aktuellen Werts der ersten Serie (Widget-Layout `gauge`).

### Custom
Frei in einer Zellenmatrix platzieren — siehe [Custom-Layout](./custom-layout).

## Einstellungen

Alle Optionen werden im Editor unter **Widget bearbeiten** gesetzt.

![](./assets/diagramm-erweitert/config.png)

### Anzeige

| Option | Standard | |
| --- | --- | --- |
| `showTitle` | `true` | Titel anzeigen |
| `showIcon` | `true` | Icon anzeigen |
| `icon` | `BarChart2` | [Lucide-Icon](https://lucide.dev) |
| `iconSize` | `20` | px |
| `titleAlign` | `left` | `left` · `center` · `right` |
| `echartShowCurrent` | `true` | aktuelle Werte oben rechts anzeigen |
| `echartShowLegend` | `true` | Legende anzeigen |
| `decimals` | globale Einstellung | Nachkommastellen im Tooltip |

### Serien

| Option | Standard | |
| --- | --- | --- |
| `echartMode` | `timeseries` | `timeseries` · `comparison` · `json` |
| `echartSeries` | `[]` | Liste der Serien (siehe unten) |
| `echartSeries[].name` | `Serie N` | Name in Legende/Tooltip |
| `echartSeries[].chartType` | `line` | `line` · `area` · `bar` · `scatter` |
| `echartSeries[].color` | Palette | Linien-/Balkenfarbe |
| `echartSeries[].yAxisIndex` | `0` | `0` = links, `1` = rechte Y-Achse |
| `echartSeries[].smooth` | `true` | geglättete Linie (nur Linie/Fläche) |
| `echartSeries[].aggregate` | `average` | `average` · `minmax` · `max` · `min` · `total` — `minmax` erhält echte Extremwerte mit echten Zeitstempeln (empfohlen für änderungsbasiert geloggte Zähler wie Tagesregen) |
| `echartSeries[].lineWidth` | `2` | Linienstärke 1–4 (nur Linie/Fläche) |

### JSON-Quelle

Nur im Modus `json`.

| Option | Standard | |
| --- | --- | --- |
| `echartSeries[].jsonPath` | — | Punkt-Pfad bis zum Array, z. B. `data.hours`; leer = Wurzel |
| `echartSeries[].jsonLabelKey` | `label` | Objekt-Feld für die X-Beschriftung |
| `echartSeries[].jsonValueKey` | `value` | Objekt-Feld für den Y-Wert |
| `echartJsonTimeAxis` | `false` | Beschriftungen als Zeitstempel lesen → Zeitachse statt Kategorien |

### Achsen

| Option | Standard | |
| --- | --- | --- |
| `echartShowYAxis` | `true` | Y-Achse anzeigen |
| `echartShowXAxis` | `true` | X-Achse anzeigen |
| `echartShowGridLines` | `true` | horizontale Hilfslinien |
| `echartLeftUnit` | — | Einheit der linken Y-Achse |
| `echartRightUnit` | — | Einheit der rechten Y-Achse |
| `echartLeftMin` / `echartLeftMax` | `auto` | Skala links; Zahl oder `dataMin`/`dataMax` |
| `echartRightMin` / `echartRightMax` | `auto` | Skala rechts; Zahl oder `dataMin`/`dataMax` |

### Verlauf

Ein gemeinsamer Zeitraum für alle Serien.

| Option | Standard | |
| --- | --- | --- |
| `echartRange` | `24h` | `1h` · `6h` · `24h` · `7d` · `30d` · `custom` |
| `echartRangeCustomValue` | `24` | nur bei `custom` |
| `echartRangeCustomUnit` | `h` | `h` · `d`, nur bei `custom` |
| `lockRange` | `false` | Zeitraum-Umschalter im Frontend ausblenden |
| `echartVisibleRanges` | alle | Welche Presets der Frontend-Umschalter anbietet, z. B. `["6h","24h","7d","30d"]` |
| `echartDayNav` | `false` | Tages-Navigation im Frontend (◀ Heute ▶) — einzelne Kalendertage durchblättern |
| `autoHistoryInstance` | `false` | History-Instanz je Serie automatisch erkennen |

### JSON-Override

| Option | Standard | |
| --- | --- | --- |
| `echartJsonExtra` | — | JSON, das tief in die ECharts-Optionen gemischt wird |
