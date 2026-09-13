# Layouts & Theme

Jedes Layout hat eigene Tabs und Widgets — ideal für verschiedene Tablets oder Räume. Darunter Theme- und Darstellungs-Einstellungen, wahlweise global oder pro Layout (Geltungsbereich links).

## Layouts

![](./assets/layouts-theme.png)

| Element                           |                                                   |
| --------------------------------- | ------------------------------------------------- |
| Layout-Zeile                      | Name, Slug, Tab-/Widget-Anzahl                    |
| Bearbeiten                        | Öffnet das Layout im [Dashboard-Editor](./editor) |
| Aktionen                          | Duplizieren, Exportieren, Löschen                 |
| Neues Layout / Layout importieren | Anlegen bzw. aus JSON einfügen                    |

## Theme & CSS-Vars

Preset wählen (Dark, Hell, Lovelace, AMOLED, Glass, Material 3, Catppuccin, Liquid Glass …) und einzelne CSS-Variablen feinjustieren (App, Widget-Karte, Text, Akzentfarben).

Welches Design das Frontend zeigt, entscheidet diese Reihenfolge:

| Vorrang | Quelle                             |                                                                                                                                                                                                  |
| ------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1       | `aura.0.config.themeMode.frontend` | Hell/Dunkel-Modus (auch der Button im Header). Ersetzt nur Designs der anderen Helligkeit — durch das unter „Theme folgt Browser" eingestellte Hell- bzw. Dunkel-Theme. Leerer Wert = kein Modus |
| 2       | Theme folgt Browser                | Überschreibt alle Presets, global wie pro Layout und Bereich                                                                                                                                     |
| 3       | Bereich → Layout → Global          | Geltungsbereich links; der engste gesetzte Wert gewinnt                                                                                                                                          |

### Hell und Dunkel getrennt einstellen

Sobald „Theme folgt Browser" aktiv ist (oder `themeMode.frontend` einen Modus setzt), zeigt dieselbe Installation zwei Designs. Preset-Raster und Variablen-Editor bekommen dann oben rechts einen Umschalter.

| Reiter    |                                                                          |
| --------- | ------------------------------------------------------------------------ |
| Gemeinsam | Gilt für beide Helligkeiten (die bisherigen Anpassungen liegen hier)      |
| Hell      | Gilt nur, solange ein helles Theme angezeigt wird                         |
| Dunkel    | Gilt nur, solange ein dunkles Theme angezeigt wird                        |

Im Preset-Raster bestimmt der Reiter, welche Hälfte des Paares das angeklickte Design wird. Im Variablen-Editor überschreiben die Werte auf „Hell"/„Dunkel" den gemeinsamen Wert; das Feld zeigt den geerbten Wert als Platzhalter. Ein Punkt am Reiter markiert Hälften, die etwas enthalten.

### Meine Themes

Eigene Themes sind ein eingebautes Preset plus die angepassten Variablen. Gespeicherte Themes stehen überall zur Auswahl: im Preset-Raster, als Hell- oder Dunkel-Hälfte von „Theme folgt Browser" und in jeder Layout- oder Bereichs-Überschreibung.

| Aktion                   |                                                                                     |
| ------------------------ | ----------------------------------------------------------------------------------- |
| Aktuellen Stand speichern | Legt aus dem gerade angezeigten Design + Variablen ein eigenes Theme an              |
| Hell/Dunkel              | Legt fest, für welche Hälfte des Browser-Syncs das Theme angeboten wird              |
| Verwenden                | Setzt das Theme global bzw. als passende Hälfte                                      |
| Duplizieren              | Kopie zum Weiterbauen                                                                |
| Exportieren / Importieren | JSON-Datei, auch zwischen zwei Installationen                                        |
| Löschen                  | Verwendungen fallen auf ein mitgeliefertes Design zurück                             |

## Typografie & Spacing

![](./assets/layouts-typo.png)

Schriftart, Schriftgrößen und Abstände.

## Grid & Mobile

![](./assets/layouts-grid.png)

| Option                     |                                                      |
| -------------------------- | ---------------------------------------------------- |
| Rastergröße (Zeile/Spalte) | Zellgröße in px                                      |
| Mobile-Breakpoint          | Breite, ab der die mobile Einspaltenansicht greift   |
| Wizard Max-Datenpunkte     | Obergrenze der im Assistenten gescannten Datenpunkte |

## Hilfslinien

![](./assets/layouts-guidelines.png)

Rote gestrichelte Linien im Editor zur Orientierung an einer Zielgröße (Breite/Höhe), optional auch im Frontend.

## Tab-Leiste

![](./assets/layouts-tabbar.png)

Darstellung der Tab-Leiste im Frontend.

