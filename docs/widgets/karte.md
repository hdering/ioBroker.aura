# Karte

Zeigt Positionen (Auto, Kind, Haustier …) aus Datenpunkten auf einer OpenStreetMap-Karte. Marker folgen live den Datenpunkten; optional wird die Entfernung zu einem Heimat-Marker eingeblendet. Schnellzugriff-Chips springen zu vordefinierten Orten, ein optionaler Umschalter wechselt den Kartentyp im laufenden Betrieb.

![](./assets/karte/runtime.png)

## Datenpunkt

Die Karte selbst hat keinen Haupt-Datenpunkt — Positionen werden pro **Marker** konfiguriert (`options.markers`). Ein Marker liest seine Koordinaten in einem von vier Modi:

| `mode` | Felder | Quelle |
| --- | --- | --- |
| `json` | `jsonDp`, `latPath`, `lonPath` | JSON-/Objekt-DP mit Pfad zu Lat/Lon |
| `latlon` | `latDp`, `lonDp` | zwei separate numerische DPs |
| `static` | `lat`, `lon` | feste Koordinaten |
| `address` | `address` | Freitext-Adresse, per OpenStreetMap geocodiert |

Pro Marker zusätzlich: `label`, `emoji`, `color`.

## Einstellungen

Alle Optionen werden im Editor unter **Widget bearbeiten** gesetzt.

![](./assets/karte/config.png)

### Karte

| Option | Standard | |
| --- | --- | --- |
| `mapStyle` | `standard` | `standard` · `satellite` · `terrain` |
| `tileUrl` | — | eigener Kachel-Server (überschreibt `mapStyle`) |
| `tileAttribution` | — | Copyright-Hinweis für `tileUrl` |
| `center` | Deutschland | `[lat, lon]` Startmittelpunkt |
| `zoom` | `6` | Start-Zoom; bei `followMarkers` = max. Zoom des Auto-Fit |
| `followMarkers` | `false` | Ansicht automatisch an alle Marker anpassen |

### Kartentyp umschalten

Chips über der Karte wechseln den Kartentyp im Frontend. Die Auswahl gilt nur für das jeweilige Gerät und fällt beim Neuladen auf den konfigurierten Kartentyp zurück. Eine eigene `tileUrl` wird angezeigt, bis im Frontend ein Kartentyp gewählt wird.

| Option | Standard | |
| --- | --- | --- |
| `showStyleChips` | `false` | Umschalter im Frontend anzeigen |
| `styleChipsCorner` | `top-left` | `top-left` · `top-right` · `bottom-left` · `bottom-right` |
| `styleChoices` | alle | angebotene Typen, z.B. `['standard', 'satellite']` |

Liegen Umschalter und Schnellzugriff-Chips in derselben Ecke, stapeln sie sich untereinander.

### Marker & Entfernung

| Option | Standard | |
| --- | --- | --- |
| `markers` | `[]` | Liste der `MapMarker` (siehe Tabelle oben) |
| `showDistance` | `false` | Entfernung zum Heimat-Marker anzeigen |
| `homeMarkerId` | — | `id` des Markers, von dem aus gemessen wird |

### Schnellzugriff-Chips

Chips (`quickViews`) rezentrieren die Karte auf einen gespeicherten Ort. Die Zielposition wird wie ein Marker aufgelöst (`mode` + Felder), zusätzlich mit optionalem `zoom`.

Pro Chip zusätzlich:

| Feld | Standard | |
| --- | --- | --- |
| `label` | `Position` | Text auf dem Chip |
| `emoji` | — | Symbol vor dem Text |
| `color` | Akzentfarbe | Farbe des Chips |
| `filled` | `false` | `color` füllt den ganzen Chip (statt nur den Rahmen); Textfarbe passt sich automatisch an |
| `zoom` | — | Zoomstufe beim Springen; ohne Wert bleibt die aktuelle |

| Option | Standard | |
| --- | --- | --- |
| `quickViews` | `[]` | Liste der `MapQuickView` |
| `chipsPosition` | `overlay` | `overlay` (über der Karte) · `below` (darunter) |
| `chipsCorner` | `top-right` | Ecke bei `overlay`: `top-left` · `top-right` · `bottom-left` · `bottom-right` |

### Linien: Routen & Strecken

Linien (`lines`) zeichnen eine berechnete Route zwischen zwei Markern oder eine aufgezeichnete Strecke. Ein Infokasten zeigt Name, Länge und bei Routen die Fahrzeit. Mit `followMarkers` passt sich die Ansicht auch an die Linien an.

![](./assets/karte/lines.png)

| `source` | Felder | Quelle |
| --- | --- | --- |
| `route` | `fromMarkerId`, `toMarkerId`, `profile` | Route entlang der Straßen (OSRM, OpenStreetMap); `profile`: `car` · `bike` · `foot` |
| `json` | `dp`, `pointsPath`, `latPath`, `lonPath` | DP mit Punkteliste, z.B. `{ "name", "lineColor", "points": [{ "lat", "lon", "timestamp", "speed", "accuracy" }] }`, auch GeoJSON |
| `history` | `dp`, `historyInstance`, `historyHours`, `maxPoints`, `latPath`, `lonPath` | Verlauf eines Positions-DPs (JSON oder `"lat,lon"`) aus History/InfluxDB/SQL |

Pro Linie zusätzlich:

| Feld | Standard | |
| --- | --- | --- |
| `label` | Name aus dem DP bzw. `Start → Ziel` | Name im Infokasten |
| `color` | `lineColor` aus dem DP, sonst blau (Route) / rot (Strecke) | Linienfarbe |
| `width` | `4` | Linienstärke in px |
| `showPoints` | `false` | Punkt je Messung (`json`/`history`); Klick zeigt Zeit, Tempo, Genauigkeit |
| `historyHours` | `24` | Zeitraum für `history` |
| `maxPoints` | `500` | neueste Punkte für `history` |

| Option | Standard | |
| --- | --- | --- |
| `lines` | `[]` | Liste der `MapLine` |
| `lineInfo` | `bottom-left` | Ecke des Infokastens: `top-left` · `top-right` · `bottom-left` · `bottom-right` · `off` |

Bewegt sich ein Marker, wird die Route höchstens alle 30 s neu berechnet.
