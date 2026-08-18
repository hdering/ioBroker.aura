# Diagramm (erweitert)

Mehrere Datenpunkte in einem Diagramm — pro Serie eigener Typ (Linie, Fläche, Balken, Punkte), Farbe und Y-Achse. Auf ECharts basierend, mit zwei Y-Achsen, Legende, Vergleichs- und Gauge-Modus sowie einem JSON-Override für ECharts-Feineinstellungen.

## Datenpunkt

Das Widget hat keinen eigenen Haupt-Datenpunkt — jede Serie trägt ihren Datenpunkt selbst.

| Feld                             | Pflicht | Typ                 |                                               |
| -------------------------------- | ------- | ------------------- | --------------------------------------------- |
| `echartSeries[].datapointId`     | ja      | `number` · `string` | Datenpunkt der Serie (`string` im JSON-Modus) |
| `echartSeries[].historyInstance` | nein    | —                   | History-Adapter; leer = Live-Daten            |
| `echartSeries[].source`          | nein    | —                   | `history` (Standard) · `json`                 |

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

**Feldnamen müssen nicht konfiguriert werden.** Der Editor liest den Datenpunkt aus, erkennt Beschriftungs- und Wertfeld selbst und bietet die tatsächlich vorhandenen Schlüssel in zwei Auswahlfeldern an — inklusive Vorschau des ersten Eintrags. Bekannte Namen (`label`/`value`, `ts`/`val`, `x`/`y`, `time`/`amount`, `name`/`count`) werden bevorzugt, sonst gilt: erstes Feld = Beschriftung, erstes numerisches Feld = Wert. `jsonLabelKey`/`jsonValueKey` sind nur nötig, wenn die Erkennung danebenliegt.

Sind die Beschriftungen Zeitstempel, schaltet `echartJsonTimeAxis` auf eine echte Zeitachse mit korrekten Abständen:

```json
[
    { "ts": "1785362400000", "val": 0 },
    { "ts": "1785366000000", "val": 2.5 }
]
```

`ts` und `val` erkennt der Editor selbst; erkennt er zusätzlich, dass alle Beschriftungen Zeitstempel sind, schaltet er die Zeitachse einmalig von allein ein. Akzeptiert werden Epoch in Millisekunden, Epoch in Sekunden und ISO-Datumsstrings; Einträge ohne gültigen Zeitstempel entfallen. Reine Jahreszahlen wie `2024` gelten nicht als Zeitstempel — dafür die Option ausgeschaltet lassen.

### Gauge

Tacho-Anzeige des aktuellen Werts der ersten Serie (Widget-Layout `gauge`).

### Custom

Frei in einer Zellenmatrix platzieren — siehe [Custom-Layout](./custom-layout).

## Einstellungen

Alle Optionen werden im Editor unter **Widget bearbeiten** gesetzt.

![](./assets/diagramm-erweitert/config.png)

### Anzeige

