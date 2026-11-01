# Als App installieren

Aura bringt ein Web-App-Manifest mit (ab v0.90.0). Installiert öffnet sich Aura ohne Browserleisten, mit eigenem Namen „Aura“ und eigenem Icon.

## Voraussetzungen

| Browser | Installieren über | Braucht HTTPS |
| --- | --- | --- |
| Chrome / Edge (Android) | ⋮ → **Installieren** | Ja |
| Chrome / Edge (Windows, macOS, Linux) | Installieren-Symbol in der Adressleiste oder ⋮ → Streamen, speichern und teilen → **Seite als App installieren** | Ja |
| Safari (iOS, iPadOS) | Teilen → **Zum Home-Bildschirm** | Nein |
| Chrome, Edge, Firefox (iOS ab 16.4) | Teilen → **Zum Home-Bildschirm** | Nein |
| Firefox (Android) | ⋮ → **Zum Startbildschirm hinzufügen** | Nein |
| Firefox (Desktop) | Nicht möglich, Firefox unterstützt keine Web-Apps | – |

„Braucht HTTPS“ heißt: `https://` mit einem **gültigen** Zertifikat oder `localhost`. Das selbst signierte Standardzertifikat von ioBroker reicht nicht.

## „Diese App kann nicht installiert werden“

Chrome unter Android über `http://<iobroker-ip>:8095` zeigt im Menü:

| Eintrag | Meldung |
| --- | --- |
| Installieren | Diese App kann nicht installiert werden |
| Verknüpfung erstellen | Verknüpfungen werden in Chrome geöffnet |

Die Verknüpfung öffnet Aura als normalen Tab mit Browserleiste. Ursache ist die fehlende sichere Verbindung, nicht Aura ([#899](https://github.com/hdering/ioBroker.aura/issues/899)).

| Lösung | |
| --- | --- |
| HTTPS mit gültigem Zertifikat | Reverse Proxy (Nginx Proxy Manager, Caddy, …) mit Let's Encrypt oder ein gültiges Zertifikat in der Aura-Instanz – siehe [README: HTTPS / Reverse Proxy](https://github.com/hdering/ioBroker.aura#https--reverse-proxy) |
| Nur Heimnetz, ohne Zertifikat | Chrome-Flag, siehe unten |
| Alte Version | Mindestens v0.90.0 installieren, danach die Seite einmal neu laden |

## Chrome-Flag fürs Heimnetz

Auf dem Handy in Chrome:

| Schritt | |
| --- | --- |
| 1 | `chrome://flags/#unrestricted-insecure-origin-as-secure` öffnen |
| 2 | Aura-Adresse eintragen, genau wie im Browser aufgerufen, mit Port: `http://192.168.178.10:8095` |
| 3 | Auf **Enabled** stellen, **Relaunch** |
| 4 | Aura öffnen → ⋮ → **Installieren** |

Mehrere Adressen durch Komma trennen. Das Flag gilt nur für dieses Gerät und diesen Browser.

## Tipps

| | |
| --- | --- |
| Startseite | Die App startet immer mit `/` (erstes Layout), ohne `?client=` und ohne `#/<layout>` aus der URL beim Installieren |
| Feste Client-ID | In der installierten App: Admin → Verbundene Geräte → ✎ beim eigenen Gerät; `?client=` wird nicht gespeichert ([Client-ID](../einstellungen/settings#client-id)) |
| iOS | Die Home-Bildschirm-App hat einen eigenen Speicher, getrennt von Safari – feste ID dort neu vergeben |
| Anderes Layout | Per Skript `aura.0.clients.<ID>.navigate.url` |
| Push-Nachrichten | Gibt es nicht – bräuchten einen Service Worker und HTTPS. Stattdessen Telegram, Pushover o. Ä. oder [Meldungen](../einstellungen/meldungen) in Aura |
