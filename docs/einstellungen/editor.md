# Dashboard-Editor

WYSIWYG-Editor für die Tabs und Widgets des gewählten Layouts. Widgets werden per Drag & Drop platziert und in der Größe verändert.

![](./assets/editor.png)

## Toolbar

| Element | |
| --- | --- |
| Layout-Auswahl | Aktives Layout zum Bearbeiten wählen |
| Neues Widget | Widget-Assistent öffnen |
| + Tab | Neuen Tab anlegen (Assistent) |
| Importieren | Widget aus JSON-Export einfügen |
| Strg+Alt halten | Vorschau ohne Bearbeiten-Buttons |

## Neues Widget

Zweistufiger Assistent: Datenpunkt wählen (Widget-Typ wird automatisch erkannt) oder Typ aus dem Katalog wählen.

![](./assets/editor-neues-widget.png)

Jedes Widget bietet über sein Menü (Chevron) `Bearbeiten`, `Bedingungen`, `Klick-Aktion`, `Exportieren`, `Kopieren` und `Löschen`.

## Bedingungen & Marker: Wertquelle

Auswahl im Datenpunkt-Feld einer Klausel bzw. eines Markers. Bleibt das Feld leer, gilt der Haupt-Datenpunkt des Widgets.

| Quelle | Wert |
| --- | --- |
| Datenpunkt | Angegebene State-ID (leer = Haupt-Datenpunkt) |
| Liste: ein Eintrag / alle Einträge / kein Eintrag | Klausel gegen jeden Listeneintrag geprüft |
| Liste: Anzahl / Anzahl aktiv | Einträge gesamt / aktive Einträge (> 0, true, nicht leer) |
| Liste: Summe / Durchschnitt / Minimum / Maximum | Zahl-Aggregat über die Listenwerte |

Listen-Quellen stehen bei `Liste` und `Dynamische Liste` zur Verfügung. Das Quellen-Auswahlfeld erscheint nur dort — bei allen anderen Widgets gibt es nur das Datenpunkt-Feld, dessen leerer Zustand den Haupt-Datenpunkt bedeutet. Gruppen, Tabs und Bereiche haben keinen Haupt-Datenpunkt; dort muss die Klausel einen Datenpunkt nennen.

## Bedingungen & Marker: Operatoren

| Operator | Trifft zu wenn |
| --- | --- |
| `=` / `≠` / `>` / `≥` / `<` / `≤` | Vergleich gegen Wert oder zweiten Datenpunkt |
| enthält | Wert enthält den Text |
| Ist wahr / Ist falsch | Wert ist `true`/`1` bzw. `false`/`0` |
| Ist aktiv / Ist inaktiv | Wert ist `> 0`, `true` oder nicht leer — bzw. das Gegenteil |
| Hat sich geändert | Datenpunkt liefert einen neuen Wert — egal welchen |

`Hat sich geändert` beschreibt den Moment des Wechsels, nicht einen Zustand: Die Klausel ist nur für die eine Auswertung direkt nach dem neuen Wert erfüllt. Sie steht in Widget-Bedingungen zur Verfügung und ist für `Widget neu laden` gedacht — nicht für Marker, Zellenregeln oder Tab-Bedingungen.

## Bedingungen: Effekte

Alles unterhalb der Klauseln greift, wenn die Regel zutrifft.

| Effekt | Wirkung |
| --- | --- |
| Stil wenn aktiv | die ganze Karte: Akzent, Hintergrund, Rahmen, Rahmenbreite, Eckenradius, Deckkraft, Text, Text 2, Fett, Kursiv |
| Elemente | je Element: Sichtbarkeit, Text bzw. Icon, Farbe, Schriftschnitt |
| Effekt | `Pulsieren` · `Blinken` · `Nur Rand pulsiert` |
| Widget neu laden | Widget wird neu aufgebaut — eingebettete Inhalte laden erneut |
| Sichtbarkeit steuern | `Ausblenden wenn erfüllt` · `Nur anzeigen wenn erfüllt`, optional mit Nachrücken |

