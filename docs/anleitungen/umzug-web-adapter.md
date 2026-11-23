# Umzug auf den Web-Adapter

Aura läuft über eine Web-Instanz als `<web-port>/aura/`, z. B. `http://192.168.1.10:8082/aura/`. Der eigene Port `8095` ist veraltet und entfällt in einer kommenden Hauptversion ([#997](https://github.com/hdering/ioBroker.aura/issues/997)).

| | vorher | jetzt |
| --- | --- | --- |
| Dashboard | `http://<ip>:8095/` | `http://<ip>:8082/aura/` |
| Adminbereich | `http://<ip>:8095/#/admin` | `http://<ip>:8082/aura/#/admin` |
| MCP (KI-Zugriff) | `http://<ip>:8095/mcp` | `http://<ip>:8082/aura/mcp` |
| HTTPS, Zertifikat, Anmeldung | in der Aura-Instanz | von der Web-Instanz |
| Web-Adapter | optional | Pflicht (ab 8.0.0), wird mit Aura installiert |

Port und `https://` richten sich nach der gewählten Web-Instanz.

## Wer ist betroffen?

| Installation | Nach dem Update |
| --- | --- |
| Bestehend | Port `8095` läuft unverändert weiter, bis **Eigener Port (veraltet)** abgeschaltet wird |
| Neu, Web-Instanz auf demselben Host | Kein eigener Port, Web-Instanz automatisch gewählt |
| Neu, keine Web-Instanz auf dem Host | Eigener Port wie bisher |

## Umziehen

| Schritt | |
| --- | --- |
| 1. Web-Instanz wählen | ioBroker-Admin → Instanzen → Aura → ganz oben **Web-Instanz (/aura/)**. Für Visu App und Fernzugriff die Instanz aus `cloud.0` (meist `web.0`) |
| 2. Neue Adresse testen | `http://<ip>:<web-port>/aura/` öffnen, Adminbereich unter `…/aura/#/admin` |
| 3. Geräte umstellen | Siehe [Checkliste](#checkliste) |
| 4. Eigenen Port abschalten | Reverse Proxy vorher umstellen (siehe Checkliste). Abschnitt **Aura-Server** → **Eigener Port (veraltet)** aus → Rückfrage bestätigen → Speichern. Die Option verschwindet danach |
| 5. Weiterleitung beobachten | Solange **Alten Port weiterleiten (Übergang)** an ist, nennt das Log jedes Gerät, das noch über `:8095` kommt |
| 6. Weiterleitung abschalten | Sobald das Log kein Gerät mehr nennt |

## Checkliste

| Was | Umstellen |
| --- | --- |
| Lesezeichen | Neue Adresse speichern |
| Kiosk / Fully Kiosk | Start-URL auf `…/aura/` (inkl. `?client=…`, falls gesetzt) |
| Homescreen-App (PWA) | Alte App entfernen, unter der neuen Adresse neu hinzufügen ([Als App installieren](./als-app)) |
| Reverse Proxy (nginx, NPM, Caddy) | **Vor** dem Abschalten des eigenen Ports: Ziel auf den Port der Web-Instanz, ganze Domain (nicht nur `/aura/`), WebSockets an, Umleitung `/` → `/aura/` nur per `$request_uri` – [Reverse Proxy](./reverse-proxy). Die Weiterleitung des alten Ports greift hinter einem Proxy nicht, die Seite sagt dann, was umzustellen ist |
| KI-Clients (MCP) | Konfigurationsblock in der Instanz-Konfiguration neu kopieren ([MCP](../einstellungen/mcp#web-instanz)) |
| Skripte mit Links | `navigate.url`, Benachrichtigungen, Links in anderen Visus |
| Anmeldung der Web-Instanz | Ist sie aktiv, gilt sie jetzt auch für Aura. Für Kiosk-Geräte ohne Login eine eigene Web-Instanz ohne Anmeldung anlegen (nicht über die Cloud erreichbar) |

## Alten Port weiterleiten

Mit eigenem Port aus und **Alten Port weiterleiten (Übergang)** an:

| Aufruf auf `:8095` | Antwort |
| --- | --- |
| Seite (Browser, Kiosk) | Weiter auf `<web-port>/aura/` mit derselben Route (`#/…`) und `?client=…` |
| Geräte-Einstellungen | Kommen mit: Admin-Ansichten, Zoom, Datenpunkt-Auswahl, gesehene Meldungen, weggeklickte Hinweise. Client-ID und Gerät bleiben (Cookie `aura-device`) |
| Offenes Dashboard | Bleibt verbunden und lädt nach dem nächsten Aura-Update von selbst auf die neue Adresse |
| MCP | Fehler mit der neuen Adresse |
| Alles andere (Tresor, Dateien, Proxy) | `410 Gone` |

| Hinweis | |
| --- | --- |
| Voreinstellung | An für Installationen, die den eigenen Port benutzt haben; aus für neue |
| Gleicher Hostname | Client-ID kommt nur mit, wenn alte und neue Adresse denselben Namen bzw. dieselbe IP nutzen |
| Admin-Anmeldung | Einmal neu anmelden |
| Bearbeitungsverlauf | Rückgängig/Wiederholen der letzten Sitzung bleibt am alten Port |

## Mehrere Aura-Instanzen

| | |
| --- | --- |
| Regel | Eine Web-Instanz liefert genau eine Aura-Instanz unter `/aura/` aus |
| Zweite Aura-Instanz | Eigene Web-Instanz anlegen (z. B. `web.1` auf eigenem Port) oder ohne Web-Instanz mit eigenem Port betreiben |
| Doppelt gewählt | Hinweis unter der Auswahl, Warnung in beiden Logs und im web-Log, Fehler im Backend-Check |

## Probleme

| Problem | Lösung |
| --- | --- |
| `/aura/` zeigt die Startseite des Web-Adapters | Web-Instanz in der Aura-Instanz nicht gewählt oder nicht gespeichert |
| `/aura/` zeigt „Aura läuft nicht“ | Aura-Instanz starten; die Seite lädt von selbst neu |
| Port `8095` ist nach dem Abschalten trotzdem offen | Keine nutzbare Web-Instanz auf dem Host – Grund steht im Log (`opening port 8095 anyway`) |
| „Aura has moved into the web adapter“ statt Weiterleitung | Aufruf kommt über einen Reverse Proxy, der noch auf Port 8095 zeigt – [Proxy umstellen](./reverse-proxy) |
| Seite unter /aura/ ohne Live-Werte (hinter Proxy) | Proxy leitet nur `/aura/` weiter oder lenkt `/?sid=…` um – [Reverse Proxy](./reverse-proxy#probleme) |
| Leeres Dashboard, Widgets mit Ladefehler | Instanz-Konfiguration → **Backend prüfen** |
