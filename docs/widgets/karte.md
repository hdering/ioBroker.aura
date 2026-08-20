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