`Nur Rand pulsiert` lässt den Inhalt lesbar und pulst nur einen Ring um die Karte. Die **Rand-Farbe**
steht direkt unter der Auswahl; ohne sie nimmt der Ring die Rahmenfarbe der Regel, sonst den Akzent.
`Pulsieren` und `Blinken` blenden dagegen die ganze Karte ab — also auch das, was sie anzeigt.

Rahmenbreite, Eckenradius und Deckkraft sind Auswahllisten; ein von Hand eingetragener Wert bleibt
als zusätzlicher Eintrag stehen. **Deckkraft** blendet die ganze Karte ab, Inhalt eingeschlossen —
soll nur eine Fläche durchscheinen, gehört das als Alpha in die Farbe selbst. Beides zusammen
multipliziert sich.

## Bedingungen: Elemente

Rechts im Regel-Panel steht ein Block je Element — **Titel**, **Icon**, **Wert**. Darin liegt alles über
dieses eine Element beisammen: ob es zu sehen ist, was es zeigt, wie es aussieht. Die Farben unter
„Stil wenn aktiv" sind dagegen CSS-Variablen und treffen alles, was das Widget zeichnet.

| Feld | |
| --- | --- |
| Sichtbar | `unverändert` · `anpassen` · `ausblenden` — die einzige Stelle zum Ausblenden |
| Text | bei `Titel` und `Wert`, sobald `anpassen` gewählt ist; `[[dp]]` wird live aufgelöst. Beim Wert entfällt dann die Einheit |
| Icon · Größe | bei `Icon`, sobald `anpassen` gewählt ist |
| Textfarbe · Fett · Kursiv | bei `Titel` und `Wert` |
| Icon-Farbe | bei `Icon` — ein Icon ist eine Grafik, Schriftschnitt tut ihm nichts |

Die Farbe hängt **nicht** an `anpassen`: ein Element einzufärben soll es nicht zugleich sichtbar
schalten. Nur bei `ausblenden` entfällt sie — dann gibt es nichts zu färben. Ein Zurückstellen auf
`unverändert` verwirft Text bzw. Icon, sonst würde hinter dem Wort doch etwas überschrieben.

Angeboten werden nur Elemente, die der Widget-Typ auch hat — die [Karte](../widgets/karte) etwa hat
weder Titel noch Icon. Eine Regel darf mehrere Elemente gleichzeitig anfassen.

Was eine Regel setzt, gilt nur für die Anzeige: gespeichert bleibt die Einstellung des Widgets, und
trifft die Regel nicht mehr zu, steht wieder das Original da. Leere Felder zeigen als Platzhalter, was
das Widget heute anzeigt — den aktuellen Titel, das aktuelle Icon (ausgegraut), die aktuelle Größe.

Im [Custom-Layout](../widgets/custom-layout) wirkt `Sichtbar: ausblenden` auch auf die Titel-Zelle,
obwohl die sonst unabhängig von `showTitle` platziert wird.

## Bedingungen: Vorrang

| Stufe | Quelle |
| --- | --- |
| 1 | Widget-Einstellungen (Icon, Farben, Farbschwellen, Werte-Zuordnung) |
| 2 | Widget-Bedingungen, in Reihenfolge |
| 3 | Listenweite Zeilen-Regeln, in Reihenfolge |
| 4 | Regeln am einzelnen Eintrag bzw. an der Zelle, in Reihenfolge |

Alle zutreffenden Regeln werden der Reihe nach angewandt, **pro Eigenschaft gewinnt die letzte**. Eine
Regel, die nur die Textfarbe setzt, lässt den Hintergrund der vorherigen stehen. Die Reihenfolge im
Editor entscheidet also.

Ausblenden ist davon ausgenommen: hat eine Regel ausgeblendet, blendet keine spätere wieder ein.

