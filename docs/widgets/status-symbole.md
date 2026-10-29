# Status-Symbole

Eigene Symbole in der Statuszeile eines Geräte-Widgets, neben Batterie, Erreichbarkeit, Fenster und Sperre. Beispiel: Bewegungsmelder gesperrt an einer Lampe, per Klick umschaltbar.

![Lampe mit eigenen Status-Symbolen](./assets/status-symbole/widget.png)

**Widget bearbeiten → Status-Datenpunkte → Eigene Symbole & Reihenfolge**

![Dialog Status-Symbole](./assets/status-symbole/editor.png)

| Feld | Bedeutung | Leer = |
|---|---|---|
| Datenpunkt | Wert entscheidet aktiv / inaktiv | – |
| Aktiv bei | kommagetrennte Werte für „aktiv“ | `true,1` |
| Symbol aktiv / inaktiv | Iconify-Icon je Zustand | inaktiv = aktives Symbol |
| Farbe aktiv / inaktiv | Farbe je Zustand | Akzentfarbe / Grün |
| Tooltip | Text beim Überfahren | – |
| Anzeigen | Immer · Nur wenn aktiv · Nur wenn inaktiv | Immer („Nur bei Alarm“ = nur wenn aktiv) |
| Klick | Nur anzeigen · Umschalten | Nur anzeigen |
| Schreib-DP | Ziel beim Umschalten | Datenpunkt oben |
| Wert → aktiv / inaktiv | geschriebener Wert | `true` / `false`, bei Zahlen `1` / `0` |

| Verhalten | |
|---|---|
| Reihenfolge | Pfeile ‹ › im Dialog, gilt auch für die festen Symbole |
| Position der Statuszeile | Unten rechts (Standard) · Unten links · Oben rechts · Oben links |
| Am Kartenrand | schiebt die Zeile in den Innenabstand — verdeckt keine Schalter / Regler |
| Klick aufs Symbol | schaltet nur das Symbol, nicht die Kachel |
| Bestätigung | „Bestätigung“ des Widgets fragt auch hier nach |
| Editor | Klick schreibt nichts |
| Custom-Layout | Zelle **Aktion / Icon** → „Status-Badges (alle)“ oder „Eigenes Symbol: …“ einzeln |
| Vorlage | „Vorlage: Bewegungsmelder gesperrt“ legt Icons, Tooltips und Umschalten an |

## Wert statt Symbol

**Eigener Eintrag → Anzeige: Wert**: Der Datenpunkt steht als kleine Pille in der Statuszeile, z. B. `21,5 °C`, in jeder der vier Ecken.

| Feld | Bedeutung | Leer = |
|---|---|---|
| Nachkomma | feste Nachkommastellen | globale Einstellung als Höchstwert |
| Einheit | hinter dem Wert | – |
| Text | eigener Text mit Bindungen, `{dp}` = Wert dieses Eintrags: `{dp;round(0)} W`, `{0_userdata.0.x} / {dp}` | Wert + Einheit |
| Hervorheben bei | Werte oder Vergleiche: `>30`, `<=5`, `!=0`, `Eco` | nie hervorgehoben |
| Symbol / Farbe / Tooltip | je Zustand „Hervorgehoben“ / „Normal“; Symbol steht vor dem Wert | Akzentfarbe / Textfarbe |
| Anzeigen | Immer · Nur wenn hervorgehoben · Nur wenn normal | Immer („Nur bei Alarm“ blendet nur Werte mit Regel aus) |

Widgets: Schalter, Dimmer, Füllstandsanzeige, RGB-Licht, Thermostat, Raumklima, Rollladen, Fensterkontakt, Binärsensor, Zustandsbild, Wert, Schieberegler, Drehknopf, Auswahl, Datumswähler, Mediaplayer, Klimasteuerung, Alarmanlage, Button, Kamera, Gauge, Energiefluss (evcc), Kalender, Müllabfuhr, Müllabfuhr-Zeitplan, Karte, HTML, Universal-Widget.

Bei den letzten zwölf sitzt die Statuszeile immer auf der Karte, auch im Custom-Layout.
