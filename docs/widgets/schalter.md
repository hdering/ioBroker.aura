# Schalter

Schaltet einen `boolean`-Datenpunkt.

## Layouts

| Default | Card | Compact | Custom |
| --- | --- | --- | --- |
| ![](./assets/schalter/layout-default.png) | ![](./assets/schalter/layout-card.png) | ![](./assets/schalter/layout-compact.png) | ![](./assets/schalter/layout-custom.png) |

## Einstellungen

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

| Option | Standard | |
| --- | --- | --- |
| `controlMode` | `toggle` | `toggle` · `icon` |
| `onIcon` / `offIcon` | Widget-Icon | nur bei `icon` |
| `onColor` | `--accent-green` | CSS-Farbe / Variable |
| `offColor` | `--text-secondary` | CSS-Farbe / Variable |
| `controlIconSize` | `28` | px, nur bei `icon` |

![](./assets/schalter/icon-modus.png)

### Taster

| Option | Standard | |
| --- | --- | --- |
| `momentary` | `false` | Impuls statt Toggle |
| `momentaryDelay` | `500` | ms bis Reset |

### Sicherheitsabfrage

| Option | Standard | |
| --- | --- | --- |
| `confirmAction` | `false` | Bestätigung vor Schalten |
| `confirmText` | — | Anzeigetext |

![](./assets/schalter/sicherheitsabfrage.png)
