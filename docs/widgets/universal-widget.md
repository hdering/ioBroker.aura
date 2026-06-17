# Universal-Widget

Freies Raster – Zellen einzeln mit Schaltern, Reglern, Werten und Bildern belegen. Das Widget hat keinen eigenen Datenpunkt; jede Zelle bindet ihren Datenpunkt über den Custom-Grid-Editor. Über dem Raster steht optional eine Kopfzeile mit Icon und Titel.

## Datenpunkt

Kein Haupt-Datenpunkt — die Bindung erfolgt pro Zelle im Raster.

## Layouts

Nur `custom`: ein frei aufgebautes Zellenraster — siehe [Custom-Layout](./custom-layout).

## Einstellungen

Alle Optionen werden im Editor unter **Widget bearbeiten** gesetzt.

![](./assets/universal-widget/config.png)

### Kopfzeile

| Option | Standard | |
| --- | --- | --- |
| `showTitle` | `true` | Titel anzeigen (nur wenn Titel gesetzt) |
| `showIcon` | `true` | Icon anzeigen |
| `icon` | `LayoutGrid` | [Lucide-Icon](https://lucide.dev) |
| `iconSize` | `20` | px |
| `titleAlign` | `left` | `left` · `center` · `right` |

### Raster

Aufbau und Belegung der Zellen erfolgen im [Custom-Layout](./custom-layout)-Editor.
