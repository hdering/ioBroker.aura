# Schnellzugriff-Chips

Kompakte Schaltflächen-Leiste für Szenen und häufige Aktionen. Jeder Chip schreibt beim Klick einen festen Wert auf seinen Datenpunkt. Über einen Prüf-Datenpunkt lassen sich aktive Chips hervorheben; optional mit Sicherheitsabfrage.

## Datenpunkt

Das Widget hat keinen eigenen Haupt-Datenpunkt — jeder Chip trägt seinen Ziel-DP selbst.

| Feld | Pflicht | Typ | |
| --- | --- | --- | --- |
| `chips[].dp` | ja | — | Datenpunkt, der beim Klick beschrieben wird |
| `chips[].value` | nein | — | Schreibwert (Standard `true`) |
| `chips[].activeValue` | nein | — | Vergleichswert für Aktiv-Markierung (Fallback: `value`) |
| `checkDp` | nein | — | DP, dessen Wert über die Aktiv-Markierung entscheidet |

## Layouts

Die Anordnung steuert die Option `layout` (nicht das Standard-Widget-Layout).

### Row
Chips in einer Zeile, horizontal scrollbar — Standard, für viele Chips.

### Wrap
Chips fließen in mehrere Zeilen um — für variable Breiten.

### Column
Chips untereinander gestapelt.

### Grid
Chips in einem Raster mit fester Spaltenzahl (`wrapCols`).

## Einstellungen

Alle Optionen werden im Editor unter **Widget bearbeiten** gesetzt.

![](./assets/chips/config.png)

### Anzeige

| Option | Standard | |
| --- | --- | --- |
| `showTitle` | `true` | Titel anzeigen |
| `showIcon` | `true` | Icon anzeigen |
| `icon` | `Tag` | [Lucide-Icon](https://lucide.dev) |
| `iconSize` | `20` | px |
| `titleAlign` | `left` | `left` · `center` · `right` |

### Anordnung

| Option | Standard | |
| --- | --- | --- |
| `layout` | `row` | `row` · `wrap` · `column` · `grid` |
| `align` | `start` | horizontale Ausrichtung: `start` · `center` · `end` |
| `valign` | `middle` | vertikale Ausrichtung: `top` · `middle` · `bottom` |
| `gap` | `6` | Abstand zwischen Chips in px |
| `wrapCols` | — | Spaltenzahl, nur bei `layout: grid` |

### Chip-Stil

| Option | Standard | |
| --- | --- | --- |
| `chipStyle` | `outlined` | `outlined` · `filled` · `ghost` |
| `chipSize` | `34` | Zahl in px oder `sm` (28) · `lg` (42) |

### Chips

| Option | Standard | |
| --- | --- | --- |
| `chips` | `[]` | Liste aus `{ id, label, icon?, dp, value?, activeValue? }` |
| `chips[].icon` | `Zap` | [Lucide-Icon](https://lucide.dev) je Chip |
| `checkDp` | — | DP für die Aktiv-Markierung (`==`-Vergleich) |

### Sicherheitsabfrage

Bestätigungs-Overlay vor dem Schreiben.

| Option | Standard | |
| --- | --- | --- |
| `showConfirm` | `false` | Bestätigung vor Ausführen |
| `confirmText` | — | Anzeigetext im Overlay |
