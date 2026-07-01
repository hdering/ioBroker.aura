# Batterietyp & -inventar für die Statusübersicht (aus HA-Battery-Notes)

> Umsetzungsplan (freigegeben). Zum späteren Loslegen. Sprache: DE.
> Betrifft das bereits gebaute `statusoverview`-Widget (schwache Batterien / offene Fenster /
> Lichter / offline / Rauch+Wasser).

## Context

Die Statusübersicht zeigt heute *schwache* Batterien (%, „schwach"). Zusätzlich soll sichtbar werden,
**welcher Batterietyp** in jedem Gerät verbaut ist und **wie viele** man vom jeweiligen Typ braucht
(Einkaufsliste) — analog zu Home Assistant, das diese Daten aus der Community-Bibliothek
**HA-Battery-Notes** bezieht. Das soll sich künftig immer wieder erweitern lassen.

**Datenquelle:** `andrew-codechimp/HA-Battery-Notes`, Datei `library/library.json` — **MIT-lizenziert**
(bündelbar mit Copyright-Hinweis), Struktur `{ version, devices:[{ manufacturer, model, battery_type,
battery_quantity?, model_id?, model_match_method? (startswith|endswith|contains) }] }`, ~1000+ Einträge.
Match in HA über **manufacturer+model** (+ optional `model_id`).
Raw-URL: `https://raw.githubusercontent.com/andrew-codechimp/HA-Battery-Notes/main/library/library.json`

**Kernproblem:** ioBroker hat **keine normierten Modell-/Herstellerdaten** wie HAs Device-Registry.
Modell/Hersteller liegen in heterogenen `native.*`-Feldern je Adapter (zigbee `native.modelId`, hm-rpc
`native.TYPE`, …). `native` ist vom Frontend lesbar (`getObjectDirect` / `getObjectViewDirect` liefern das
volle Objekt inkl. `native`), aber die Feldnamen sind adapterspezifisch.
→ **Auto-Match ist best-effort** (v.a. zigbee: `native.modelId` ↔ HA `model_id`); **manuelle Zuordnung**
ist das verlässliche Rückgrat und überschreibt Auto.

**Entscheidungen:** (1) Darstellung = neuer Layout-Modus **„inventory"** im Statusübersicht-Widget (alle
Batteriegeräte nach Typ gruppiert + Gesamtanzahl + „Nachkaufen"-Zeile) **und** Typ inline in der Warnliste.
(2) Zuordnung = **Hybrid** (Auto via gebündelter HA-Bibliothek + manuelle Overrides). (3) Zusätzlich
**read-only Admin-Seite „Batterien"**: meine Geräte (Typ + Quelle + Abdeckung) + durchsuchbare Bibliothek;
Overrides dort bearbeitbar. (4) **Lizenz geklärt:** HA-Battery-Notes = MIT, Aura = MIT → kompatibel;
**kein UI-Hinweis** auf HA, nur eine Quellcode-Lizenznotiz.

**Overrides sind global** (Eigenschaft des Geräts, nicht eines Widgets):
`FrontendSettings.batteryTypeOverrides: Record<deviceId, { type: string; quantity?: number }>` in
`src-vis/store/configStore.ts` (persistiert via `managedStorage` → ioBroker-Config). Admin-Seite **und**
Widget lesen/schreiben denselben Store.

## Reuse (vorhanden)

- **Batterie-Discovery:** `categoryOf(...,'battery')` in `src-vis/utils/statusOverview.ts` + der Discovery-
  Loop in `StatusOverviewWidget.tsx` (findet Batterie-DPs bereits).
- **Objekte inkl. native:** `getObjectDirect` / `getObjectViewDirect` in `src-vis/hooks/useIoBroker.ts`
  liefern `value.native` (heute in `ioBrokerObject`-Typ nicht deklariert → ergänzen).
- **State→Device:** Parent-Auflösung wie in `useDatapointList.ts` (ID hochlaufen bis device/channel).
- **Statische Datentabellen-Muster:** `src-vis/utils/iconCategories.ts`, `dpTemplates.ts` (Vorbild für
  gebündelte Lookup-Daten). **Lazy-Import** hält es aus dem Haupt-Bundle.
- **Config-Muster:** `AutoListConfig`/`StatusOverviewConfig` (`inputCls`, Toggles, `<details>`).
- **Admin-Seite Muster:** `src-vis/pages/admin/AdminDashboard.tsx`; Route in `src-vis/main.tsx`
  (`createHashRouter`, `/admin`-Children, `lazyRoute(...)`), Nav in `AdminLayout.tsx` (`const NAV = [...]`).

## Datenbeschaffung: einmaliger Transfer + eigene Pflege + späterer Abgleich

Die Bibliothek wird **einmalig nach Aura transferiert** und wird damit zu **Auras eigener DB** (schlichtes
Datenfile im Repo, das wir direkt pflegen können). Drei Ebenen, damit spätere HA-Abgleiche eigene Ergänzungen
nicht überschreiben:

- **1. HA-Snapshot (re-synchronisierbar):** Build-Skript `tools/battery-library/build-battery-library.mjs`
  lädt die HA `library.json` (gepinnte Raw-URL), transformiert → `src-vis/data/batteryLibrary.generated.ts`
  (`export default` typisiertes Array; nur match-relevante Felder `manufacturer, model, model_id,
  model_match_method, battery_type, battery_quantity` + Provenienz-Konstanten `SOURCE_VERSION`,
  `SNAPSHOT_DATE`). npm-Script `battery-lib:update` = späterer HA-Abgleich.
- **2. Aura-eigene Ergänzungen (überleben Re-Sync):** handgepflegtes `src-vis/data/batteryLibrary.custom.ts`
  (gleiche Struktur). Zur Laufzeit `merge(generated, custom)` — `custom` gewinnt bei Konflikt. Hier tragen
  wir selbst neue/korrigierte Geräte ein, ohne dass ein späterer HA-Sync sie plättet.
- **3. Pro-Installation-Overrides:** die globalen `batteryTypeOverrides` (nutzerlokal, oben drauf).

Snapshot wird **gebündelt** (nicht live von GitHub → offline/kein CORS); Lazy-Chunk via
`import('../data/batteryLibrary')` (aggregiert 1 + 2).

- **Standardtypen** `BATTERY_TYPES` (AA, AAA, AAAA, C, D, 9V, CR2032, CR2450, CR2477, CR2, CR123A, CR1632,
  CR1620, LR44, …) als Dropdown-Vorschläge für manuelle Zuordnung.

## Lizenz/Attribution (kein UI-Hinweis)

Kein Hinweis auf Home Assistant **im UI** — nirgends sichtbar für Endnutzer. Da die HA-Bibliothek MIT-
lizenziert ist, bleibt lediglich eine **quellcode-seitige** Notiz `src-vis/data/batteryLibrary.LICENSE.txt`
(MIT-Copyright Andrew Jackson 2023–2025 + Quell-URL) im Repo — nicht im App-Bundle sichtbar, erfüllt die
MIT-Bedingung. (Reine Fakten Gerät→Typ sind kaum schutzfähig; die Datei ist der saubere, kostenlose Weg.)

## Matching (Hybrid)

`src-vis/utils/batteryLibrary.ts`:
- `loadDeviceModelIndex()` — **eine** `getObjectViewDirect('device')` + `('channel')` (mit `native`), baut
  `Map<id, { manufacturer?, model?, modelId?, name }>`; Modul-Cache (wie DP-Cache). Kein N-faches
  `getObjectDirect`.
- `extractDeviceModel(obj, adapterPrefix)` — adapterspezifische Extraktion, erweiterbar:
  - `zigbee` → `native.modelId` (als model_id), `native.manufacturerName`/`vendor`, `common.name` (model)
  - `hm-rpc`/`hmip` → `native.TYPE` (als model_id)
  - generisch → `native.model`/`native.modelId`, `native.manufacturer`/`native.vendor`, `common.name`
- `matchBatteryType(model, lib)` — 1) `model_id` exakt (lowercased); 2) manufacturer+model mit
  `model_match_method`; → `{ batteryType, quantity }` | null.
