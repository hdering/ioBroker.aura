# Kamera

Zeigt ein Kamera-Livebild als MJPEG-/Snapshot-Stream oder eine HTML-Seite im iframe. RTSP wird nicht unterstützt — stattdessen go2rtc als MJPEG-URL einbinden. Zusätzliche Info-Kacheln (Akku, Temperatur, Scharf-Status, Bewegung …) lassen sich neben dem Stream anordnen. Optional weckt ein Wake-up-Datenpunkt die Kamera erst bei Bedarf.

Mögliche Bildquellen (URL, Adapter-Pfad, Datei, Base64): siehe [Bildpfade](./bildpfade).

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
| `reloadOnWake` | `true` | Stream nach Display-Standby neu laden |
| `transparent` | `false` | transparenter Hintergrund |
| `interactionMode` | `content` | nur bei `.html`-Stream: `action` · `content` · `contentOnly` — siehe [iFrame](./iframe#interaktion-vs-klick-aktion) |

Stream-Typ wird aus der URL erkannt: `.html`/`.htm` → iframe, `rtsp://` → Hinweis, sonst Bild.

Scrollleiste im Widget: Passt die eingebettete Stream-Seite nicht exakt in die Kachel,
zeigt sie ihre eigene Scrollleiste — auf dem Desktop dauerhaft, auf Tablets unsichtbar
(Overlay-Scrollleiste). `interactionMode: action` blendet sie aus.

Geht das Display in den Standby, bricht der Browser den Stream ab; der eingebettete
Player darf ihn ohne Nutzer-Tipp nicht selbst neu starten und zeigt stattdessen einen
Play-Button. `reloadOnWake` lädt den Stream beim Aufwachen neu und umgeht das.

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
