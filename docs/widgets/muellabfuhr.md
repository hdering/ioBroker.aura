# Müllabfuhr

Zeigt eine frei konfigurierbare Liste von Tonnen als farbige Icon-Kreise. Jede Tonne liest einen eigenen `boolean`-Datenpunkt (z. B. vom Trash-Adapter) und wird je nach Zustand ein- oder ausgeblendet. Für den kompletten Kalender aus einem JSON-Datenpunkt gibt es das [Müllabfuhr-Zeitplan-Widget](./muellabfuhr-zeitplan).

## Datenpunkt

Das Widget hat keinen Haupt-Datenpunkt. Jede Tonne wird einzeln konfiguriert (Abschnitt **Tonnen** im Dialog):

| Feld | Typ | |
| --- | --- | --- |
| `datapoint` | `boolean` | `true` / `false` / `1` gilt als aktiv (Abholungstag) |
| `name` | — | Bezeichnung unter dem Icon |
| `icon` | — | eines der Müll-Icons (`Trash2`, `Newspaper`, `Leaf`, `Recycle`, …) |
| `color` | — | CSS-Farbe des Kreises |
| `hideWhen` | `false` | `false` (anzeigen wenn aktiv) · `true` (anzeigen wenn inaktiv) · `never` (immer, gedimmt wenn inaktiv) |

## Einstellungen

Alle Optionen werden im Editor unter **Widget bearbeiten** gesetzt.

![](./assets/muellabfuhr/config.png)

### Anzeige

| Option | Standard | |
| --- | --- | --- |
| `showTitle` | `true` | Titel anzeigen |
| `showIcon` | `true` | Icon anzeigen |
| `icon` | `Truck` | [Lucide-Icon](https://lucide.dev) der Titelzeile |
| `iconSize` | `20` | px |
| `titleAlign` | `left` | `left` · `center` · `right` |

### Tonnen

Liste der angezeigten Tonnen — pro Eintrag Bezeichnung, Icon, Farbe, Datenpunkt und Ausblende-Regel. Die Kreisgröße wird automatisch aus der Anzahl der Tonnen abgeleitet (`72` / `58` / `44` px).

| Option | Standard | |
| --- | --- | --- |
| `bins` | `[]` | Liste der Tonnen (s. o.) |
