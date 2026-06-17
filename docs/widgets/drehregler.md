# Drehregler

Stellt einen `number`-Datenpunkt per Drehknopf ein — Wert wird durch Ziehen auf dem Bogen verändert. Drei Zeigertypen, konfigurierbarer Winkelbereich und ein Endlos-Modus.

![](./assets/drehregler/runtime.png)

## Datenpunkt

| Feld | Pflicht | Typ | |
| --- | --- | --- | --- |
| `datapoint` | ja | `number` | wird beim Loslassen geschrieben (auf Schritt gerundet) |

## Layouts

### Default
Dünne Fortschritts-Spur mit Skalenstrichen, Linien- oder Pfeil-Zeiger auf dem Knopf-Körper.

### Scale (`knob-scale`)
Dicker äußerer Bogen mit Zahlen-Labels und Zeiger an der Bogenspitze.

### Endless (`knob-endless`)
Voller 3D-Kreisknopf mit Tick-Ring; relatives Ziehen ohne festen Anschlag — der Wert läuft endlos weiter.

### Custom
Drehknopf in einer Zellenmatrix frei platzieren — der Stil wird über `dialStyle` (`bogen` · `skala` · `endless`) gewählt; siehe [Custom-Layout](./custom-layout).

## Einstellungen

Alle Optionen werden im Editor unter **Widget bearbeiten** gesetzt.

![](./assets/drehregler/config.png)

### Anzeige

| Option | Standard | |
| --- | --- | --- |
| `showTitle` | `true` | Titel anzeigen |
| `showIcon` | `true` | Icon anzeigen |
| `icon` | `Gauge` | [Lucide-Icon](https://lucide.dev) |
| `iconSize` | `18` | px |
| `titleAlign` | `left` | `left` · `center` · `right` |
| `showValue` | `true` | Wert in der Knopfmitte anzeigen |
| `showMinMax` | `false` | Min/Max-Labels (Default-Layout) |

### Wert

| Option | Standard | |
| --- | --- | --- |
| `minValue` | `0` | Skala-Minimum |
| `maxValue` | `100` | Skala-Maximum |
| `step` | `1` | Schrittweite beim Schreiben |
| `unit` | — | Einheit hinter dem Wert |
| `decimals` | globale Vorgabe | Nachkommastellen |
| `readOnly` | `false` | Anzeige ohne Bedienung |

### Zeiger & Bogen

| Option | Standard | |
| --- | --- | --- |
| `pointerStyle` | `line` | `line` · `circle` · `arrow` |
| `color` | `--slider-fill` (Endlos `#4a4a4a`) | Farbe von Bogen/Zeiger |
| `startAngle` | `135` | Startwinkel in Grad (Endlos fest `126`) |
| `endAngle` | `405` | Endwinkel in Grad (Endlos fest `486`) |
| `labelCount` | `11` (Endlos `10`) | Anzahl beschrifteter Ticks (Scale/Endlos) |

### Optik

| Option | Standard | |
| --- | --- | --- |
| `showRing` | `true` | äußerer Metall-Ring (nur Default/Scale) |
| `showBackground` | `true` | grauer Hintergrund-Disc (nur Default/Scale) |
| `dialStyle` | `bogen` | Knopf-Stil im Custom-Layout: `bogen` · `skala` · `endless` |
