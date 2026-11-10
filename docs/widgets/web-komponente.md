# Web-Komponente

Bettet eine **ioBroker-Web-Komponente** eines installierten Adapters ein — zum Beispiel das
Fluss-Diagramm des Adapters `flow`. Web-Komponenten sind Bausteine, die ein Adapter selbst
mitbringt und die in Aura, vis-2 und devices gleich aussehen und funktionieren
([`@iobroker/web-components`](https://github.com/ioBroker/web-components)).

Die Komponente liest und schreibt ihre Datenpunkte selbst. Aura gibt ihr die Verbindung zu
ioBroker, die gewählten Einstellungen, die Farben und die Schrift des aktiven Themes, den
Bearbeitungsmodus und Dialoge im Aura-Stil.

## Hinzufügen

„Web-Komponente“ ist **ein** Widget-Typ. Im Dialog **Neues Widget** steht er in einer eigenen,
farbig abgesetzten Gruppe **Web-Komponenten** (auch als Rubrik oben wählbar) — mit einem Eintrag
je Komponente:

![Gruppe Web-Komponenten im Dialog Neues Widget](assets/web-komponente/gruppe.png)

| Eintrag | Bedeutung |
| --- | --- |
| Name + Adapter (z. B. **Kalender** · `fullcalendar`) | Komponente eines installierten Adapters, mit Aura getestet |
| … · **nicht getestet** | automatisch aufgenommen, noch nicht mit Aura geprüft — funktioniert meist, ohne Gewähr |
| … · **Adapter fehlt** (ausgegraut) | bekannte Komponente, Adapter nicht installiert oder zu alt — lässt sich trotzdem platzieren |
| **Andere Web-Komponente …** | der Typ ohne Vorauswahl, die Komponente wird in den Einstellungen gewählt |

Mit Aura getestet (auch ohne Adapter im Dialog): **Fluss-Diagramm** (`flow` ab 0.2.0),
**Kalender** (`fullcalendar` ab 3.4.1). Die Suche findet Komponenten auch über den Adapter-Namen
oder „Web-Komponente“. Ein neues Widget bekommt die Größe, die die Komponente für sich angibt.

Im Dialog **Widget bearbeiten** steht der Typ in der Liste unter **Web-Komponenten (aus
Adaptern)**; darunter zeigt eine Karte Komponente, Adapter und Version.

![Typ Web-Komponente mit Info-Karte](assets/web-komponente/bearbeiten.png)

Angeboten wird, was ein Adapter in seiner `io-package.json` unter `common.webComponents`
anmeldet. Nach der Installation oder einem Update eines Adapters die Seite neu laden — oder in den
Einstellungen mit **↻** neben der Auswahl **Komponente** neu einlesen. Dort lässt sich auch auf eine
andere Komponente umstellen. Nach einem Neustart von ioBroker liest Aura die Liste selbst neu; fehlt
dabei noch eine Komponente (Upload läuft), versucht Aura es eine Minute lang alle 10 s erneut.

## Einstellungen

| Option | | |
| --- | --- | --- |
| `wcTag` | Komponente | Tag des Elements, z. B. `iob-flow-diagram` |
| `wcAdapter` | — | Adapter der Komponente, z. B. `flow`; nur wichtig, wenn zwei Adapter denselben Tag anbieten |
| `wcSettings` | Einstellungen der Komponente | `{ schlüssel: wert }` — welche Felder es gibt, legt die Komponente fest |

Unter der Auswahl zeigt der Editor die Einstellungen der gewählten Komponente: Textfelder,
Zahlen, Schalter, Farben, Auswahllisten, Datenpunkte, Objekte und Adapter-Instanzen — so, wie
sie die Komponente beschreibt. Gespeichert wird nur, was vom Standard abweicht.

Titel und Icon des Widgets sind standardmäßig an (`showTitle`, `showIcon`). Beim Fluss-Diagramm
fehlen deshalb dessen eigene Felder **Titel** und **Bei Klick groß öffnen** — das übernehmen der
Widget-Name und der **Vollbild-Knopf** unter **Darstellung**.

## Verhalten

- **Navigation:** Will die Komponente zu einer anderen Ansicht springen, öffnet Aura den Tab
  mit diesem Namen, Slug oder dieser ID — zuerst im aktiven Bereich, dann in den übrigen
  Bereichen des Layouts. Im Bearbeitungsmodus wird nicht gesprungen.
- **Dialoge:** Öffnet die Komponente einen Dialog, zeigt Aura ihn wie ein eigenes Popup — siehe
  [Dialoge](#dialoge).
- **Nicht installiert:** Fehlt die Komponente (Adapter entfernt), bleibt das Widget im
  Dashboard leer; im Bearbeitungsmodus steht ein Hinweis.
- **Größe:** Die Komponente füllt die ganze Widget-Fläche.
- **Datenpunkt-Muster:** Abonniert eine Komponente Datenpunkte mit `*` (z. B. alle Zustände
  unter `assistant-satellite.0.*`), bekommt sie jede Änderung eines passenden Datenpunkts
  sofort mit — ohne regelmäßig neu zu suchen.

## Dialoge

Manche Komponenten fragen in einem Dialog nach (z. B. Grenzwerte) oder zeigen Details in einem
größeren Fenster (z. B. den Verlauf einer Batterie). Aura öffnet diese Dialoge im eigenen Stil —
nicht als Fenster des Browsers:

![Formular-Dialog der Sprach-Satelliten (assistant)](assets/web-komponente/dialog.png)

- **Rahmen wie ein Popup:** abgedunkelter Hintergrund, abgerundete Fläche, Titelzeile mit
  Schließen-Knopf. Fläche und Abdunklung folgen den
  [globalen Popup-Einstellungen](../einstellungen/popups#globale-popup-einstellungen)
  (Hintergrundfarbe, Hintergrund abdunkeln).
- **Formular:** Fragt die Komponente nach Werten, zeigt Aura dieselben Felder wie im
  Einstellungs-Editor des Widgets (Text, Zahl, Schieberegler, Schalter, Farbe, Auswahl,
  Datenpunkt, Instanz) mit **Abbruch** und **OK** — bzw. den Beschriftungen, die die
  Komponente mitgibt. Titel und Beschriftungen erscheinen in der Sprache des Frontends.
- **Inhalt der Komponente:** Zeichnet die Komponente den Inhalt selbst, setzt Aura ihn in den
  Rahmen; er bekommt die Farben des Themes. Die Komponente schließt den Dialog selbst (z. B. mit
  einem eigenen **Fertig**-Knopf).
- **Abbrechen:** Schließen-Knopf, Tippen neben den Dialog oder `Esc` schließen ihn, ohne etwas
  zu übernehmen.
- **Größe:** Breite und Höhe wählt die Komponente; auf dem Handy nimmt der Dialog die ganze
  Bildschirmbreite ein, er ist nie größer als der Bildschirm.
- Pro Widget ist immer nur ein Dialog offen. Liegt das Widget in einem Popup, öffnet sich der
  Dialog darüber; solange darin gearbeitet wird, schließt sich das Popup nicht von selbst.
- Im **Bearbeitungsmodus** öffnet sich kein Dialog.

## Für Adapter-Entwickler

Wie eine Komponente gebaut und angemeldet wird, beschreibt das Paket
[`@iobroker/web-components`](https://github.com/ioBroker/web-components). Aura setzt die
Eigenschaft `dialogs`: `openDialog()` der Basisklasse öffnet damit den Aura-Dialog, ein
Element-Dialog schließt mit dem Ereignis `iob-dialog-close`. Aura lädt das Manifest
und das Modul über `/adapter/<adapter>/…`; Komponenten mit React importieren
`/lib/esm/react-19.js` bzw. `react-18.js` — beides liefert Auras eigener Server (Port 8095)
aus, hinter der web-Erweiterung (`/aura/`) der web-Adapter.
