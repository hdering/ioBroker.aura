# Schalter

Schaltet einen `boolean`-Datenpunkt. Wahlweise als Schiebeschalter oder Icon-Taster, mit optionalem Impuls-Modus und Sicherheitsabfrage. Für dimmbare oder farbige Lampen ist das [Lampen-Widget](./) besser.

![](./assets/schalter/uebersicht.png)

## Datenpunkt

| Feld | Pflicht | Typ | |
| --- | --- | --- | --- |
| `datapoint` | ja | `boolean` | wird getoggelt, im Taster-Modus gepulst |

## Layouts

### Default
Titel, Status-Text und Schalter untereinander — für mittlere Zellen.

![](./assets/schalter/layout-default.png)

### Card
Vollflächige farbige Karte, im AN-Zustand grün — für prominente Schalter.

![](./assets/schalter/layout-card.png)

### Compact
Eine Zeile mit Icon, Titel und Schalter — für Listen mit vielen Schaltern.

![](./assets/schalter/layout-compact.png)

### Custom
Icon, Titel, Status und Schalter frei in einer Zellenmatrix platzieren — siehe [Custom-Layout](./custom-layout).

![](./assets/schalter/layout-custom.png)

## Einstellungen

Alle Optionen werden im Editor unter **Widget bearbeiten** gesetzt.

![](./assets/schalter/config-dialog.png)

### Anzeige

| Option | Standard | |
| --- | --- | --- |
| `showTitle` | `true` | Titel anzeigen |
| `showLabel` | `true` | AN/AUS-Text anzeigen |
| `showIcon` | `true` | Icon anzeigen |
| `icon` | `Power` | [Lucide-Icon](https://lucide.dev) |
| `iconSize` | `20` | px |
| `titleAlign` | `left` | `left` · `center` · `right` |

### Steuerelement

Klassischer Schiebeschalter oder Icon-Taster — bei `controlMode: icon` werden `onIcon`/`offIcon` und `onColor`/`offColor` ausgewertet.

| Option | Standard | |
| --- | --- | --- |
| `controlMode` | `toggle` | `toggle` · `icon` |
| `onIcon` / `offIcon` | Widget-Icon | nur bei `icon` |
| `onColor` | `--accent-green` | CSS-Farbe oder Variable |
| `offColor` | `--text-secondary` | CSS-Farbe oder Variable |
| `controlIconSize` | `28` | px, nur bei `icon` |

![](./assets/schalter/icon-modus.png)

### Taster

Statt zu toggeln schreibt der Schalter kurz `true` und nach `momentaryDelay` wieder `false`. Praktisch für Skript-Trigger oder Impuls-Relais.

| Option | Standard | |
| --- | --- | --- |
| `momentary` | `false` | Impuls statt Toggle |
| `momentaryDelay` | `500` | ms bis Reset |

### Sicherheitsabfrage

Kleines Bestätigungs-Popup direkt am Schalter (anchor-positioniert, ohne Backdrop).

| Option | Standard | |
| --- | --- | --- |
| `confirmAction` | `false` | Bestätigung vor Schalten |
| `confirmText` | — | Anzeigetext im Popup |

![](./assets/schalter/sicherheitsabfrage.png)
