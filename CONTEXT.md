# Kontext

## Current Task
Umsetzung `C:\projects\claude-design-doku-plan.md` — Doku für visuelle Dashboard-Mockups. Pilot + Infrastruktur fertig & gepusht (Commit 691c48cc auf main); Rollout auf übrige Widgets steht noch aus.

## Key Decisions
- Harness `widgets-all.mjs` rendert pro `shots[]`-Eintrag ein Element-Crop (`layout-<name>.png`/`variant-<name>.png`); ohne `shots` weiter `runtime.png`. Thermostat ist der Pilot/Template.
- Widget-MD-Seiten sind handgepflegt — `gen-pages.mjs` ist nur Bootstrap und darf NICHT laufen (überschriebe angereicherte Seiten).
- SSoT: `tools/docs/build-widget-catalog.mjs` → `catalog.json` + `referenz.md`; Optionen halb-automatisch per `OPTION_SEED`-Map (aktuell nur thermostat).

## Next Steps
- Shots + MD-Anreicherung für restliche ~40 Widgets ausrollen (Layout-Zweige je Komponente prüfen); Dev-Server: `npm run dev` (5174), dann `node tools/screenshots/widgets-all.mjs`; danach `npm run docs:catalog`.
- Baustein 4: Typ-Spalten + Objekt-Schemata (customGrid/clickAction/conditions/badges), Querschnitts-Options-Seite, componentKey-Tabelle in `custom-layout.md`.
- Baustein 5 Rest: `schalter.md` (controlMode image, onValue/offValue), `zeitschaltuhr.md`-Platzhalter.
