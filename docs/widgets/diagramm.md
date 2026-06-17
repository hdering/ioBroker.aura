# Diagramm (einfach)

Zeigt den Verlauf eines einzelnen Datenpunkts als Linien- oder Flächendiagramm. Liest den Verlauf aus einer History-Instanz (History/SQL/InfluxDB); ohne konfigurierte Instanz wartet das Widget auf Live-Daten. Zeitraum, Achsen und Durchschnitt sind einstellbar.

## Datenpunkt

| Feld | Pflicht | Typ | |
| --- | --- | --- | --- |
| `datapoint` | ja | `number` | Datenpunkt, dessen Verlauf gezeigt wird |

Die Verlaufsdaten kommen aus der unter `historyInstance` gewählten Adapter-Instanz.

## Layouts

### Default
Titel/Icon und aktueller Wert oben, Liniendiagramm darunter — für mittlere Zellen.

### Card
Großer aktueller Wert mit Einheit oben, optionaler Durchschnitt, Flächendiagramm darunter — für prominente Kacheln.

## Einstellungen

Alle Optionen werden im Editor unter **Widget bearbeiten** gesetzt.

![](./assets/diagramm/config.png)

### Anzeige

| Option | Standard | |
| --- | --- | --- |
| `showTitle` | `true` | Titel anzeigen |
| `showIcon` | `true` | Icon anzeigen |
| `icon` | `TrendingUp` | [Lucide-Icon](https://lucide.dev) |
| `iconSize` | `20` | px |
| `titleAlign` | `left` | `left` · `center` · `right` |
| `unit` | — | Einheit hinter dem Wert |
| `decimals` | globale Einstellung | Nachkommastellen |

### Verlauf

| Option | Standard | |
| --- | --- | --- |
| `historyInstance` | — | History-Adapter-Instanz (z. B. `history.0`) |
| `historyRange` | `24h` | `1h` · `6h` · `24h` · `7d` · `30d` · `custom` |
| `historyRangeCustomValue` | `24` | nur bei `custom` |
| `historyRangeCustomUnit` | `h` | `h` · `d`, nur bei `custom` |
| `lockRange` | `false` | Zeitraum-Umschalter im Frontend ausblenden |

### Achsen

| Option | Standard | |
| --- | --- | --- |
| `showYAxis` | `false` | Y-Achse anzeigen |
| `yAxisCompact` | `true` | kompakte Y-Achsen-Beschriftung |
| `showXAxis` | `true` | X-Achse (Zeit) anzeigen |

### Linie & Durchschnitt

| Option | Standard | |
| --- | --- | --- |
| `lineColor` | `--accent` | Linienfarbe |
| `unitColor` | `--text-primary` | Farbe der Einheit |
| `showAverage` | `false` | Durchschnitts-Referenzlinie im Diagramm |
| `showAverageAsValue` | `false` | Durchschnitt als Textwert (Ø) anzeigen |
| `avgColor` | `lineColor` | Farbe von Linie und Wert des Durchschnitts |
