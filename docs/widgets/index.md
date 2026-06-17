# Widgets

Übersicht aller verfügbaren Widgets. Jede Seite zeigt das Widget und seinen Einstellungs-Dialog.

## Steuerung & Anzeige

| Widget | Beschreibung |
| --- | --- |
| [Auswahlfeld](./auswahlfeld) | DP-Werte (0,1,2…) auf Text-Labels mappen; Dropdown schreibt den Wert zurück. |
| [Binärsensor](./binaersensor) | Allgemeinen Binärsensor anzeigen (z. B. Bewegungsmelder, Alarm). |
| [Datumswähler](./datumswaehler) | Datum/Uhrzeit auswählen und als Datenpunkt speichern. |
| [Diagramm (einfach)](./diagramm) | Verlauf eines einzelnen Datenpunkts als einfaches Diagramm. |
| [Diagramm (erweitert)](./diagramm-erweitert) | Erweitertes Diagramm mit mehreren Datenpunkten und Optionen. |
| [Dimmer](./dimmer) | Licht dimmen – Helligkeitsregler 0–100 % mit Ein/Aus-Taste. |
| [Drehregler](./drehregler) | Wert über Drehknopf einstellen – 3 Zeigertypen, Winkelbereich konfigurierbar. |
| [Dynamische Liste](./dynamische-liste) | Datenpunkte automatisch aus einem ioBroker-Ordner auflisten. |
| [eCharts](./echarts) | Vorkonfiguriertes eCharts-Diagramm per JSON-Preset. |
| [Eingabefeld](./eingabefeld) | Text per Tastatur eingeben und in einen Datenpunkt schreiben. |
| [Fenster-/Türkontakt](./fensterkontakt) | Fenster- oder Türkontakt-Status anzeigen (offen/geschlossen). |
| [Füllstandsanzeige](./fuellstandsanzeige) | Füllstand (z. B. Wassertank, Heizöl) als Balken visualisieren. |
| [Gauge](./gauge) | Zahlenwert als Tachonadel/Kreisbogen visualisieren. |
| [HTTP-Aktion](./http-aktion) | HTTP GET/POST-Anfrage per Klick auslösen (z. B. Webhook). |
| [Mediaplayer](./mediaplayer) | Mediaplayer steuern (Sonos, Squeezeserver, Spotify …). |
| [Raumklima](./raumklima) | Temperatur, Luftfeuchtigkeit und optionalen Temperaturverlauf kombiniert anzeigen. |
| [RGB-Licht](./rgb-licht) | RGB / CCT / Dimmer in einem Widget – Helligkeit, Farbe, Lichtwärme, Effekte. |
| [Rollladen](./rollladen) | Rollladen-Position (0–100 %) steuern und anzeigen. |
| [Schalter](./schalter) | Ein/Aus-Schalter für Boolean-Datenpunkte (z. B. Lampe, Steckdose). |
| [Schieberegler](./schieberegler) | Beliebigen Zahlenwert per Schieberegler einstellen. |
| [Schnellzugriff-Chips](./chips) | Kompakte Schaltflächen-Leiste für Szenen und häufige Aktionen. |
| [Statische Liste](./liste) | Manuell gepflegte Liste mit frei konfigurierbaren Datenpunkt-Links. |
| [Thermostat](./thermostat) | Soll-Temperatur einstellen und Ist-Temperatur anzeigen. |
| [Universal-Widget](./universal-widget) | Freies Raster – Zellen einzeln mit Schaltern, Reglern, Werten und Bildern belegen. |
| [Wert-Anzeige](./wert-anzeige) | Einen Datenpunktwert als Zahl/Text anzeigen (read-only). |

## Spezial

| Widget | Beschreibung |
| --- | --- |
| [Adapter-Logs](./adapter-logs) | Live-Log-Stream aller Adapter — Filter nach Schweregrad, Adapter und Freitext. |
| [Adapter-Status](./adapter-status) | Liste aller ioBroker-Instanzen mit Status, Update-Hinweisen und Aktionen. |
| [Alarmanlage](./alarmanlage) | ioBroker.alarm-Adapter steuern — Scharf/Inside/Nacht, Zonen, PIN, Tages-Log. |
| [Bild](./bild) | Statisches Bild, lokale Datei oder URL anzeigen. |
| [evcc](./evcc) | evcc Wallbox-Ladesteuerung einbinden. |
| [HTML](./html) | Beliebigen HTML/CSS-Code frei einbetten. |
| [iFrame](./iframe) | Externe Webseite oder lokale URL einbetten. |
| [JSON-Tabelle](./json-tabelle) | JSON-Array-Datenpunkt als formatierte Tabelle anzeigen. |
| [Kalender](./kalender) | Termine aus dem iCal-Adapter (nur per Tab-Wizard hinzufügbar). |
| [Kamera](./kamera) | Kamera-Livebild einbinden (go2rtc / MJPEG-Stream). |
| [Karussell](./karussell) | Horizontal scrollbare Chip-Liste – pro Item Datenpunkt + eigene Klick-Aktion. |
| [Müllabfuhr](./muellabfuhr) | Nächste Müllabfuhr-Termine vom Trash-Adapter anzeigen. |
| [Müllabfuhr-Zeitplan](./muellabfuhr-zeitplan) | Detaillierter Müllabfuhr-Kalender (Datenpunkt vom Trash-Adapter). |
| [Skript-Status](./skript-status) | Liste aller JavaScript-Skripte mit Status, Filter und Start-/Stopp-Aktionen. |
| [Uhrzeit](./uhrzeit) | Aktuelle Uhrzeit und Datum anzeigen (kein Datenpunkt nötig). |
| [Wetter](./wetter) | Wetterdaten vom ioBroker-Wetter-Adapter anzeigen. |
| [Zeitschaltuhr](./zeitschaltuhr) | Zeitgesteuerte Ereignisse — Wochentag/Astro/Einmalig/Zeitraum. |
| [Zustandsbild](./zustandsbild) | Je nach Zustand (true/false) ein anderes Bild anzeigen. |

## Layout

| Widget | Beschreibung |
| --- | --- |
| [Abschnittstitel](./abschnittstitel) | Trennlinie mit Überschrift zur Gliederung des Dashboards. |
| [Button](./button) | Klick-Aktion auslösen (Datenpunkt schreiben, HTTP-Call, Szene …). |
| [Gruppe](./gruppe) | Mehrere Widgets in einem gemeinsamen Rahmen gruppieren. |
| [Panels](./panels) | Mehrere Widgets als swipebare Slides – Wischen, Pagination-Dots und Pfeil-Buttons. |

## Konzepte

- [Custom-Layout](./custom-layout) — Widgets mit freier Zellen-Matrix gestalten
