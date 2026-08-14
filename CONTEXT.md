# Kontext

## Current Task

Issue #429 (Meldungs-System) auf Branch `feat/messages-429` vollständig umgesetzt und getestet — Adapter, Toast-Ebene, Widget, Admin-Seite, Header-Glocke, Bedingungs-Effekt, Doku. Noch nicht gepusht/gemerged.

## Key Decisions

- Der Adapter normalisiert jeden Payload und besitzt das Archiv (`messages.*`); das Frontend konsumiert nur fertige Einträge — kein zweites Regelwerk.
- Präsentations-Standardwerte in `config.messageDefaults` (DP), von Adapter **und** Frontend gelesen, in Admin → Meldungen editiert. Archivgröße/Aufbewahrung bleiben Instanz-Einstellungen.
- Seen-Tracking ist `id → ts`: gleiche id mit neuerem Zeitstempel ist ein Update (wiederverwendbare ID), gleicher Zeitstempel ein Replay nach Reload.

## Next Steps

- Auf der Testinstanz (192.168.188.168) manuell prüfen, sobald der Adapter dort läuft: Schreiben auf `aura.0.messages.send`, Layout-DP nach Umbenennung, `unreadCount` über mehrere Clients.
- Doku-Screenshots der Frontend-Teile sind dunkel (Theme der Dev-Proxy-Instanz) — bei Gelegenheit hell nachziehen.
- `npm run test:messages` (Adapter) und `npm run test:messages-ui` (Playwright gegen `npm run dev`).
