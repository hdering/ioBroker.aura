# Gauge

Visualisiert einen `number`-Datenpunkt als Tachonadel auf einem 180°-Kreisbogen. Mit Farbzonen, bis zu drei Zeigern und optionaler Wert-Transformation.

![](./assets/gauge/runtime.png)

## Datenpunkt

| Feld | Pflicht | Typ | |
| --- | --- | --- | --- |
| `datapoint` | ja | `number` | Hauptwert, Zeiger 1 |
| `minDatapoint` / `maxDatapoint` | nein | `number` | liefern Skala-Min/-Max statt der festen Werte |
| `pointer2Datapoint` / `pointer3Datapoint` | nein | `number` | zusätzliche Zeiger 2 / 3 |

## Layouts

Nur ein Layout — Titel/Icon oben, darunter der Bogen mit Nadel und Wert; zusätzliche Zeiger erscheinen als farbige Badges darunter.

## Einstellungen

Alle Optionen werden im Editor unter **Widget bearbeiten** gesetzt.

![](./assets/gauge/config.png)

### Anzeige

| Option | Standard | |
| --- | --- | --- |
| `showTitle` | `true` | Titel anzeigen |
| `showIcon` | `true` | Icon anzeigen |
| `icon` | `Gauge` | [Lucide-Icon](https://lucide.dev) |
| `iconSize` | `20` | px |
| `titleAlign` | `left` | `left` · `center` · `right` |
| `showMinMax` | `true` | Min/Max-Labels an den Bogenenden |

### Skala

| Option | Standard | |
| --- | --- | --- |
| `minValue` | `0` | Skala-Minimum |
| `maxValue` | `100` | Skala-Maximum |
| `dynamicMax` | `false` | Maximum wächst mit, wenn der Wert es übersteigt |
| `unit` | — | Einheit hinter dem Wert |
| `decimals` | globale Vorgabe | Nachkommastellen |
| `strokeWidth` | `12` | Dicke des Bogens (px) |

### Wert-Transformation

Bildet nur den Live-Wert in den Anzeigeraum ab; `minValue`/`maxValue` und Zonen bleiben in Anzeige-Einheiten.

| Option | Standard | |
| --- | --- | --- |
| `valueFactor` | `1` | Multiplikator |
| `valueOffset` | `0` | Summand |

### Farbzonen

Färbt Bogen und Nadel abhängig vom Wert; ohne Zonen zeigt der Bogen eine gefüllte Fortschrittsspur.

| Option | Standard | |
| --- | --- | --- |
| `colorZones` | `false` | Zonen-Einfärbung aktivieren |
| `zones` | — | Liste aus `{ max, color }` |
| `zone1Max` / `zone1Color` | `33 %` der Spanne · `#10b981` | Fallback Zone 1 |
| `zone2Max` / `zone2Color` | `66 %` der Spanne · `#f59e0b` | Fallback Zone 2 |
| `zone3Color` | `#ef4444` | Fallback Zone 3 (bis Maximum) |

### Zeiger

| Option | Standard | |
| --- | --- | --- |
| `pointer1Color` | `--accent` | Farbe Zeiger 1 |
| `pointer1Label` | Widget-Titel | Beschriftung Zeiger 1 |
| `pointer2Color` | `#f97316` | Farbe Zeiger 2 |
| `pointer2Label` | — | Badge-Text Zeiger 2 |
| `pointer3Color` | `#8b5cf6` | Farbe Zeiger 3 |
| `pointer3Label` | — | Badge-Text Zeiger 3 |
