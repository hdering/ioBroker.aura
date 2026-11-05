# Web-Komponente

Bettet eine **ioBroker-Web-Komponente** eines installierten Adapters ein — zum Beispiel das
Fluss-Diagramm des Adapters `flow`. Web-Komponenten sind Bausteine, die ein Adapter selbst
mitbringt und die in Aura, vis-2 und devices gleich aussehen und funktionieren
([`@iobroker/web-components`](https://github.com/ioBroker/web-components)).

Die Komponente liest und schreibt ihre Datenpunkte selbst. Aura gibt ihr die Verbindung zu
ioBroker, die gewählten Einstellungen, die Farben und die Schrift des aktiven Themes und den
Bearbeitungsmodus.

## Welche Komponenten gibt es?

Jeder Adapter, der in seiner `io-package.json` unter `common.webComponents` Komponenten
anbietet, erscheint in der Auswahl. Ist kein solcher Adapter installiert, bleibt die Liste leer.
Nach der Installation oder einem Update eines Adapters liest der Knopf **↻** neben der Auswahl
die Komponenten neu ein.

## Einstellungen

| Option | | |
| --- | --- | --- |
| `wcTag` | Komponente | Tag des Elements, z. B. `iob-flow-diagram` |
| `wcAdapter` | — | Adapter der Komponente, z. B. `flow`; nur wichtig, wenn zwei Adapter denselben Tag anbieten |
| `wcSettings` | Einstellungen der Komponente | `{ schlüssel: wert }` — welche Felder es gibt, legt die Komponente fest |

Unter der Auswahl zeigt der Editor die Einstellungen der gewählten Komponente: Textfelder,
Zahlen, Schalter, Farben, Auswahllisten, Datenpunkte, Objekte und Adapter-Instanzen — so, wie
sie die Komponente beschreibt. Gespeichert wird nur, was vom Standard abweicht.

Titel und Icon des Widgets sind standardmäßig ausgeblendet (`showTitle`, `showIcon`), weil die
meisten Komponenten eine eigene Überschrift haben.

## Verhalten

- **Navigation:** Will die Komponente zu einer anderen Ansicht springen, öffnet Aura den Tab
  mit diesem Namen, Slug oder dieser ID — zuerst im aktiven Bereich, dann in den übrigen
  Bereichen des Layouts. Im Bearbeitungsmodus wird nicht gesprungen.
- **Dialoge** der Komponente öffnen sich als Dialog des Browsers in den Farben des Themes.
- **Nicht installiert:** Fehlt die Komponente (Adapter entfernt), bleibt das Widget im
  Dashboard leer; im Bearbeitungsmodus steht ein Hinweis.
- **Größe:** Die Komponente füllt die ganze Widget-Fläche.

## Für Adapter-Entwickler

Wie eine Komponente gebaut und angemeldet wird, beschreibt das Paket
[`@iobroker/web-components`](https://github.com/ioBroker/web-components). Aura lädt das Manifest
und das Modul über `/adapter/<adapter>/…`; Komponenten mit React importieren
`/lib/esm/react-19.js` bzw. `react-18.js` — beides liefert Auras eigener Server (Port 8095)
aus, hinter der web-Erweiterung (`/aura/`) der web-Adapter.