## Bedingungen: Element-Ebene

Widgets mit vielen gleichartigen Kindern bieten Bedingungen zusätzlich **pro Kind** — dort ist „Zeile 3
rot" auf Widget-Ebene nicht sagbar.

| Widget | Wo | Wirkt auf |
| --- | --- | --- |
| [Statische Liste](../widgets/liste#bedingungen-je-zeile) · [Dynamische Liste](../widgets/dynamische-liste) | Dialog **Datenpunkte verwalten** → Tab **Bedingungen** (alle Zeilen) bzw. Eintrag → **Bedingungen** | Ganze Zeile · Name · Wert · Icon |
| Zweite Zeile beider Listen | Detail-Editor → **Zweite Zeile** → *Bedingungen* je Datenpunkt | dieser eine Wert |
| [Universal](../widgets/universal-widget) / Custom-Layout | Zellen-Editor → **Bedingungen** | diese eine Zelle |

Im Custom-Layout bieten alle wertführenden Zellen Bedingungen, dazu `Titel` · `Einheit` · `Text` ·
`Feld` · `Icon` · `Bild` · `Button`. Diese haben keinen eigenen Wert — eine Klausel dort liest den
Haupt-Datenpunkt des Widgets oder einen frei angegebenen.

Der Regel-Dialog ist derselbe wie auf Widget-Ebene: links **Stil wenn aktiv** (Textfarbe, Hintergrund
— nur bei „Ganze Zeile" —, Icon-Farbe, Fett, Kursiv) und darunter **Effekt** (`Pulsieren` · `Blinken`),
rechts **Element** mit `Wirkt auf` und `Sichtbar` (`unverändert` · `anpassen` · `ausblenden`). Text und
Icon erscheinen erst bei `anpassen`, damit hinter dem Wort „unverändert" nichts steht, das doch wirkt.

Schriftschnitt und Effekt gibt es auf beiden Ebenen — nur der Umfang unterscheidet sich: Farben und
Sichtbarkeit wirken auf der Widget-Ebene auf die ganze Karte, auf der Element-Ebene auf genau ein Teil.
`Nur Rand pulsiert` bleibt der Widget-Ebene vorbehalten: ein Text oder ein Icon hat keinen Rahmen.

Eine Regel auf **Ganze Zeile** gibt Textfarbe, Fett/Kursiv und Icon an die Teile weiter; Hintergrund und
Ausblenden bleiben bei der Zeile. Eine Regel auf einen einzelnen Teil gewinnt gegen die Zeilen-Regel.

### Widget neu laden

Für Widgets mit fremdem Dokument (iFrame, Kamera, Bild). Aura kennt nur die Adresse, nicht den Inhalt dahinter — ändert ein Skript die Daten der eingebetteten Seite, bleibt die Anzeige ohne diese Regel stehen.

| Klausel | Wann neu geladen wird |
| --- | --- |
| mit `Hat sich geändert` | bei jedem neuen Wert des Datenpunkts |
| alle anderen Operatoren | sobald die Regel von *nicht erfüllt* auf *erfüllt* wechselt |

Wirkt auch auf Widgets in Popup-Views, ohne das Popup zu schließen. Das Widget wird komplett neu aufgebaut — Scrollposition und Eingaben im eingebetteten Inhalt gehen dabei verloren. Für rein zeitgesteuertes Neuladen stattdessen `refreshInterval` des jeweiligen Widgets verwenden.

## Marker: Sichtbarkeit

| Modus | Wirkung |
| --- | --- |
| Immer | Marker ist dauerhaft sichtbar |
| Wenn Bedingung erfüllt | Klauseln wie oben; Startklausel ist `Haupt-DP ist aktiv` |

Der Datenpunkt im oberen Bereich gehört nur zum Stil `Anzahl` (der angezeigte Wert). Sichtbarkeits-Datenpunkte stehen in den Klauseln.
