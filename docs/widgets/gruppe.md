# Gruppe

Fasst mehrere Widgets in einem gemeinsamen Rahmen zusammen. Die Kind-Widgets werden im Editor per Drag-and-Drop in die Gruppe gezogen und dort in einem eigenen Raster frei angeordnet (auf dem Smartphone werden sie automatisch untereinander gestapelt). Optional steuert eine Master-Aktion im Titel alle passenden Kind-Datenpunkte gemeinsam.

## Layouts

Über die Layout-Auswahl der Gruppe wählbar.

### Default
Kind-Widgets in einem inneren Raster; die Gruppenhöhe passt sich automatisch an den Inhalt an.

### Custom
Kind-Widgets frei in einer Zellenmatrix platzieren — siehe [Custom-Layout](./custom-layout).

## Einstellungen

Alle Optionen werden im Editor unter **Widget bearbeiten** gesetzt.

![](./assets/gruppe/config.png)

### Anzeige

| Option | Standard | |
| --- | --- | --- |
| `showTitle` | `true` | Titel anzeigen |
| `showIcon` | `true` | Icon anzeigen |
| `icon` | `Layers` | [Lucide-Icon](https://lucide.dev) |
| `iconSize` | `20` | px |
| `titleAlign` | `left` | `left` · `center` · `right` |
| `transparent` | `false` | Rahmen/Trennlinie ausblenden |

### Master-Aktion

Ein Steuerelement im Titel schaltet alle steuerbaren Kind-Datenpunkte gemeinsam. Über die betroffenen Datenpunkte lässt sich per Checkliste verfeinern, welche Kinder einbezogen werden.

| Option | Standard | |
| --- | --- | --- |
| `groupSwitch` | `false` | Master-Aktion aktivieren |
| `groupActionType` | `switch` | `switch` · `dimmer` · `shutter` · `momentary` |
| `groupExcludeIds` | — | ausgeschlossene Kind-IDs |
| `groupDimmerOnValue` | `100` | „AN"-Wert für Dimmer (nur `switch`) |
| `groupIncludeNumbers` | `false` | Zahlenwerte einbeziehen (nur `switch`) |
| `groupNumberOnValue` / `groupNumberOffValue` | `1` / `0` | Zahl-„AN"/„AUS"-Wert (nur `switch` + Zahlen) |
| `groupPulseLabel` | `Auslösen` | Beschriftung (nur `momentary`) |
| `groupPulseValue` | `true` | Impuls-Wert (nur `momentary`) |
| `groupPulseReset` | `false` | nach Verzögerung zurücksetzen (nur `momentary`) |
| `groupPulseResetValue` / `groupPulseDelay` | `false` / `500` | Reset-Wert / Verzögerung in ms |
