# Raumklima

Zeigt Temperatur, Luftfeuchtigkeit und einen optionalen Temperaturverlauf kombiniert an. Die Ist-Temperatur kommt aus dem Haupt-Datenpunkt, Soll-Temperatur und Feuchte aus separaten DPs; der Verlauf wird aus einer History-Instanz geladen.

![](./assets/raumklima/runtime.png)

## Datenpunkt

| Feld | Pflicht | Typ | |
| --- | --- | --- | --- |
| `datapoint` | ja | `number` | Ist-Temperatur; liefert auch die Verlaufsdaten |
| `targetDatapoint` | nein | `number` | Soll-Temperatur (als Badge ↑) |
| `humidityDatapoint` | nein | `number` | Luftfeuchtigkeit |

## Layouts

Das Widget hat ein einziges Layout: Titel/Icon oben, darunter Ist-Temperatur groß mit Soll-Wert und Feuchte rechts, optionalem Komfort-Badge, Zeitraum-Auswahl und Verlaufsdiagramm.

## Einstellungen

Alle Optionen werden im Editor unter **Widget bearbeiten** gesetzt.

![](./assets/raumklima/config.png)

### Anzeige

| Option | Standard | |
| --- | --- | --- |
| `showTitle` | `true` | Titel anzeigen |
| `showIcon` | `true` | Temperatur-Icon anzeigen |
| `showActualTemp` | `true` | Ist-Temperatur anzeigen |
| `showTargetTemp` | `true` | Soll-Temperatur anzeigen (nur mit `targetDatapoint`) |
| `showHumidity` | `true` | Luftfeuchtigkeit anzeigen |
| `showComfort` | `false` | Komfort-Badge (Temp 18–24 °C, Feuchte 40–60 %) |
| `icon` | `Thermometer` | [Lucide-Icon](https://lucide.dev) |
| `humidityIcon` | `Droplets` | Icon für die Feuchte |
| `iconSize` | `20` | px |
| `titleAlign` | `left` | `left` · `center` · `right` |

### Werte

| Option | Standard | |
| --- | --- | --- |
| `decimals` | global | Nachkommastellen |
| `unit` | `°C` | Einheit der Temperatur |
| `humidityUnit` | `%` | Einheit der Feuchte |

### Verlauf

Das Diagramm erscheint nur, wenn `showChart` aktiv ist und eine `historyInstance` gesetzt wurde.

| Option | Standard | |
| --- | --- | --- |
| `showChart` | `true` | Verlaufsdiagramm anzeigen |
| `historyInstance` | — | History-Instanz, z. B. `history.0` |
| `historyRange` | `24h` | `1h` · `6h` · `24h` · `7d` · `30d` · `custom` |
| `historyRangeCustomValue` | `24` | Wert bei `custom` |
| `historyRangeCustomUnit` | `h` | `h` · `d` (bei `custom`) |
| `lockRange` | `false` | Zeitraum-Auswahl ausblenden |
| `lineColor` | `--accent` | Linien-/Flächenfarbe |

### Y-Achse & Durchschnitt

| Option | Standard | |
| --- | --- | --- |
| `showYAxis` | `false` | Y-Achse einblenden |
| `yAxisCompact` | `true` | kompakte Tick-Formatierung |
| `showAverage` | `false` | Durchschnittslinie im Diagramm |
| `showAverageAsValue` | `false` | Durchschnitt als Ø-Wert unter der Temperatur |
| `avgColor` | wie `lineColor` | Farbe von Linie/Wert |
