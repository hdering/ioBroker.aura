# Custom-Layout

Jedes Widget mit Layout-Auswahl kennt den Layout-Typ **Custom**: ein freies Zellenraster, in dem Titel, Wert, Icon, Bild, Bedien-Element oder Freitext beliebig platziert werden.

## Raster

Größe per Spinner. Zellen werden zeilenweise gelesen (oben links → unten rechts).

| Option | Wert | |
| --- | --- | --- |
| Spalten | 1–20 | |
| Zeilen | 1–20 | |
| `colSizes` / `rowSizes` | `auto` · `1fr` · `60px` … | Track-Größe pro Spalte/Zeile |
| `colSpan` / `rowSpan` | 1–n | Zelle über mehrere Spalten/Zeilen ziehen |

## Zellinhalt

Klick auf eine Zelle öffnet den Zell-Editor (Schriftgröße, Farbe, Ausrichtung, Span — je nach Zelltyp).

| Typ | |
| --- | --- |
| `empty` | leer |
| `title` · `value` · `unit` · `rawValue` | Widget-eigene Felder |
| `dp` | beliebiger Datenpunktwert |
| `text` | Freitext |
| `icon` · `stateIcon` | Lucide-Icon, optional vom Datenpunkt-State abhängig |
| `image` | Bild aus Datei oder URL |
| `switch` · `slider` · `button` · `stepper` | Bedien-Element für einen Datenpunkt |
| `component` | Widget-Komponente (z. B. Temperatur-Balken bei Wetter) |

## Zellen verschieben & kopieren

### Mit der Maus

| Geste | Aktion |
| --- | --- |
| Drag & Drop | Zelle verschieben |
| Strg + Drag & Drop | Zelle kopieren |
| Rechtsklick | Kontextmenü (Kopieren · Ausschneiden · Einfügen · Leeren) |

### Mit der Tastatur

Wirkt auf die aktuell ausgewählte Zelle.

| Shortcut | Aktion |
| --- | --- |
| Strg + C | Kopieren |
| Strg + X | Ausschneiden |
| Strg + V | Einfügen |

### Überschreiben

Enthält das Ziel bereits eine nicht-leere Zelle, erscheint ein Bestätigungs-Dialog.

### Zwischenablage

Kopierter Zellinhalt bleibt während der Sitzung erhalten und kann auch in andere Widgets eingefügt werden.

## Zurücksetzen

Der Button **Raster zurücksetzen** am Ende des Editors stellt das Widget-spezifische Default-Raster wieder her.
