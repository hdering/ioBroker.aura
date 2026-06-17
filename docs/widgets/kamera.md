# Kamera

Zeigt ein Kamera-Livebild als MJPEG-/Snapshot-Stream oder eine HTML-Seite im iframe. RTSP wird nicht unterstützt — stattdessen go2rtc als MJPEG-URL einbinden. Zusätzliche Info-Kacheln (Akku, Temperatur, Scharf-Status, Bewegung …) lassen sich neben dem Stream anordnen. Optional weckt ein Wake-up-Datenpunkt die Kamera erst bei Bedarf.

## Datenpunkt

Kein Pflicht-Datenpunkt; die Stream-URL kann statisch oder aus einem Datenpunkt kommen.

| Feld | Pflicht | Typ | |
| --- | --- | --- | --- |
| `streamUrl` | ja* | — | Stream-/Snapshot-URL (bei `streamUrlMode: static`) |
| `streamUrlDp` | ja* | — | Datenpunkt mit der URL (bei `streamUrlMode: datapoint`) |
| `wakeUpDp` | nein | `boolean` | weckt die Kamera (`true`/`false` via Wake-up) |
| Info-/Slot-DPs | nein | — | je `infoItems`/`customSlots`-Eintrag ein eigener Datenpunkt |

*je nach `streamUrlMode` einer von beiden.

## Layouts

### Minimal
Nur der Stream füllt die ganze Zelle (mit Vollbild-Button, Zeitstempel und Wake-up-Overlay).

### Default
Stream oben (Höhe per `videoRatio`), darunter Titel und Info-Zeilen aus `infoItems`.

### Custom
Stream und Info-Kacheln (`customSlots`) in einem Raster nach `cameraTemplate`: `stream-left`, `stream-top`, `stream-topleft`, `stream-right` oder `stream-full` (Vollbild mit Info-Overlay).

## Einstellungen

Alle Optionen werden im Editor unter **Widget bearbeiten** gesetzt.

![](./assets/kamera/config.png)

### Stream

| Option | Standard | |
| --- | --- | --- |
| `streamUrlMode` | `static` | `static` · `datapoint` |
| `streamUrl` | — | feste Stream-/Snapshot-URL |
| `streamUrlDp` | — | Datenpunkt mit URL (nur `datapoint`) |
| `refreshInterval` | `5` | Sekunden pro Snapshot (`0` = LIVE/MJPEG) |
| `fitMode` | `cover` | `cover` · `contain` |
| `showTimestamp` | `true` | Zeitstempel einblenden |
| `transparent` | `false` | transparenter Hintergrund |

Stream-Typ wird aus der URL erkannt: `.html`/`.htm` → iframe, `rtsp://` → Hinweis, sonst Bild.

### Wake-up

Aktiviert die Kamera erst bei Bedarf über einen Steuer-Datenpunkt und schaltet sie nach Ablauf wieder ab.

| Option | Standard | |
| --- | --- | --- |
| `wakeUpDp` | — | Wake-up-Datenpunkt (`boolean`) |
| `wakeUpMode` | `onClick` | `onClick` · `onView` (ohne `wakeUpDp` immer `auto`) |
| `wakeUpDelay` | `3` | Sekunden bis der Stream nach dem Wecken bereit ist |
| `streamTimeout` | `60` | Sekunden bis Auto-Abschaltung (`0` = aus) |

### Anzeige

| Option | Standard | |
| --- | --- | --- |
| `showTitle` | `true` | Titel anzeigen |
| `showIcon` | `true` | Icon anzeigen |
| `icon` | `Camera` | [Lucide-Icon](https://lucide.dev) |
| `iconSize` | `20` | px |
| `titleAlign` | `left` | `left` · `center` · `right` |
| `videoRatio` | `60` | Höhe des Streams in % (Default-Layout) |

### Info-Kacheln

Pro Slot ein Typ: `text`, `datapoint`, `manufacturer`, `battery`, `temperature`, `armed` oder `motion`.

| Option | Standard | |
| --- | --- | --- |
| `infoItems` | `[]` | Info-Zeilen im Default-Layout |
| `customSlots` | `[]` | Info-Kacheln im Custom-Raster |
| `cameraTemplate` | `stream-left` | Raster-Vorlage (Custom-Layout) |