Die Leiste erscheint erst ab zwei sichtbaren Tabs. Ausgeblendete und deaktivierte Tabs zählen nicht mit — ein Bereich mit zwei Tabs, von denen einer ausgeblendet ist, zeigt keine Leiste. Ausnahmen: **Leiste schon ab einem Tab anzeigen** oder ein Menü-Element in der Leiste.

## Menü-Elemente

Header, Tab-Leiste und Bereichs-Menü tragen dieselbe Elementliste. Der Header wird unter [Frontend](./frontend) gepflegt, die beiden anderen in ihrem eigenen Abschnitt.

| Typ         |                                                                    |
| ----------- | ------------------------------------------------------------------ |
| Uhrzeit     | Zeit, Datum oder beides; eigenes Format möglich                    |
| Datenpunkt  | DP-Wert, optional durch ein HTML-Template (`{dp}`) formatiert      |
| Text        | Fester Text                                                        |
| Widget      | Beliebiges Widget — als Verweis auf ein vorhandenes Dashboard-Widget oder als eigene Instanz im Element |
| Rückkehr-Pause | Setzt die automatische Rückkehr für eine einstellbare Zeit aus; zeigt die Restzeit, zweites Tippen beendet die Pause |

| Option beim Typ *Widget* |                                                                  |
| ------------------------ | ---------------------------------------------------------------- |
| Quelle                   | `Vorhandenes Widget` (Verweis, ändert sich mit dem Original) oder `Eigenes Widget` (Instanz im Element) |
| Widget-Typ               | Vorausgewählt sind die Typen, die in eine Leiste passen; `Alle Typen anzeigen` hebt das auf |
| Größe                    | Startet auf der Größe, die der Widget-Typ auf einem Dashboard hat; in der Vorschau an der Ecke unten rechts pixelgenau ziehen, `Standardgröße` setzt zurück |
| Mit Karte                | Hintergrund und Rahmen zeichnen; ohne das sitzt das Widget blank in der Leiste |
| Vorschau                 | Das Element in genau der Box, die es im Menü bekommt. Bei `Eigenes Widget` öffnet der Pfeil daran dessen eigene Einstellungen |

Bedingungen, Badges, Klick-Aktionen und Popups eines Widgets gelten im Menü genauso wie auf dem Dashboard. Gruppen und Panels lassen sich nur als Verweis einbinden, nicht als eigene Instanz.

Position: Header `Links`/`Rechts`, Tab-Leiste `L`/`M`/`R`, Bereichs-Menü `Oben`/`Unten`.

Ein neu hinzugefügtes Element ist offen; ein Klick auf die Zeile klappt sie zu und wieder auf. Die Darstellung (Layout) eines Widgets wird am Widget selbst eingestellt, nicht am Element.

## Navigation

Automatische Rückkehr zum Standard-Tab nach Inaktivität. Global, pro Layout oder pro Bereich einstellbar (Geltungsbereich links).

| Option | |
| --- | --- |
| Automatisch zum Standard-Tab zurückkehren | Schaltet die Rückkehr ein |
| Verzögerung | Inaktivität in Sekunden (5–3600) |

Ziel ist der Standard-Bereich des Layouts und dessen Standard-Tab. Als Aktivität zählen
Mausbewegung, Tastendruck, Klick, Tippen, Scrollen und Mausrad. Nicht zurückgekehrt wird,
solange ein Widget im Vollbild läuft.

| Ausnahme | |
| --- | --- |
| Einzelner Tab | Editor → Tab-Einstellungen → **Nie automatisch verlassen** |
| Ganzer Bereich | Geltungsbereich auf den Bereich stellen, Rückkehr dort ausschalten |
| Vorübergehend am Gerät | Element **Rückkehr-Pause** in Header, Tab-Leiste oder Bereichs-Menü |
| Per Datenpunkt | Siehe [Einstellungen → Rückkehr steuern](./settings#rückkehr-steuern) |

## Werte & Formatierung

Nur im Geltungsbereich **Global** — gilt für alle Layouts und Widgets.

| Option                  |                                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Dezimalstellen (global) | Standard-Nachkommastellen; pro Widget überschreibbar                                                                           |
| 1000er-Trennzeichen     | `Aus` · `1.234,5` · `1,234.5` · `1 234,5` · `1'234.5`; das Dezimaltrennzeichen wechselt passend mit; pro Widget überschreibbar |
| DP-Namen bereinigen     | Suffixe entfernen (z. B. `.STATE`, `.LEVEL`); optional Punkte durch Leerzeichen ersetzen                                       |

Beide Zahlen-Optionen lassen sich pro Widget, Zelle und Listen-Eintrag überschreiben. In den Widget-Optionen stehen sie zusammen mit der Einheit in einer Reihe: **Einheit · Dezimalstellen · 1000er**. Der Knopf `Global` neben den Dezimalstellen bzw. der Eintrag `Global` in der Auswahl bedeutet: globale Vorgabe verwenden.
