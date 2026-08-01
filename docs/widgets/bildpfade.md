# Bildpfade

Gilt überall, wo ein Bild als URL, Pfad oder Datenpunktwert angegeben wird: [Bild](./bild), [Universal-Widget](./universal-widget) / [Custom-Layout](./custom-layout), [JSON-Tabelle](./json-tabelle), [Kamera](./kamera), [Mediaplayer](./mediaplayer), [Schalter](./schalter), [Fensterkontakt](./fensterkontakt), Zustands-Bild, Bild-Popup und `<img src="…">` in HTML-Feldern.

| Eingabe                  | Beispiel                                                          | Quelle                                     |
| ------------------------ | ----------------------------------------------------------------- | ------------------------------------------ |
| Externe URL              | `https://server/bild.png`                                         | beliebiger Webserver                       |
| HTTP-URL auf HTTPS-Seite | `http://192.168.1.10/cam.jpg`                                     | wird automatisch über `/proxy` geladen     |
| Adapter-Asset            | `/adapter/pirate-weather/icons/icebear/cloudy.svg`                | ioBroker-Web-Adapter                       |
| ioBroker-Dateisystem     | `/vis.0/main/bild.png`                                            | ioBroker-Web-Adapter                       |
| Relativer Adapter-Pfad   | `sonos/coverImage/192.168.1.10.png`                               | ioBroker-Web-Adapter                       |
| Datei vom Aura-Server    | `aura-file:/opt/iobroker/iobroker-data/files/vis.0/Aura/icon.png` | Datei-Picker (Ordner-Symbol)               |
| Data-URI                 | `data:image/png;base64,iVBORw0…`                                  | eingebettet                                |
| Base64-Rohdaten          | `iVBORw0KGgo…`                                                    | z. B. Kamera-Snapshot aus einem Datenpunkt |

## Hinweise

|                                |                                                                                                                                                       |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Adapter- und Dateisystem-Pfade | werden intern über `/webfs` an den ioBroker-Web-Adapter weitergereicht — Aura läuft auf einem eigenen Port und liefert diese Dateien nicht selbst aus |
| Base64-Erkennung               | greift nur bei langen Werten ohne Punkt; JPEG-Base64 (`/9j/…`) wird trotz führendem `/` korrekt erkannt                                               |
| Mime-Typ                       | wird aus den Base64-Daten ermittelt (PNG, GIF, WebP, SVG, JPEG)                                                                                       |
| JSON-Tabelle                   | `imagePathPrefix` je Spalte überschreibt die automatische Auflösung                                                                                   |