| Option              | Standard                                  |                                                                                                         |
| ------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `showTitle`         | `true`                                    | Titel anzeigen                                                                                          |
| `showIcon`          | `true`                                    | Icon anzeigen                                                                                           |
| `icon`              | `BarChart2`                               | [Lucide-Icon](https://lucide.dev)                                                                       |
| `iconSize`          | `20`                                      | px                                                                                                      |
| `titleAlign`        | `left`                                    | `left` · `center` · `right`                                                                             |
| `echartShowCurrent` | `true`                                    | aktuelle Werte oben rechts anzeigen                                                                     |
| `echartShowValues`  | im Vergleichs-Modus `true`, sonst `false` | Werte am Datenpunkt anzeigen (Format und Einheit wie im Tooltip; überlappende Beschriftungen entfallen) |
| `echartShowLegend`  | `true`                                    | Legende anzeigen                                                                                        |
| `decimals`          | globale Einstellung                       | Nachkommastellen in Tooltip, Wert-Labels, aktuellem Wert und Achsenbeschriftung                         |

### Serien

| Option                        | Standard     |                                                                                                                                                                                                                    |
| ----------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `echartMode`                  | `timeseries` | `timeseries` · `comparison` · `json`                                                                                                                                                                               |
| `echartSeries`                | `[]`         | Liste der Serien (siehe unten)                                                                                                                                                                                     |
| `echartSeries[].name`         | `Serie N`    | Name in Legende/Tooltip                                                                                                                                                                                            |
| `echartSeries[].chartType`    | `line`       | `line` · `area` · `bar` · `scatter`                                                                                                                                                                                |
| `echartSeries[].color`        | Palette      | Linien-/Balkenfarbe                                                                                                                                                                                                |
| `echartSeries[].yAxisIndex`   | `0`          | `0` = links, `1` = rechte Y-Achse                                                                                                                                                                                  |
| `echartSeries[].smooth`       | `true`       | geglättete Linie (nur Linie/Fläche)                                                                                                                                                                                |
| `echartSeries[].stack`        | `false`      | Serie auf die anderen gestapelten Serien derselben Y-Achse addieren (siehe unten)                                                                                                                                  |
| `echartSeries[].aggregate`    | `average`    | `average` · `minmax` · `max` · `min` · `total` · `delta` · `none` — `minmax` erhält echte Extremwerte mit echten Zeitstempeln (empfohlen für änderungsbasiert geloggte Zähler wie Tagesregen), `delta` siehe unten |
| `echartSeries[].deltaBucket`  | `hour`       | `auto` · `hour` · `day` · `week` · `month` · `year` — Zeiteinheit für `aggregate: delta`                                                                                                                           |
| `echartSeries[].lineWidth`    | `2`          | Linienstärke 0–4, `0` = keine Linie (nur Linie/Fläche)                                                                                                                                                             |
| `echartSeries[].stackOutline` | `false`      | Kontur eines gestapelten Bandes zeichnen (nur gestapelte Fläche)                                                                                                                                                   |

### Stapeln

`Stapeln` je Serie: die Serie wird auf die anderen gestapelten Serien **derselben Y-Achse** addiert —
z. B. Speicher-Entladung 150 W + Netzbezug 50 W als Bänder, die zusammen den Hausverbrauch von 200 W
ergeben. Für Linie, Fläche und Balken; Flächen werden dabei kräftiger eingefärbt.

- Linke und rechte Y-Achse stapeln getrennt — Werte zweier verschieden skalierter Achsen zu addieren
  ergäbe keine sinnvolle Zahl.
- Eine gestapelte Achse beginnt bei 0, damit die Bandhöhen den Werten entsprechen. Ein gesetztes
  `Min` hat weiterhin Vorrang.
- Der Tooltip zeigt weiter den Einzelwert jeder Serie und zusätzlich eine Zeile `Σ Summe`.
- Gestapelte Flächen werden ohne Kontur gezeichnet: die Kontur läge auf der Oberkante des Bandes
  darunter, eine Serie mit Wert 0 sähe also aus wie eine Linie ohne Fläche. Bei Bedarf per
  `Bandkontur` je Serie wieder einschalten — der Wert 0 bleibt in Tooltip und `Σ Summe` erhalten.
- Serien mit eigenen Zeitstempeln werden vorher auf eine gemeinsame Zeitachse gebracht (jede Serie
  behält ihren letzten gemeldeten Wert bis zur nächsten Messung). Vor dem ersten Datensatz einer
  Serie bleibt das Band offen, statt eine 0 zu erfinden.

### Werte-Transformation

ƒx-Button neben dem Datenpunkt-Feld der Serie. Reine Anzeige-Umrechnung `Wert × Faktor + Offset`,
je Serie einzeln — der Datenpunkt und seine History bleiben unverändert. Gilt für Kurve, Tooltip,
Legende und den aktuellen Wert; ein Preset (z. B. `W → kW`) setzt gleich die Einheit der Y-Achse,
an der die Serie hängt.

| Option                          | Standard |                         |
| ------------------------------- | -------- | ----------------------- |
| `echartSeries[].valueTransform` | —        | Preset-Id oder `custom` |
| `echartSeries[].valueFactor`    | `1`      | Multiplikator           |
| `echartSeries[].valueOffset`    | `0`      | Summand                 |

Bei `aggregate: delta` wird vor der Differenzbildung umgerechnet: der Faktor wirkt auf den Verbrauch,
der Offset fällt heraus (die Differenz zweier verschobener Zählerstände ist dieselbe).

### Verbrauch aus Zählerständen

`aggregate: delta` für Zähler. Statt des Zählerstands wird der Zuwachs je Zeiteinheit gezeichnet — also der Verbrauch bzw. Ertrag pro Stunde, Tag, Woche, Monat oder Jahr.

| Bauart                       | Beispiel                                          |
| ---------------------------- | ------------------------------------------------- |
| fortlaufend steigend         | Strom-, Wasser-, Gaszähler, PV-Gesamtertrag       |
| täglicher Rücksprung auf `0` | PV-Tagesertrag, z. B. `solaredge.0.*.lastDayData` |

|                                |                                                                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Datenquelle                    | Verlaufs-Adapter (history, influxdb, sql)                                                                                |
| Zeiteinheit                    | `deltaBucket` — Kalendergrenzen in lokaler Zeit                                                                          |
| Chart-Typ                      | beim Umschalten automatisch `bar`                                                                                        |
| Y-Achse                        | `echartLeftMin: 0` setzen — die automatische Skala beginnt am kleinsten Balken                                           |
| Rücksprung um Mitternacht      | Reset eines Tageszählers; der Anstieg danach zählt voll                                                                  |
| Rücksprung innerhalb des Tages | Zählerwechsel, Überlauf oder Ausreißer — weder der Rücksprung noch der Sprung zurück auf den alten Stand werden gewertet |
| Buckets ohne Datensatz         | übersprungen; ihr Verbrauch fällt in den nächsten Bucket mit Daten                                                       |
| Aktueller Wert oben rechts     | Verbrauch des laufenden Buckets, nicht der Zählerstand                                                                   |

Bilder dazu: [Beispiele](#beispiele).

`deltaBucket: auto` leitet die Zeiteinheit aus dem aktiven Zeitraum ab und wechselt mit, wenn im Frontend umgeschaltet wird:

| Zeitraum     | Zeiteinheit |
| ------------ | ----------- |
| bis 1 Tag    | pro Stunde  |
| bis 45 Tage  | pro Tag     |
| bis 180 Tage | pro Woche   |
| bis 1 Jahr   | pro Monat   |
| darüber      | pro Jahr    |

### JSON-Quelle

Nur im Modus `json`.

| Option                        | Standard    |                                                                   |
| ----------------------------- | ----------- | ----------------------------------------------------------------- |
| `echartSeries[].jsonPath`     | —           | Punkt-Pfad bis zum Array, z. B. `data.hours`; leer = Wurzel       |
| `echartSeries[].jsonLabelKey` | automatisch | Objekt-Feld für die X-Beschriftung; leer = erkennen               |
| `echartSeries[].jsonValueKey` | automatisch | Objekt-Feld für den Y-Wert; leer = erkennen                       |
| `echartJsonTimeAxis`          | `false`     | Beschriftungen als Zeitstempel lesen → Zeitachse statt Kategorien |

### Achsen

| Option                              | Standard |                                                                                         |
| ----------------------------------- | -------- | --------------------------------------------------------------------------------------- |
| `echartShowYAxis`                   | `true`   | Y-Achsen anzeigen                                                                       |
| `echartShowYAxisRight`              | `true`   | rechte Y-Achse beschriften; aus = nur die linke Skala, die rechte Achse skaliert weiter |
| `echartShowXAxis`                   | `true`   | X-Achse anzeigen                                                                        |
| `echartShowGridLines`               | `true`   | horizontale Hilfslinien                                                                 |
| `echartLeftUnit`                    | —        | Einheit der linken Y-Achse                                                              |
| `echartRightUnit`                   | —        | Einheit der rechten Y-Achse                                                             |
| `echartLeftMin` / `echartLeftMax`   | `auto`   | Skala links; Zahl oder `dataMin`/`dataMax`                                              |
| `echartRightMin` / `echartRightMax` | `auto`   | Skala rechts; Zahl oder `dataMin`/`dataMax`                                             |

### Verlauf

Ein gemeinsamer Zeitraum für alle Serien.

| Option                   | Standard |                                                                                  |
| ------------------------ | -------- | -------------------------------------------------------------------------------- |
| `echartRange`            | `24h`    | `1h` · `6h` · `24h` · `7d` · `30d` · `1y` · `total` · `custom`                   |
| `echartRangeCustomValue` | `24`     | nur bei `custom`                                                                 |
| `echartRangeCustomUnit`  | `h`      | `h` · `d`, nur bei `custom`                                                      |
| `lockRange`              | `false`  | Zeitraum-Umschalter im Frontend ausblenden                                       |
| `echartVisibleRanges`    | alle     | Welche Presets der Frontend-Umschalter anbietet, z. B. `["6h","24h","7d","30d"]` |
| `echartDayNav`           | `false`  | Tages-Navigation im Frontend (◀ Heute ▶) — einzelne Kalendertage durchblättern   |
| `autoHistoryInstance`    | `false`  | History-Instanz je Serie automatisch erkennen                                    |

`total` (Umschalter: **Gesamt**) zeichnet alles, was der Verlaufs-Adapter hergibt.

|                      |                                                                                         |
| -------------------- | --------------------------------------------------------------------------------------- |
| Fensterstart         | wird je Serie beim Adapter ermittelt, nicht konfiguriert                                |
| Auflösung            | ergibt sich aus der gefundenen Länge — je länger die Historie, desto grober der Schritt |
| Obergrenze der Suche | 20 Jahre; älter ist ioBroker selbst nicht                                               |
| `deltaBucket: auto`  | ab 400 Tagen Historie `year`, darunter entsprechend feiner                              |
| Adapter ohne Daten   | leeres Diagramm, wie jeder andere Zeitraum ohne Datensätze                              |

Der Fensterstart kostet eine zusätzliche, grobe Abfrage je Serie. Bei sehr langen Historien auf dem dateibasierten `history`-Adapter ist der erste Aufbau daher merklich langsamer als bei `influxdb` oder `sql`.

### JSON-Override

| Option            | Standard |                                                      |
| ----------------- | -------- | ---------------------------------------------------- |
| `echartJsonExtra` | —        | JSON, das tief in die ECharts-Optionen gemischt wird |

## Beispiele

Vier Datenpunkte, alle per `history.0` geloggt: PV-Ertragszähler `demo.0.PV.Ertrag_Gesamt` (kWh, fortlaufend steigend), Hausleistung `demo.0.Haus.Leistung` (W), Außentemperatur `demo.0.Wetter.Aussentemperatur` (°C) und Regenmenge `demo.0.Regen.Menge` (mm je Messintervall).

### Zählerstand → Tagesertrag

`aggregate: average` · `chartType: line` · `echartRange: 30d` — der Zähler steigt, der Tagesertrag ist daraus nicht ablesbar:

![](./assets/diagramm-erweitert/bsp-zaehlerstand.png)

Derselbe Datenpunkt mit `aggregate: delta` · `deltaBucket: day` · `chartType: bar` · `echartLeftMin: 0`:

![](./assets/diagramm-erweitert/bsp-delta-tag.png)

Die Einstellungen dazu im Editor:

![](./assets/diagramm-erweitert/bsp-config-delta.png)

### Zeiteinheit

`deltaBucket: hour` · `echartRange: 24h` — Tagesverlauf, ein Balken je Stunde:

![](./assets/diagramm-erweitert/bsp-delta-stunde.png)

`deltaBucket: month` · `echartRange: 1y` — Monatserträge über ein Jahr:

![](./assets/diagramm-erweitert/bsp-delta-monat.png)

`deltaBucket: year` · `echartRange: custom` / `1825 d` — Jahreserträge, der letzte Balken ist das laufende Jahr:

![](./assets/diagramm-erweitert/bsp-delta-jahr.png)

### Zeiteinheit automatisch

`deltaBucket: auto` · `echartVisibleRanges: ["24h","30d","1y"]` — die Zeiteinheit wechselt mit dem Umschalter im Frontend. **30 Tage** ergibt Tagesbalken:

![](./assets/diagramm-erweitert/bsp-auto-30d.png)

**1 Jahr** ergibt Monatsbalken — ohne Änderung an der Konfiguration:

![](./assets/diagramm-erweitert/bsp-auto-1y.png)

### Spitzen: Mittelwert oder Min/Max

Hausleistung über 24 h. `aggregate: average` glättet jedes 15-Minuten-Fenster — der Backofen wird zu einem Plateau, der Wasserkocher verschwindet fast:

![](./assets/diagramm-erweitert/bsp-agg-average.png)

`aggregate: minmax` behält die echten Extremwerte samt Zeitstempel — die Spitzen und das Takten der Geräte bleiben sichtbar:

![](./assets/diagramm-erweitert/bsp-agg-minmax.png)

### Maximum, Mittelwert, Minimum

Derselbe Datenpunkt dreimal als eigene Serie, `echartRange: 1y` (Tages-Fenster): `max` zeichnet die Nachmittage, `min` die Nächte, `average` den Tagesmittelwert. Die Aggregation gilt je Serie, nicht je Widget.

![](./assets/diagramm-erweitert/bsp-agg-envelope.png)

### Summe

`aggregate: total` addiert die Werte im Zeitfenster — für Datenpunkte, die bereits Zuwächse loggen (Regenmenge je Messintervall, Wh je Impuls), nicht für Zählerstände (dafür `delta`). Hier Regenmenge je 10 Minuten, summiert auf Stundenwerte:

![](./assets/diagramm-erweitert/bsp-agg-total.png)

Derselbe Datenpunkt mit `average`: gleiche Form, aber der Durchschnitt der Einzelzuwächse — 0,6 mm statt 3,6 mm:

![](./assets/diagramm-erweitert/bsp-agg-total-average.png)

### Rohdaten

`aggregate: none` liefert jeden geloggten Datensatz, ohne Zeitfenster. Das Takten der Waschmaschine (2 300 W an/aus) ist damit sichtbar:

![](./assets/diagramm-erweitert/bsp-agg-none.png)

`average` fasst dasselbe in 5-Minuten-Fenster zusammen — aus dem Takten wird ein Plateau bei ~1 100 W:

![](./assets/diagramm-erweitert/bsp-agg-none-average.png)

Viele Datensätze kosten Ladezeit; `none` ist für kurze Zeiträume gedacht, nicht für 30 Tage.

### Stapeln

Zwei Serien mit `stack: true` und `chartType: area` auf derselben Y-Achse: Netzbezug und Speicher-Entladung ergeben zusammen den Hausverbrauch. Der Tooltip zeigt die Einzelwerte plus `Σ Summe`.

![](./assets/diagramm-erweitert/bsp-stapeln.png)

::: tip Bilder neu erzeugen
`node tools/screenshots/echart-examples.mjs` gegen einen laufenden `npm run dev`. Die Daten sind im Skript erzeugt (fester Zeitpunkt, fester Zufallsgenerator), es wird keine Instanz gelesen oder geschrieben.
:::
