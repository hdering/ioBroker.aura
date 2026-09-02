# Custom-Layout

Jedes Widget mit Layout-Auswahl kennt den Layout-Typ **Custom**: ein freies Zellenraster, in dem Titel, Wert, Icon, Bild, Bedien-Element oder Freitext beliebig platziert werden.

Mögliche Bildquellen (URL, Adapter-Pfad, Datei, Base64): siehe [Bildpfade](./bildpfade).

## Raster

Größe per Spinner. Zellen werden zeilenweise gelesen (oben links → unten rechts).

| Option | Wert | |
| --- | --- | --- |
| Spalten | 1–20 | |
| Zeilen | 1–20 | |
| Spaltenbreiten | Verhältnis (`2` / `1` …) oder **auto** | `auto` = so breit wie der Inhalt |
| `colSizes` / `rowSizes` | `auto` · `1fr` · `60px` … | Track-Größe pro Spalte/Zeile |
| `colSpan` / `rowSpan` | 1–n | Zelle über mehrere Spalten/Zeilen ziehen |

Verhältnis-Spalten wachsen mit der Widget-Breite: dasselbe Raster rückt in der mobilen Ansicht (Widget über
die volle Breite) auseinander. `auto`-Spalten bleiben bei jeder Breite gleich — z. B. Spalte 1 (Icon) und
Spalte 2 (Titel) auf `auto`, Spalte 3 (Wert) auf `1fr`: Icon + Titel links, Wert rechts, wie im Compact-Layout.

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
| `progress` | Balken für einen Zahlenwert zwischen `min` und `max` (nur Anzeige) |
| `component` | Widget-Komponente (z. B. Temperatur-Balken bei Wetter) |

Die Balkenfarbe von `progress` und `slider` (mit `barStyle`) ist `color`, sonst die Akzentfarbe. Eine zutreffende
Zell-Bedingung mit `color` färbt den Balken mit — `bg` färbt dagegen die ganze Zelle, nie den Balken.

### Umrechnung & Zeit-Formatierung (`dp`)

Der Button neben dem Datenpunkt-Feld öffnet beide Anzeige-Optionen — der Datenpunkt bleibt unverändert.

| Feld | |
| --- | --- |
| `valueFactor` / `valueOffset` | Anzeige = Wert × Faktor + Offset (auch bei `progress`) |
| `valueTimeFormat` | Zeitwert als Uhrzeit und/oder Datum: `time` · `time-sec` · `date` · `date-long` · `datetime` · `datetime-sec` · `custom` |
| `valueTimePattern` | Token-Muster bei `custom`, z. B. `EEEE, dd.MM. HH:mm` |

Zeitstempel (Sekunden/Millisekunden), ISO-Zeitangaben und `HH:mm` werden automatisch erkannt; nicht lesbare
Werte zeigen `–`. Tokens siehe [Wert-Anzeige](./wert-anzeige.md#zeit-formatierung).

### Bedienelement (`switch`)

| Feld | | |
| --- | --- | --- |
| `controlMode` | `toggle` · `icon` · `button` | Schiebeschalter · Icon · Button |
| `trueValue` / `falseValue` | z. B. `0`/`100`, `an`/`aus` | Schreibwerte; leer = `true`/`false` |
| `statusDpId` | optional | Status-Datenpunkt: Zustand, Beschriftung und Farben kommen von hier, geschrieben wird auf den Datenpunkt oben |
| `stateMode` | `boolean` · `condition` | Auswertung des Zustands: `true`/`1`/`on` · Vergleich mit `stateOperator` / `stateValue` |
| `trueIcon` / `falseIcon`, `trueColor` / `falseColor` | nur `icon` | Icon und Farbe je Zustand |
| `trueText` / `falseText` | nur `button` | Beschriftung je Zustand; leer = `AN`/`AUS` |
| `buttonTrueColor` / `buttonFalseColor` | nur `button` | Hintergrundfarbe je Zustand |
| `buttonTrueTextColor` / `buttonFalseTextColor` | nur `button` | Textfarbe je Zustand |
| `text`, `color`, `buttonTextColor` | nur `button` | zustandslose Altfelder; gelten, solange die AN/AUS-Felder leer sind |
| `buttonWidth` | `auto` · `full` · `uniform` | Textbreite · Zellenbreite · längstes Label aller `uniform`-Buttons |
| `momentary`, `momentaryDelay` | | Taster-Modus: Impuls statt Umschalten |

#### Getrennte Schalt- und Status-Datenpunkte

Beispiel Tasmota-Steckdose — `cmnd.POWER` nimmt nur Befehle an und fällt danach auf `null`, der Zustand steht
in `stat.POWER`:

| Feld | Wert |
| --- | --- |
| Datenpunkt | `mqtt.1.plug1.cmnd.POWER` |
| `statusDpId` | `mqtt.1.plug1.stat.POWER` |
| `trueValue` / `falseValue` | `1` / `0` |
| `stateMode` | `boolean` (erkennt `ON`/`OFF`) oder `condition` mit `==` und `ON` |
| `trueText` / `falseText` | `An` / `Aus` |

Dasselbe `stateMode`-Feld gibt es bei `state-text` und `state-icon`, damit dort ebenfalls `ON`/`OFF` oder
Zahlenwerte den Text bzw. das Icon bestimmen.

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
