# Verlaufstabelle

Zeigt die aufgezeichneten Werte eines Datenpunkts aus einem History-Adapter (`history`, `sql`, `influxdb`) als Tabelle: die letzten N Werte oder alle Werte eines Zeitraums. Der Datenpunkt muss im Adapter geloggt werden.

| Schaltvorgänge (getrennte Spalten) | Messwerte (Datum + Uhrzeit) |
| --- | --- |
| ![](./assets/verlaufstabelle/runtime.png) | ![](./assets/verlaufstabelle/runtime-werte.png) |

## Datenpunkt

| Feld | Pflicht | Typ | |
| --- | --- | --- | --- |
| `datapoint` | ja | beliebig | Zahlen, true/false und Texte |

## Einstellungen

![](./assets/verlaufstabelle/config.png)

### Verlaufsdaten

| Option | Standard | |
| --- | --- | --- |
| `historyInstance` | erste aktive | `history.0`, `sql.0`, `influxdb.0` … |
| `historyMode` | `count` | `count` = letzte Werte, `range` = Zeitraum |
| `historyCount` | `20` | Anzahl Zeilen bei `count` (1–500) |
| `historyRange` | `24h` | `1h` `6h` `24h` `7d` `30d` `custom` |
| `historyRangeCustomValue` / `…Unit` | `24` / `h` | eigener Zeitraum, Einheit `h` `d` `w` `M` `y` |
| `hideDuplicates` | `false` | gleiche Werte hintereinander → eine Zeile (Zeitpunkt des Wechsels) |

Zeitraum: Rohwerte, höchstens 2000 Zeilen — bei mehr die neuesten.

### Spalten

| Option | Standard | |
| --- | --- | --- |
| `timeColumns` | `combined` | `combined` = Datum + Uhrzeit, `split` = getrennt |
| `dateFormat` | `dd.MM.yyyy` | Platzhalter `dd MM yyyy yy EE EEEE MMMM ww` |
| `timeFormat` | `HH:mm:ss` | Platzhalter `HH hh mm ss` |
| `colDateLabel` / `colTimeLabel` / `colValueLabel` | Datum / Zeitpunkt bzw. Uhrzeit / Wert | Spaltentitel |
| `sortOrder` | `desc` | `desc` = neueste oben, `asc` = älteste oben |

### Werte

| Option | Standard | |
| --- | --- | --- |
| `unit` | – | Einheit hinter Zahlen |
| `decimals` | ganze Zahlen ohne, sonst global | Nachkommastellen |
| `numberFormat` | global | Tausender-/Dezimaltrennzeichen |
| `valueLabels` | `common.states` | Werttexte, z. B. `0=geschlossen; 1=offen` (true/false = 1/0) |
| `valueFactor` / `valueOffset` | – | Umrechnung (ƒ-Taste am Datenpunkt) |

### Darstellung

| Option | Standard | |
| --- | --- | --- |
| `fontSize` | `12` | Schriftgröße in px |
| `showHeader` | `true` | Spaltentitel |
| `striped` | `true` | Zeilen abwechselnd einfärben |
| `autoHeight` | `false` | Höhe folgt der Zeilenzahl — siehe [Höhe an Inhalt anpassen](../einstellungen/editor#hohe-an-inhalt-anpassen) |

## Aktualisierung

| Ereignis | |
| --- | --- |
| neuer Wert | erscheint sofort oben |
| alle 5 min (Zeitraum ≤ 1 h: 1 min) | Tabelle neu aus dem Adapter |
| Gerät wacht auf | Tabelle neu aus dem Adapter |
