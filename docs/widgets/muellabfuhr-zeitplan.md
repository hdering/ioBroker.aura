# Müllabfuhr-Zeitplan

Liest einen JSON-Array-Datenpunkt vom Trash-Adapter und zeigt die Tonnen sortiert nach Resttagen — mit Name, Tagesangabe (`heute`, `morgen`, `in N T.`, `fällig`) und nächstem Termin. Pro Eintrag lässt sich Icon und Sichtbarkeit festlegen. Für einzelne `boolean`-Datenpunkte gibt es das [Müllabfuhr-Widget](./muellabfuhr).

## Datenpunkt

| Feld | Pflicht | Typ | |
| --- | --- | --- | --- |
| `datapoint` | ja | `string`/`array` | JSON-Array mit `{ name, daysLeft, nextDate }` je Tonne; `_color` und `_completed` werden ausgewertet |

## Layouts

### Default
Tonnen als farbige Icon-Kreise nebeneinander, darunter Name/Tage/Datum — für mittlere Zellen.

### List
Eine Zeile je Tonne (Kreis links, Texte rechts), scrollbar — für viele Tonnen.

## Einstellungen

Alle Optionen werden im Editor unter **Widget bearbeiten** gesetzt.

![](./assets/muellabfuhr-zeitplan/config.png)

### Anzeige

| Option | Standard | |
| --- | --- | --- |
| `showTitle` | `true` | Titel anzeigen |
| `showIcon` | `true` | Icon anzeigen |
| `icon` | `CalendarCheck2` | [Lucide-Icon](https://lucide.dev) der Titelzeile |
| `iconSize` | `20` | px |
| `titleAlign` | `left` | `left` · `center` · `right` |

### Inhalt

Pro Tonne (aus dem aktuellen DP-Wert) lassen sich Icon und Sichtbarkeit setzen.

| Option | Standard | |
| --- | --- | --- |
| `showNames` | `true` | Tonnen-Namen anzeigen |
| `showDays` | `true` | Resttage anzeigen |
| `showDate` | `true` | nächsten Termin anzeigen |
| `dateFormat` | `dd.MM.` | `dd.MM.` · `dd.MM.yyyy` · `EE dd.MM.` |
| `hiddenNames` | `[]` | ausgeblendete Tonnen-Namen |
| `iconMap` | `{}` | Zuordnung Tonnen-Name → Icon |

### Größen

| Option | Standard | |
| --- | --- | --- |
| `binSize` | `0` | feste Kreisgröße im Default-Layout in px; `0` = automatisch (`72`/`58`/`44`) |
| `listBinSize` | `36` | Kreisgröße im List-Layout in px |
| `nameFontSize` | `10` | px |
| `daysFontSize` | `10` | px |
| `dateFontSize` | `9` | px |
