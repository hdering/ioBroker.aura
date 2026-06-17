# Datumswähler

Wählt Datum und/oder Uhrzeit über native Eingabefelder aus und schreibt den Wert im gewünschten Format in einen Datenpunkt. Externe Änderungen am DP werden automatisch übernommen.

![](./assets/datumswaehler/runtime.png)

## Datenpunkt

| Feld | Pflicht | Typ | |
| --- | --- | --- | --- |
| `datapoint` | ja | `number` / `string` | Format laut `outputFormat`; gelesen werden Timestamp, ISO, DE- und Lokalformate |

Optionale Status-Datenpunkte (Batterie, Erreichbarkeit) werden als Badges eingeblendet (Abschnitt **Status-Datenpunkte** im Dialog).

## Layouts

### Default
Titel/Icon oben, darunter die Eingabefelder und der gesetzte Wert — für mittlere Zellen.

### Card
Icon, Titel, Eingabefelder und gesetzter Wert zentriert untereinander — für prominente Platzierung.

### Compact
Eine Zeile mit Icon, Titel und Eingabefeldern — für Listen.

### Minimal
Nur die Eingabefelder mit dem aktuellen Wert darunter, zentriert — für kleine Zellen.

## Einstellungen

Alle Optionen werden im Editor unter **Widget bearbeiten** gesetzt.

![](./assets/datumswaehler/config.png)

### Modus

| Option | Standard | |
| --- | --- | --- |
| `timeOnly` | `false` | nur Uhrzeit, ohne Datum |
| `showTime` | `false` | zusätzliches Uhrzeit-Feld zum Datum |
| `outputFormat` | `timestamp_ms` | `timestamp_ms` · `timestamp_s` · `iso` · `date` · `datetime_local` · `de_date` · `de_datetime` · `time_hhmm` · `time_hhmmss` |

### Anzeige

| Option | Standard | |
| --- | --- | --- |
| `showTitle` | `true` | Titel anzeigen |
| `showIcon` | `true` | Icon anzeigen |
| `showCurrentValue` | `true` | gesetzten Wert anzeigen |
| `icon` | modusabhängig | [Lucide-Icon](https://lucide.dev) (`CalendarDays` / `CalendarClock` / `Clock`) |
| `iconSize` | `20` | px |
| `titleAlign` | `left` | `left` · `center` · `right` |