- `resolveBatteryType(deviceId, index, lib, overrides)` — **manueller Override vor Auto**; liefert
  `{ type, quantity, source: 'manual'|'auto'|null }`. Overrides aus dem globalen Config-Store
  (Schlüssel = aufgelöste Geräte-ID, stabil; Geräte mit mehreren Batterie-DPs nur einmal).

## Widget-Änderungen

`src-vis/utils/statusOverview.ts`
- `StatusItem` + optional `batteryType?`, `batteryQuantity?`, `deviceId?`.
- `StatusOverviewOptions` + `batteryTypeEnabled?` (Overrides NICHT hier — global im Config-Store).
- Battery-Zweig in `evaluateItem` trägt Typ (falls vorhanden) mit — Label bleibt „12 %", Typ separat.

`src-vis/components/widgets/StatusOverviewWidget.tsx`
- Batterie-Kandidaten → eindeutige Geräte-IDs; `loadDeviceModelIndex()` + `loadBatteryLibrary()` (lazy) →
  je Gerät `resolveBatteryType`.
- **Warnliste (default/compact):** an schwache-Batterie-Zeilen `· <Typ>` anhängen.
- **Neuer Layout `inventory`:** ALLE Batteriegeräte (unabhängig vom Ladezustand), gruppiert nach Typ:
  Kopf „🔋 CR2032  ×N (M Geräte)", darunter Gerätenamen; Gruppe **„Unbekannt"** für nicht zugeordnete
  (mit Hinweis „im Editor zuordnen"); Fußzeile **„Nachkaufen: 4× CR2032, 6× AA …"** (Summe je Typ =
  Σ quantity). Zeilenklick-Sprung wie gehabt.

`src-vis/components/config/StatusOverviewConfig.tsx`
- Sektion **„Batterietypen"**: nur Toggle `batteryTypeEnabled` + Hinweis „Typen zuordnen unter
  Admin → Batterien". (Die Geräte-Zuordnung lebt auf der Admin-Seite / im globalen Store, nicht pro Widget.)

## Read-only Admin-Seite „Batterien"

- **Route/Nav (Muster vorhanden):** `src-vis/main.tsx` — lazy Route `{ path: 'batteries', element: … }`
  unter `/admin`-Children; `src-vis/pages/admin/AdminLayout.tsx` — NAV-Eintrag `{ to:'/admin/batteries',
  label:t('admin.nav.batteries'), icon: BatteryFull }`.
- **Seite** `src-vis/pages/admin/AdminBatteries.tsx` (Muster: `AdminDashboard.tsx`):
  - **Meine Geräte:** `loadDeviceModelIndex()` + Batterie-Discovery (`categoryOf` über DP-Cache) → Tabelle
    Gerät · Raum · **Typ** · **Quelle** (auto/manuell/—). Kopf-Statistik (gesamt / auto / manuell /
    unbekannt) — „unbekannt" hervorgehoben.
  - **Override editierbar** (die eine Ausnahme zur Read-only-Regel): Typ-Dropdown (`BATTERY_TYPES`) + Menge
    je Gerät → schreibt `updateFrontend({ batteryTypeOverrides })`.
  - **Bibliothek durchsuchen:** read-only, filterbare Tabelle (Hersteller · Modell · model_id · Typ · Menge)
    aus der gemergten Bibliothek; Fußzeile mit Provenienz (Version/Datum), **ohne HA-Nennung**.

Weitere Änderungen:
- `src-vis/store/configStore.ts` — `FrontendSettings` + `batteryTypeOverrides?: Record<string,{type;quantity?}>`
  (+ Default). Wird via bestehendes `updateFrontend`/`managedStorage` persistiert.
- `src-vis/utils/widgetLayouts.ts` — `statusoverview` → `['default','compact','count','inventory']`.
- `src-vis/components/layout/WidgetFrame.tsx` — `inventory` in den hartkodierten statusoverview-Layout-Picker.
- `src-vis/types/index.ts` — `ioBrokerObject` um `native?: Record<string, unknown>` ergänzen.
- `src-vis/main.tsx` + `src-vis/pages/admin/AdminLayout.tsx` — Route + NAV-Eintrag für die Batterien-Seite.
- `src-vis/i18n/de.ts` + `en.ts` — `admin.nav.batteries` (+ evtl. Seiten-Strings; sonst inline-DE wie bisher).
- `RELEASE_NOTES.md` — 1 englischer Bullet (kein HA-Hinweis).

## Neue Dateien

- `tools/battery-library/build-battery-library.mjs` — Fetch+Transform (HA → generated).
- `src-vis/data/batteryLibrary.generated.ts` — HA-Snapshot (typisiert, Provenienz). Re-synchronisierbar.
- `src-vis/data/batteryLibrary.custom.ts` — Aura-eigene Ergänzungen/Korrekturen (handgepflegt), leer/Startset.
- `src-vis/data/batteryLibrary.ts` — aggregiert `merge(generated, custom)` + `export default`; Ziel des
  Lazy-Imports.
- `src-vis/data/batteryLibrary.LICENSE.txt` — MIT-Notiz (nur Quellcode, kein UI).
- `src-vis/utils/batteryLibrary.ts` — Typen, lazy Loader (`import('../data/batteryLibrary')`), Extraktoren,
  Matcher, `resolveBatteryType`, `loadDeviceModelIndex`, `BATTERY_TYPES`.
- `src-vis/pages/admin/AdminBatteries.tsx` — read-only Admin-Seite (meine Geräte + Bibliothek, Overrides).

## Verifikation

- `npx tsc --noEmit` + `npm run lint` + `npm run build` grün.
- Build-Skript einmal ausführen; `batteryLibrary.generated.ts` erzeugt + Größe/Provenienz prüfen.
- Screenshot-Harness (`?shot=1`, `window.__auraShot.mockObjectView`): Device-Objekte mit `native.modelId`
  + Batterie-DPs seeden, Bibliothek-Match prüfen; Layouts **inventory** (Gruppierung/Anzahl/„Nachkaufen"/
  „Unbekannt") und **default** (inline `· Typ`), sowie manuellen Override (überschreibt Auto).
- Admin-Seite `/admin/batteries`: Geräte-Tabelle mit Typ/Quelle + Abdeckungs-Statistik, Bibliothek-Suche,
  Override setzen → wirkt sofort im Widget (gemeinsamer Config-Store).
- Matcher-Logik mit ein paar zigbee-`modelId`-Beispielen gegen den Snapshot gegenprüfen.

## Scope-Grenzen v1

Auto-Match zunächst zigbee (+ generisch/hm-rpc best-effort); weitere Adapter später über `extractDeviceModel`.
Live-Update der Bibliothek aus GitHub nicht enthalten (gebündelter Snapshot + `battery-lib:update`-Skript).
Kein „Batterie zuletzt gewechselt"-Tracking (separates HA-Feature, hier ausgeklammert).

## Umsetzungsreihenfolge (Vorschlag)

1. Build-Skript + `generated.ts` / `custom.ts` / `batteryLibrary.ts` (Aggregat) + `LICENSE.txt`.
2. `batteryLibrary.ts` (util): Typen, Loader, Extraktoren, Matcher, `loadDeviceModelIndex`, `resolveBatteryType`.
3. `configStore.ts`: `batteryTypeOverrides` + `ioBrokerObject.native`.
4. Widget: `inventory`-Layout + inline Typ + Layout-Registrierung (widgetLayouts + WidgetFrame-Picker).
5. `StatusOverviewConfig.tsx`: Toggle + Hinweis.
6. `AdminBatteries.tsx` + Route (`main.tsx`) + NAV (`AdminLayout.tsx`) + i18n.
7. tsc/lint/build + Screenshot-Verifikation + RELEASE_NOTES.
