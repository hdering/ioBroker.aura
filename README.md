# ioBroker.aura

**Aura** is a modern visualization dashboard for [ioBroker](https://www.iobroker.net/).

📖 **[Documentation](https://hdering.github.io/ioBroker.aura/)** – widgets, settings, screenshots

> **Beta** – The project is under active development. Bugs and breaking changes are possible.

---

## Features

- **Flexible grid layout** with drag & drop
- **Multiple tabs / pages** per dashboard
- **Themes:** Dark, Light, Catppuccin (Latte, Frappé, Macchiato, Mocha), Apple Liquid Glass and more
- **Full admin interface** – no YAML, no JSON editing required
- **Responsive** – works on tablet, smartphone and desktop

### Widgets

| Widget | Description |
|--------|-------------|
| Switch | On/Off toggle |
| Dimmer | Brightness slider |
| Thermostat | Target / actual temperature |
| Gauge | Round gauge with color zones |
| Fill level | Tank / water / gas level – vertical or horizontal |
| Chart | Line, bar, pie chart (ECharts) |
| Calendar | iCal / Google Calendar |
| Weather | Current weather data |
| Clock | Analog or digital |
| iFrame / Camera | Embed any URL |
| EVCC | Wallbox, solar, battery storage |
| Waste collection | Which bin needs to go out? |
| Group | Nested widgets |

---

## Installation

### Step 1 – Install adapter

Install Aura via ioBroker Admin:

1. Open ioBroker Admin
2. Go to **Adapters**
3. Search for **Aura** and install it

### Step 2 – Create instance

After installation, create a new **Aura** instance (if not done automatically).

### Step 3 – Configure web adapter

Open ioBroker Admin → Instances → **web.0** → Settings and set:

| Setting | Value |
|---------|-------|
| **socket.io** | **integrated** |

> **Important:** The default value "socket.io" uses the separate `iobroker.socketio` adapter on port 8084.
> Aura requires socket.io on the **same port** as the web adapter (integrated mode) so that both
> plain HTTP access and HTTPS via reverse proxy work with a single connection endpoint.

### Step 3b – (Optional) Dedicated web instance for proxy

Aura loads a proxy extension into a web adapter instance to enable the **iframe X-Frame-Options bypass** feature. By default no web instance is configured (proxy disabled).

> **Tip:** If you configure `web.0` as the proxy target, stopping or restarting aura will also restart `web.0` — taking down VIS, Material UI etc. To avoid this, create a dedicated instance:
>
> 1. Admin → **Adapters** → **web** → **+** → create `web.1`, set port to e.g. `8083`.
> 2. In **aura** admin → **"Web instance for proxy"** → select `system.adapter.web.1` → save.

### Step 4 – Open dashboard

The dashboard is available at:

```
http://<iobroker-ip>:8082/aura/
```

The admin interface at:

```
http://<iobroker-ip>:8082/aura/#/admin
```

---

## HTTPS / Reverse Proxy

Aura works behind a reverse proxy (e.g. **nginx**, **Nginx Proxy Manager**, **Caddy**) with a
valid TLS certificate (e.g. Let's Encrypt). The web adapter socket.io must be set to **integrated**
(see Step 3) so that `/socket.io/` and `/aura/` are served from the same port.

### Nginx Proxy Manager – example configuration

| Field | Value |
|-------|-------|
| Forward Scheme | `http` |
| Forward Hostname / IP | `<iobroker-ip>` |
| Forward Port | `8082` |
| Websockets Support | enabled |

No additional custom nginx directives are needed when socket.io is set to **integrated**.

### Why not use the ioBroker web adapter's built-in HTTPS?

When the web adapter itself terminates TLS (self-signed certificate), browsers block programmatic
WebSocket connections (`wss://`) from JavaScript even after the user accepted the HTTPS warning in
the browser. A reverse proxy with a CA-signed certificate (e.g. Let's Encrypt) avoids this
restriction entirely.

---

## Widget Notes

### Camera widget

#### Stream URL types

The camera widget auto-detects the stream type based on the URL:

| URL pattern | Rendering | Notes |
|---|---|---|
| `*.html` / `*.htm` | `<iframe>` | Works with go2rtc `stream.html`, any HTML-based player |
| `rtsp://` / `rtsps://` | Hint message | RTSP is not supported natively in browsers – use go2rtc as a proxy and enter the MJPEG URL instead |
| everything else | `<img>` | MJPEG (refresh interval = 0) or periodic snapshot |

**go2rtc MJPEG URL:** `http://<host>:1984/api/stream.mjpeg?src=<stream-name>`

#### Mixed Content (HTTP stream in HTTPS dashboard)

If Aura is served over **HTTPS** and the camera URL is **HTTP**, browsers apply mixed content rules:

| Client | Behaviour |
|---|---|
| Desktop Chrome / Firefox | Usually allows passive content (`<img>` MJPEG), may block `<iframe>` |
| Chrome on Android | Allows passive mixed content |
| **Android WebView** (Fully Kiosk, custom apps) | **Blocks all mixed content by default** |
| Safari / iOS | Blocks active mixed content (`<iframe>`) |

**Fixes:**
- **Fully Kiosk Browser:** Settings → Advanced Web Settings → **Allow Mixed Content** ✓
- **Clean solution:** serve go2rtc behind a reverse proxy with HTTPS so the camera URL is also `https://`
- **Quick workaround:** open Aura via `http://` instead of `https://` in the kiosk browser (only if your network is trusted)

The widget config panel shows a warning automatically when a `http://` stream URL is detected while Aura is running on `https://`.

#### Wake-up datapoint (battery cameras, e.g. Eufy)

Some cameras (e.g. Eufy) need an explicit activation signal before the stream is available. Configure an ioBroker datapoint in the widget settings – the widget sends `true` when the stream should start and `false` when it stops.

Three trigger modes are available:

| Mode | When is `true` sent? |
|---|---|
| Automatisch | On page load |
| Bei Sicht | When the widget scrolls into the viewport |
| Bei Klick | When the user taps the widget placeholder |

---

## Bugs & Feature Requests

Please report directly as a GitHub issue:

**[github.com/hdering/ioBroker.aura/issues](https://github.com/hdering/ioBroker.aura/issues)**

---

## Development

```bash
# Install dependencies
npm install

# Start dev server (connects to ioBroker via proxy)
npm run dev

# Production build
npm run build:adapter
```

---

## Changelog

### 0.9.79 (2026-05-17)
- fix(light): autoDetect mixed DPs from different zigbee devices


### 0.9.78 (2026-05-17)
Release v0.9.78


### 0.9.69 (2026-05-17)
- fix(fill): center horizontal battery silhouette in viewBox
- feat(list): configurable alignment + font size for sum line


### 0.9.66 (2026-05-17)
- chore(backup): surface writeBackup errors and server ack in console


### 0.9.64 (2026-05-17)
- feat(list): show sum of numeric values in static/dynamic list


### 0.9.62 (2026-05-17)
- fix(backup): auto-save also writes auto-backup


### 0.9.60 (2026-05-17)
- feat(json-table): add image column type


### 0.9.58 (2026-05-17)
- feat(universal): add 'Auswahlfeld' cell type
- docs(schalter): remove YAML example — aura uses admin UI, not config files


### 0.9.56 (2026-05-17)
- docs+widgets: move Universal-Widget from Layout to Steuerung & Anzeige
- docs(widgets): list all widget types — Schalter linked, rest 'geplant'
- docs: link documentation in README and admin sidebar
- docs(schalter): balanced style — short prose + tables + one example
- docs(schalter): strip prose, tables-only style
- ci: auto-enable GitHub Pages in docs workflow
- chore: ignore VitePress cache and dist
- docs: add VitePress site with Schalter widget page


### 0.9.55 (2026-05-16)
- fix(universal): confirm popup inherits anchor theme (v0.9.54)
- fix(universal): switch-cell confirm as small popup near the button (v0.9.53)


### 0.9.53 (2026-05-16)
- fix(universal): switch-cell confirm dialog as centered popup (v0.9.52)


### 0.9.51 (2026-05-16)
- fix(list): backendValueFilter is editor-only, decoupled from publish


### 0.9.50 (2026-05-16)
- fix(list): backend filter visible always + count actually updates


### 0.9.49 (2026-05-16)
- refactor(list): replace publishFilter with parallel backend value filter
- feat(list): independent backend-publish filter


### 0.9.47 (2026-05-16)
- feat(list): publish filtered count to ioBroker state


### 0.9.46 (2026-05-16)
- feat(list): full ON/OFF customization (text, text color, bg) global + per DP


### 0.9.45 (2026-05-16)
- feat(list): configurable active color + per-DP/global entry background


### 0.9.43 (2026-05-16)
- fix(light): power button square + size sliders for switch/brightness/CT


### 0.9.41 (2026-05-16)
- fix(dirty): tab/layout switch no longer marks dashboard as unsaved


### 0.9.39 (2026-05-16)
Release v0.9.39


### 0.9.38 (2026-05-16)
- feat(light): adjustable color wheel size + fix egg deformation


### 0.9.37 (2026-05-16)
- feat(light): decouple status from title
- fix(light): remove duplicate icon-size slider in Layout section
- feat(light): color palette size as free slider (12-96 px)
- feat(light): adjustable color palette size + editable widget title


### 0.9.32 (2026-05-15)
- feat(popups): Built-in Views als JSON-Dateien + Import/Export pro View
- feat(frontend): Hamburger LayoutDrawer für Layout-Wechsel (Desktop + Mobile)


### 0.9.31 (2026-05-15)
- fix(light): Schalt-DP fügt Power-Tab in Standard-Layouts hinzu


### 0.9.29 (2026-05-15)
Release v0.9.29


### 0.9.28 (2026-05-15)
- feat(widget-config): Auto-Erkennen Button-Styling vereinheitlicht


### 0.9.26 (2026-05-15)
- refactor(universal): Taster-Modus mit Toggle-Schalter wie Sicherheitsabfrage
- feat(universal): Sicherheitsabfrage für Switch-Cells
- fix(universal): einheitliche Textfarbe für alle statischen Cells (schwarz)


### 0.9.22 (2026-05-15)
Release v0.9.22


### 0.9.21 (2026-05-15)
- fix(editor): DP-Feld im 'Widget manuell hinzufügen' Step 2 ist nicht mehr Pflicht


### 0.9.19 (2026-05-15)
- fix(light): conic-gradient back to 'from 0deg' so red sits at 12 o'clock


### 0.9.18 (2026-05-15)
- fix(light): color wheel knob aligned with palette colors


### 0.9.17 (2026-05-15)
- feat(light): auto-detect DPs from siblings (Hue / HmIP / WLED)


### 0.9.16 (2026-05-15)
- feat(light): decouple status text from title — own toggle + alignment
- fix(light): suppress legacy Name/Stil sections that duplicated Darstellung
- fix(light): add 'light' to Darstellung/Erweitert/Icon-picker allow-lists
- feat(light): rename 'Alle Tabs' to 'Standard'; custom layout uses 3x3 grid
- fix(widgets): register light widget in WidgetFrame's local getWidgetMap
- feat(widgets): add light widget for RGB/CCT/dimmer lights
- feat(custom-grid): add momentary (Taster) mode to switch cells


### 0.9.15 (2026-05-15)
- fix(sync): prevent deleted widgets from reappearing after F5 / cross-browser saves


### 0.9.14 (2026-05-14)
Release v0.9.14


### 0.9.13 (2026-05-14)
Release v0.9.13


### 0.7.47 (2026-05-13)
- fix(editor): show widget settings in mobile view
- fix(admin): mobile layout fixes – Popups stacked + sidebar auto-close


### 0.7.46 (2026-05-13)
- feat(echart): Vergleichsmodus – Balkendiagramm mit aktuellen Werten als Kategorien


### 0.7.45 (2026-05-13)
- feat(picker): Spaltenansicht mit Wert/Einheit/Typ/History + Filter für Einheit und History


### 0.7.44 (2026-05-13)
- feat: Tab-Export und -Import im Dashboard-Editor


### 0.7.43 (2026-05-13)
- feat(climate): Auto-Erkennen für Luftfeuchtigkeit- und Soll-Temperatur-DP


### 0.7.42 (2026-05-13)
- fix(lint): unescaped quotes in ShutterWidget hint text


### 0.7.41 (2026-05-13)
- feat(universal): Bar-Stil für Schieberegler-Zelle (barStyle/barSize/orientation)


### 0.7.40 (2026-05-13)
Release v0.7.40


### 0.7.39 (2026-05-13)
Release v0.7.39


### 0.7.38 (2026-05-12)
- fix(popup): mobile-Breite nutzt Viewport besser (calc(100vw-16px) statt 90vw)


### 0.7.36 (2026-05-12)
- fix(widget): Klick auf Action-Buttons triggert nicht mehr das Popup


### 0.7.34 (2026-05-12)
- feat(slider): readOnly-Modus als Fortschrittsanzeige


### 0.7.33 (2026-05-12)
- feat(universal): Icon-Picker für Custom-Grid-Zellen
- feat(universal): Switch-Zelle mit optionalem Icon-Modus


### 0.7.32 (2026-05-12)
- feat(switch): optional Icon-Modus statt Schiebeschalter


### 0.7.31 (2026-05-12)
- chore(enum): Darstellung-Label umbenennen 'Aktuelles Label' → 'Aktuelle Auswahl'


### 0.7.30 (2026-05-12)
- feat(enum): Standard-Custom-Layout (3×3 CustomGridView)
- revert(enum): Custom-Layout entfernen – nur Universal-Widget hat das erweiterte Custom-Layout
- feat(enum): aktuelles Label additiv anzeigen + Custom-Layout


### 0.7.29 (2026-05-12)
- fix(enum): register EnumWidget in WidgetFrame's local widget-map
- fix(enum): widget.enum i18n key + rebuild bundle
- feat(enum): Auswahlfeld widget – DP-Werte auf Labels mappen + Dropdown-Schreibback


### 0.7.27 (2026-05-12)
- feat(static-list): per-entry displayType override


### 0.7.26 (2026-05-12)
- feat(static-list): zweite Sortierebene als Tiebreaker


### 0.7.25 (2026-05-12)
Release v0.7.25


### 0.7.24 (2026-05-12)
Release v0.7.24


### 0.7.23 (2026-05-12)
- feat: auto-reload frontend when adapter version changes


### 0.7.21 (2026-05-12)
- feat(dimmer): optional switchDp for separate on/off datapoint


### 0.7.20 (2026-05-12)
- feat(evcc): detect heating loadpoints and show 'Heizen' instead of 'Laden'
- feat(evcc): remove 'Karte' and 'Minimal' layouts from selector


### 0.7.19 (2026-05-12)
- feat(popup): three-level auto-close (global > view > click-action)


### 0.7.18 (2026-05-12)
- fix(climate): wire showAverage and showAverageAsValue options
- fix(climate): respect showYAxis/yAxisCompact options on Raumklima chart


### 0.7.16 (2026-05-12)
- feat(calendar): wire iCal lastUpdated into generic 'Letzte Änderung anzeigen' overlay


### 0.7.15 (2026-05-12)
- fix(evcc): show loadpoint title instead of generic 'Vehicle' fallback


### 0.7.13 (2026-05-12)
- fix(jsontable): re-apply auto-height when external writes revert gridPos.h
- debug(jsontable): log every config.gridPos.h change + onConfigChange calls
- debug(jsontable): log resolved gridGap/gridRowHeight values
- fix(jsontable): auto-height honors global gridGap/gridRowHeight settings
- build: rebuild frontend bundle to include auto-height fixes and debug logs
- debug(jsontable): log all measurements in auto-height effect
- fix(jsontable): handle table-wrapper overflow:auto clipping in auto-height


### 0.7.12 (2026-05-12)
Release v0.7.12


### 0.7.11 (2026-05-12)
- fix(jsontable): include widget padding+border in auto-height calc
- Revert "refactor(socket): load socket library from web/socketio adapter at runtime"
- refactor(socket): load socket library from web/socketio adapter at runtime
- fix(proxy): handle string socketPort and IPv6 bind addresses
- fix(proxy): auto-detect socket.io backend host from web/socketio instance (#195)


### 0.7.10 (2026-05-11)
- fix(clock): respect display setting in custom layout
- ui(conditions): wider settings popup with fluid layout
- feat(conditions): allow comparing two datapoints (DP vs DP)


### 0.7.9 (2026-05-11)
- ui(conditions): wider settings popup with fluid layout for DP comparison


### 0.7.8 (2026-05-11)
- feat(conditions): allow comparing two datapoints (DP vs DP) in widget conditions


### 0.7.7 (2026-05-11)
- fix(chart): tighten Y-axis width in compact mode (22px) vs full (36px)


### 0.7.6 (2026-05-11)
- feat(chart): optional Y-axis with compact notation (7000 → 7K)


### 0.7.5 (2026-05-11)
- feat(weather): expose tomorrow's symbol & values in custom layout
- feat(weather): responsive scaling, temperature color scale & custom-layout components


### 0.7.4 (2026-05-11)
- feat(autolist): add secondary sort level as tiebreaker


### 0.7.3 (2026-05-11)
- feat(trashschedule): add configurable icon sizes for default and list layouts


### 0.7.1 (2026-05-11)
- feat(autolist): expose cardMinWidth config field in card layout
- feat: add list layout and text size options to TrashScheduleWidget


### 0.7.0 (2026-05-11)
- fix: apply colorThresholds to compact layout thermostat value
- fix: add px-2 pt-2 padding to iframe widget title row
- fix: pin climate widget title+icon to top (shrink-0)
- fix: show °C instead of ° in all thermostat layouts
- fix: show degree symbol inline with thermostat setpoint, remove unit from label
- fix: center button label horizontally and vertically in default layout
- fix: center time display in ClockWidget default layout
- fix: ChipsWidget title always stays top, valign only affects chip area
- fix: align ChipsWidget to template standard + remove old layout duplicates
- feat: remove unused layouts from six widgets
- fix: remove extra px-3 from list/autolist header — aligns with widget padding
- fix: add padding to EChartsPresetWidget title/icon row
- fix: move Icon/Icon-Größe from DARSTELLUNG to widget settings for stateimage
- fix: remove duplicate Darstellung fields for stateimage/windowcontact/binarysensor
- fix: align SliderWidget title font size to standard (text-xs)
- fix: reduce status-label font size in default layout for boolean/state widgets
- Create FUNDING.yml
- test: set all widget value font sizes to text-xl font-bold
- fix: align font sizes in all widgets per widget-config-template standard
- fix: align value font sizes across widgets to ValueWidget standard
- fix: change default iconSize from 36px to 20px across all widgets


### 0.6.29 (2026-05-09)
Release v0.6.29


### 0.6.28 (2026-05-09)
- fix: barTrack height in DimmerWidget default/compact/minimal/card layouts
- feat: add Bar-Stil to DimmerWidget (copied from SliderWidget)


### 0.6.27 (2026-05-09)
- fix: remove unused editMode param from ThermostatWidget


### 0.6.26 (2026-05-09)
- fix: hide average ReferenceLine when showAverageAsValue is active (default layout)


### 0.6.25 (2026-05-09)
- feat: filter LayoutPicker to only show layouts available for widget type
- fix: apply admin portal theme vars to LayoutPicker dropdown
- fix: render LayoutPicker dropdown via portal to escape overflow-hidden clip
- feat: restrict popup-view type-defaults to specific widget layouts
- fix: persist removed builtin type-defaults across rehydration


### 0.6.24 (2026-05-09)
- fix: remove remaining clickable (detail-popup) toggle from WidgetFrame thermostat panel
- feat: remove clickable (detail-popup) setting from thermostat widget
- feat: merge Backup & Restore and Auto-Backup into single BackupCard
- feat: remove unused ioBroker Web-Adapter URL setting from expert panel


### 0.6.23 (2026-05-09)
- fix: revert shutter slider direction — slider mirrors displayed value
- fix: shutter slider always right=open; replace invertPosition toggle with actor-preset


### 0.6.22 (2026-05-09)
- feat: apply global decimals + per-cell override to custom layout
- fix: add px-2 pt-1 padding to IframeWidget title/icon row


### 0.6.21 (2026-05-09)
- fix: remove showTitle/titleAlign from MediaplayerWidget — track title always visible
- feat: convert MediaplayerWidget + 8 more widgets to DARSTELLUNG/ERWEITERT template
- fix: HeaderWidget subtitle toggle and title alignment
- feat: convert HeaderWidget, GroupWidget, ButtonWidget to DARSTELLUNG/ERWEITERT template
- feat: convert HtmlWidget and DatePickerWidget to DARSTELLUNG/ERWEITERT template
- feat: convert IframeWidget and JsonTableWidget to DARSTELLUNG/ERWEITERT template
- feat: convert TrashWidget and TrashScheduleWidget to DARSTELLUNG/ERWEITERT template
- feat: ImageWidget template compliance — titleAlign, title/icon row on image, WidgetIcon in placeholder
- feat: add showTitle/showIcon/titleAlign/WidgetIcon to CameraWidget (all layout states)
- feat: add showTitle/showIcon to all evcc layouts (battery, production, consumption, loadpoints, compact, no-connection)
- fix: calendar visFields removed from layout section; iconSize uncapped; no-sources shows title/icon
- fix: add title/icon to calendar minimal layout; cap header icon size to 14px
- feat: add showTitle/showIcon/titleAlign to calendar, evcc, camera, image widgets
- feat: convert WeatherWidget to unified DARSTELLUNG panel
- feat: convert ClockWidget to unified DARSTELLUNG panel
- feat: convert HttpRequestWidget to unified DARSTELLUNG panel
- feat: convert ButtonWidget to unified DARSTELLUNG panel
- feat: convert ChipsWidget to unified DARSTELLUNG panel
- feat: convert StateImageWidget to unified DARSTELLUNG panel
- feat: convert BinarySensorWidget to unified DARSTELLUNG panel
- feat: convert WindowContactWidget to unified DARSTELLUNG panel
- feat: convert FillWidget to unified DARSTELLUNG panel structure
- feat: convert AutoListWidget to new Darstellung/Erweitert panel structure
- fix: title position not applied in ListWidget
- feat: convert ListWidget to new Darstellung/Erweitert panel structure
- fix: show title/icon in EChartsPresetWidget no-preset placeholder
- feat: convert EChartsPresetWidget to new Darstellung/Erweitert panel structure
- feat: convert EChartWidget to new Darstellung/Erweitert panel structure
- feat: convert ClimateWidget to new Darstellung/Erweitert panel structure
- fix: title position not applied in ChartWidget
- feat: convert ChartWidget to new Darstellung/Erweitert panel structure
- feat: convert GaugeWidget to new Darstellung/Erweitert panel structure
- feat: convert ValueWidget to new Darstellung/Erweitert panel structure
- feat: convert ThermostatWidget to new Darstellung/Erweitert panel structure
- fix: define iconSize in SliderWidget
- fix: use iconSize for WidgetIcon in SliderWidget
- feat: convert SliderWidget to new Darstellung/Erweitert panel structure
- fix: use CompactIcon (custom icon) in all DimmerWidget layouts
- feat: convert DimmerWidget to new Darstellung/Erweitert panel structure
- fix: decouple icon visibility from title visibility in default layout
- feat: convert SwitchWidget to new Darstellung/Erweitert panel structure
- fix: apply titleAlign correctly in ShutterWidget default layout
- fix: respect showIcon toggle in ShutterWidget across all layouts
- fix: move Name above Widget-Typ, collapse Darstellung+Erweitert by default
- feat: add consolidated Darstellung panel for ShutterWidget
- feat: replace quickButtons with An/Aus toggle in DimmerWidget
- feat: add quickButtons (Schnellwahl) to DimmerWidget


### 0.6.20 (2026-05-08)
- fix: rename G-button label from 'G' to 'Global' across all widgets
- fix: invert shutter slider direction when showClosedPercent is enabled


### 0.6.19 (2026-05-08)
- fix: swap decimals input and G-button order — value first, button second
- feat: add global decimals setting with per-widget G-button override for list widgets
- feat: add global decimal places support to thermostat widget
- feat: add global decimal places support to climate widget


### 0.6.18 (2026-05-08)
- feat: add global decimal places support to value, chart and echart widgets
- feat: global default decimal places with per-widget override


### 0.6.17 (2026-05-08)
Release v0.6.17


### 0.6.16 (2026-05-07)
- feat: add colSpan to custom grid component cells for dimmer slider sizing


### 0.6.15 (2026-05-07)
- fix: create config.popup-config object in onReady


### 0.6.14 (2026-05-07)
- feat: replace curated icon grid with IconPickerModal in AdminEditor tab settings
- feat: replace curated icon grid in tab settings with full IconPickerModal


### 0.6.13 (2026-05-07)
- feat: allow URL datapoint in IframeWidget
- fix: show target temp when targetDatapoint is configured


### 0.6.12 (2026-05-07)
- fix: ClimateWidget icon, icon size, title align, layouts, humidity icon, last-change
- feat: add ClimateWidget (Raumklima)


### 0.6.11 (2026-05-07)
Release v0.6.11


### 0.6.10 (2026-05-06)
Release v0.6.10


### 0.6.9 (2026-05-06)
Release v0.6.9


### 0.6.8 (2026-05-06)
Release v0.6.8


### 0.6.7 (2026-05-06)
- fix: escape quotes in JSX text to satisfy no-unescaped-entities lint rule


### 0.6.6 (2026-05-06)
- feat: reset-to-type-default button in click action editor
- fix: type-default popup-view follows admin changes for unmodified widgets
- fix: auto-set type-default popup-view on first editor open
- feat: allow per-widget opt-out of type-level popup default


### 0.6.5 (2026-05-06)
- fix: chart in popup-view with {{dp}} now auto-detects and loads history


### 0.6.4 (2026-05-06)
- fix: center popup body content horizontally and vertically


### 0.6.3 (2026-05-06)
- feat: SliderWidget Bar-Stil (custom div-Slider, pointer events, barSize %)


### 0.6.2 (2026-05-06)
- fix: route HttpRequestWidget fetch through /proxy to bypass CORS


### 0.6.1 (2026-05-06)
- feat: AdminPopups 2-column layout (views left, type-defaults right)
- feat: remove width cap from Admin Widgets and Popups pages
- Revert "feat: popup uses full width, grid scales to fill container"
- feat: popup uses full width, grid scales to fill container


### 0.6.0 (2026-05-06)
- fix: add 24px padding buffer to popup naturalMinWidth
- feat: auto-size popup to content width
- refactor: replace legacy popup-* click action kinds with popup-view+builtin
- feat: allow direct editing of builtin views in super-admin mode
- feat: super-admin mode via secret URL key for builtin view protection
- feat: restore deleted standard popup views
- feat: auto-fill popup placeholder options + show all keys in toolbar
- fix: always show {{dp}} placeholder pill in view editor toolbar
- feat: show all used {{key}} placeholders in popup view editor toolbar
- feat: generalize popup placeholder substitution to all widget options
- feat: standard views read-only — copy-only workflow
- feat: popup phase 2 — {{dp}} substitution + predefined standard views
- refactor: remove popup groups, expose popup-view directly in click action
- feat: grid-based popup view editor with drag/resize positioning
- feat: popup views as standalone mini-dashboards (Phase 1)
- feat: implement 3-level popup configuration system


### 0.5.90 (2026-05-06)
- chore: delete unused AddWidgetDialog.tsx, fix stale comment in widgetRegistry
- fix: show hint for selected DP template (was only showing for further-widgets)
- feat: add hint texts to all DP_TEMPLATES, show hint for both template and further-widget selection
- feat: merge related templates in ManualWidgetDialog
- feat: move mediaplayer to further widgets (remove from DP_TEMPLATES)
- fix: dialog step1 wider (max-w-5xl), flex layout — only template grid scrolls
- fix: move further-widget hint outside scroll area to avoid layout shift and scrollbar
- fix: reserve space for "Erkannt als" line to prevent layout shift
- fix: remove inline hint from further-widgets to prevent scrollbar/layout shift
- fix: use visibility instead of minHeight for hint area to prevent scrollbar
- fix: reserve hint space in ManualWidgetDialog to prevent layout shift on double-click
- feat: double-click on widget in ManualWidgetDialog advances to step 2
- fix: widget naming in ManualWidgetDialog — template label as default title, full labels + hints for further widgets


### 0.5.88 (2026-05-06)
- feat: button widget — add custom layout support
- fix: apply iconSize in button compact layout
- fix: button widget — show title, hideable icon, no datapoint field
- feat: add button widget type (layout group, click-action only)


### 0.5.87 (2026-05-06)
- feat: httpRequest widget — remove card layout, add custom grid support
- fix: hide datapoint field for httpRequest widget
- feat: add HTTP-Aktion widget (GET/POST button)


### 0.5.86 (2026-05-05)
- feat: add FilePicker (image/*) for local ioBroker files in image config fields


### 0.5.85 (2026-05-05)
Release v0.5.85


### 0.5.84 (2026-05-05)
- fix: GroupWidget fitHeight bottom padding with non-default gridGap
- fix: GroupWidget fitHeight scrollbar with small gridGap


### 0.5.83 (2026-05-05)
Release v0.5.83


### 0.5.82 (2026-05-05)
- fix: PortalDropdown re-clamps on submenu expand to prevent viewport overflow


### 0.5.80 (2026-05-05)
Release v0.5.80


### 0.5.69 (2026-05-03)
- docs: README.md wiederherstellen mit Changelog seit v0.5.17
- feat: ShutterWidget — Option '% geschlossen anzeigen'
- feat: EvccWidget — optimistic UI für Modus und Ziel-SoC am Ladepunkt
- fix: WeatherWidget — entferne Hinweis "eigener Sensor"
- fix: MediaPlayer — Alexa Mute via Volume=0 (muteViaVolume)
- feat: MediaPlayer — Cover volle Höhe, Lautstärke-Redesign, Geräteerkennung mit echtem Namen
- feat: MediaPlayer-Widget — Icon, responsives Layout, mobile-vertikal, Chip-Reihenfolge
- feat: Klick-Aktion — neue Popups, Auto-Select, Schließen-Fix
- fix: Klick-Aktion — Tab-Navigation + Auto-Select für Dimmer/Thermostat
- feat: Widget-Klick-Aktion — Popups + Navigation per Widget konfigurierbar


### 0.5.67 (2026-05-03)
- (internal release)

### 0.5.66 (2026-05-03)
- (internal release)

### 0.5.65 (2026-05-03)
- (internal release)

### 0.5.64 (2026-05-03)
- feat: ShutterWidget — Option '% geschlossen anzeigen'

### 0.5.63 (2026-05-03)
- feat: EvccWidget — optimistic UI für Modus und Ziel-SoC am Ladepunkt
- fix: WeatherWidget — entferne Hinweis "eigener Sensor"

### 0.5.62 (2026-05-02)
- fix: MediaPlayer — Alexa Mute via Volume=0 (muteViaVolume)
- feat: MediaPlayer — Cover volle Höhe, Lautstärke-Redesign, Geräteerkennung mit echtem Namen
- feat: MediaPlayer-Widget — Icon, responsives Layout, mobile-vertikal, Chip-Reihenfolge

### 0.5.61 (2026-04-30)
- feat: Klick-Aktion — neue Popups, Auto-Select, Schließen-Fix
- fix: Klick-Aktion — Tab-Navigation + Auto-Select für Dimmer/Thermostat
- feat: Widget-Klick-Aktion — Popups + Navigation per Widget konfigurierbar

### 0.5.60 (2026-04-30)
- feat: Tab-Settings — disabled flag + DP-Bedingungen für Tab-Button-Stil

### 0.5.59 (2026-04-30)
- (internal release)

### 0.5.58 (2026-04-29)
- Fix: proxy /lib/ through Aura — ioBroker shared libraries (e.g. socket.io.js) now reachable

### 0.5.57 (2026-04-29)
- Fix: proxy /echarts/ through Aura — no direct web adapter access needed

### 0.5.56 (2026-04-29)
- Fix: add socketSecure option for web adapter HTTPS — internal proxy uses wss/https when enabled

### 0.5.55 (2026-04-29)
- Feat: internal socket.io proxy — no nginx config needed for WSS through reverse proxy

### 0.5.54 (2026-04-29)
- Feat: socketUrl config override for reverse-proxy setups; echarts widget uses iobroker.web base URL

### 0.5.53 (2026-04-29)
- Fix: HTTPS fallback log now correctly shows HTTP; clearer error when certificates are not configured

### 0.5.52 (2026-04-29)
- Feat: optional HTTPS for built-in HTTP server — certificates picked from ioBroker system.certificates

### 0.5.51 (2026-04-29)
- Fix: inject iobroker socket URL into index.html so frontend connects to correct port; add socketPort config (default 8082)

### 0.5.50 (2026-04-29)
- Fix: correct asset base path, MIME type fallback, legacy webInstance migration, proxy paths

### 0.5.49 (2026-04-29)
- Feat: replace webExtension with built-in HTTP server — no more web adapter restarts when aura stops; configurable port (default 8095)

### 0.5.48 (2026-04-29)
- Fix(config): remove invalid jsonConfig schema properties (allowNone, required) from web instance field

### 0.5.47 (2026-04-29)
- Fix: auto-migrate webInstance='*' to the specific web instance so the admin UI dropdown works correctly after upgrade

### 0.5.46 (2026-04-28)
- Feat(config): dedicated web instance selector — default is now empty (proxy disabled); select a specific web instance to avoid restarting VIS/Material on aura stop

### 0.5.45 (2026-04-28)
- (internal release)

### 0.5.44 (2026-04-28)
- (internal release)

### 0.5.43 (2026-04-28)
- (internal release)

### 0.5.42 (2026-04-28)
- (internal release)

### 0.5.41 (2026-04-28)
- Warn on adapter start if iobroker.web needs a restart to load the webExtension

### 0.5.40 (2026-04-28)
- (internal release)

### 0.5.39 (2026-04-28)
- (internal release)

### 0.5.38 (2026-04-28)
- (internal release)

### 0.5.37 (2026-04-28)
- (internal release)

### 0.5.36 (2026-04-28)
- Revert proxy script to v0.5.31 baseline: history.replaceState('/'), no <base href> injection, original segment rewriter

### 0.5.35 (2026-04-28)
- Revert proxy script to v0.5.32/v0.5.33 baseline: <base href='/'> injection, no history.replaceState, original rw() and WS guards

### 0.5.34 (2026-04-28)
- Fix(proxy): restore history.replaceState('/') so apps see pathname='/' not '/aura/proxy'; narrow rw() guard to /aura/proxy only; WS guard uses startsWith

### 0.5.33 (2026-04-28)
- Fix(proxy): restore missing 'let out' declaration dropped in v0.5.32 refactoring — caused 502 on all proxied pages

### 0.5.32 (2026-04-28)
- Fix(proxy): replace history.replaceState('/') with <base href='/'>  injection — replaceState in same-origin iframe fired popstate on parent Aura window causing widget flash

### 0.5.31 (2026-04-28)
- Fix(proxy): MutationObserver rewrites dynamically set src= attributes — Angular [src] bindings (thumbnails, images) now route through the proxy

### 0.5.30 (2026-04-28)
- Fix(proxy): click interceptor uses bubble phase + checks defaultPrevented — Angular RouterLink now handles internal SPA navigation without full-page reload flicker

### 0.5.29 (2026-04-28)
- Fix(proxy): always use history.replaceState('/') — using the actual target path confused Angular into building wrong API URLs like /dashboardapi/saved_views/

### 0.5.28 (2026-04-28)
- Fix(proxy): rewrite src= in script/style opening tags while leaving inline content untouched — v0.5.26 accidentally skipped script src attributes causing 404 for JS bundles

### 0.5.27 (2026-04-28)
- Fix(proxy): restore missing targetOrigin variable dropped during v0.5.26 refactoring — caused 502 on all proxied pages

### 0.5.26 (2026-04-28)
- Fix(proxy): protect <script>/<style> content from URL rewriting; rw() resolves absolute paths directly against target without location.href interference

### 0.5.25 (2026-04-28)
- Fix(proxy): add action attribute to forms without one and intercept form submit events — fixes login POST 404 when Django template has no form action

### 0.5.24 (2026-04-28)
- Fix(proxy): use actual target path for history.replaceState instead of '/' — prevents post-login redirect landing on web-adapter root

### 0.5.23 (2026-04-28)
- Fix(proxy): intercept location.href, location.assign/replace and dynamic link clicks so logout and other direct navigations are routed through the proxy

### 0.5.22 (2026-04-28)
- Fix(proxy): inject history.replaceState('/') so SPA routers see '/' instead of '/aura/proxy' — prevents Angular/Vue/React 404 on initial load

### 0.5.21 (2026-04-28)
- Fix(proxy): intercept XHR and fetch in proxied pages so API calls are routed through the proxy instead of failing with HTML 404

### 0.5.20 (2026-04-28)
- Fix(proxy): WebSocket proxy at /aura/proxyws + JS interceptor injected into HTML; fix CSRF 403 by overriding Referer and forwarding X-CSRFToken

### 0.5.19 (2026-04-28)
- Fix(proxy): rewrite HTML/CSS URLs so static assets and links are routed through the proxy instead of loading directly from the internal host

### 0.5.18 (2026-04-28)
- Fix(proxy): support POST and all HTTP methods — login forms now work through the iframe proxy

### 0.5.17 (2026-04-28)
- Fix: set webInstance=* in native so iobroker.web loads the proxy extension; auto-migrate existing instances on adapter start

### 0.5.16 (2026-04-28)
- Fix: add `lib/` to npm package files — `lib/webExtension.js` (iframe proxy) was missing from the published package

### 0.5.15 (2026-04-27)
- Fix(admin editor): tab switch no longer causes save bar to flash "unsaved changes" — synchronous localStorage flush prevents dirty-state from briefly becoming true
- Fix(admin editor): tab menu no longer flickers on tab switch — TabBar extracted as isolated memoized component with narrow Zustand selectors so AdminEditor does not re-render on tab switch
- Fix(admin editor): react-grid-layout CSS transitions disabled when not dragging via `:has(.react-draggable-dragging)` selector

### 0.5.14 (2026-04-27)
- Feat(iframe): server-side proxy to bypass X-Frame-Options — enable 'Use Proxy' toggle in iframe widget settings
- Fix(iframe-proxy): add proxy route to Vite dev server; remove `<base>` injection that caused `origin:null` CORS errors

### 0.5.13 (2026-04-27)
- Fix(tab bar): icons no longer flicker when switching views — placeholder reserves space and Icon component reference is stable

### 0.5.12 (2026-04-27)
- Fix(group): auto-expand on add/duplicate, auto-compact and shrink on delete, correct height after drag/resize
- Fix(group): verticalCompact on add/drop/duplicate so stored positions match RGL display
- Fix(group): clamp h to minH in tabLayout so resize and fit-height work correctly
- Fix(group): increase title bar height to 36px so edit buttons fit; update titleBarH formula
- Feat(group): fit-height button moved to toolbar next to drag handle

### 0.5.11 (2026-04-26)
- CI: npm beta tag now set automatically and correctly via GitHub releases; no manual dist-tag needed after beta releases

### 0.5.10 (2026-04-26)
- Fix: clipboard copy (widget ID, URL) now works over HTTP — fallback via `execCommand` for non-secure contexts
- Feat(switch): momentary/pulse mode — sends `true` then automatically `false` after configurable delay (ms)

### 0.5.9 (2026-04-25)
- Re-release of 0.5.8 to fix npm beta tag (CI workflow fix)

### 0.5.8 (2026-04-25)
- Feat(json-table): auto-height option — widget height adjusts automatically to row count
- Feat(theme): follow browser dark/light mode preference (admin → Theme → "Theme folgt Browser")
- Feat(datepicker): time-only mode (no date input, only time picker)
- Fix: group widget changes now correctly activate the save button

### 0.5.7 (2026-04-25)
- Fix(group): adding widgets inside a group now correctly marks config as dirty and enables the save button (groupDefsStore subscribe → markDirty)

### 0.5.6 (2026-04-25)
- Perf: dashboard now visible immediately after socket connect — no loading bar, no blocking on datapoint prefetch
- Perf: only active tab datapoints prefetched on start; other tabs prefetched silently in background; per-tab prefetch on first visit
- Feat: config split into separate ioBroker states (`config.theme`, `config.groups`, `config.app-config`, `config.global-settings`, `config.group-defs`); automatic one-time migration from old single-blob format
- Feat: `useConfigSync` subscribes to each state individually; polling interval increased to 30 s; `group-defs` excluded from polling

### 0.5.5 (2026-04-25)
- Feat(chart): configurable line/area color and average line color; icon now shown in both card and default layout (uses configured icon, falls back to TrendingUp); unit color defaults to black

### 0.5.4 (2026-04-25)
- Fix(save): admin save no longer freezes the UI for 8–10 s (backup JSON with aura-group-defs could reach 50 MB; now excluded from backup entries and discarded on migration)
- Fix(save): changes no longer revert after saving (useConfigSync blocked for 5 s after save; ioBroker state pushed on admin startup)
- Fix(chart): advanced chart (ECharts) no longer shows blank after loading (containerRef always mounted; loader/no-data shown as overlay)
- Fix(history): getHistory no longer errors with "unsupported mean iterator type" for string datapoints (aggregate set to "none" for non-numeric types)
- Fix(security): iframe sandbox no longer combines allow-scripts + allow-same-origin (sandbox escape vector removed)
- Fix(backup): backup state written with ack:true to avoid ioBroker read-only warning
- Fix(sync): localStorage quota errors no longer silently swallow rehydrate calls; quota-exceeded keys hydrated directly from ioBroker remote data
- Feat(widget): click widget ID in edit dialog to copy to clipboard

### 0.5.3 (2026-04-25)
- Perf: faster tab switches (async localStorage flush), faster DP value display after hard reload (expanded prefetch + skip redundant socket calls)
- Fix(chart): recharts and ECharts no longer warn about 0-size container on inactive tabs (bidirectional hasSize guard)
- Fix(admin): grid no longer repositions widgets when the admin window is opened in a small window
- Feat(admin): collapsible sidebar for narrow windows (<768px) — hamburger button opens it as an overlay

### 0.5.2 (2026-04-24)
- Fix(group): copying GROUP widgets no longer causes QuotaExceededError or stuck save button (children moved to separate `aura-group-defs` store)
- Fix(dashboard): switching layouts no longer spuriously activates the save button
- Fix(sync): prevent data loss when ioBroker has config data but localStorage is empty on first connect
- Feat(backup): automatic rolling backup to `aura.0.config.dashboard_backup` after every save; configurable count (1–20) and restore UI in admin settings

### 0.5.1 (2026-04-24)
- Fix(camera): remove on-mount reset of wake-up DP to prevent spurious stream starts via go2rtc RTSP reconnects

### 0.5.0 (2026-04-23)
- Fix: missing `statusBadges` field in `useStatusFields` hook caused TypeScript build errors in CI

### 0.4.99 (2026-04-23)
- Fix: disable new eslint-plugin-react-hooks v7.x rules (set-state-in-effect, static-components, refs, purity, use-memo) that caused 88 CI lint errors after dependency bump from v4.6.2

### 0.4.98 (2026-04-23)
- Fix(lint): unescaped quotes in JSX label strings replaced with HTML entities

### 0.4.97 (2026-04-23)
- Feat(windowcontact): flexible state value mapping with presets (HmIP, Boolean, 0/7, String) and custom mode; optional lock DP badge; configurable battery (boolean/percent) and reach (unreachable/available) interpretation
- Feat(customGrid): widget icon selectable as component in custom grid for all widget types (switch, dimmer, thermostat, shutter)
- Feat(customGrid): battery and reach available as text field or icon badge in custom grid for all StatusBadges widgets
- Feat(customGrid): combined `status-badges` component showing all configured badges (battery + reach + lock) in a single cell
- Feat(value-widget): full custom grid support with icon, battery, reach, unit fields and status-badges component
- Fix(widgetFrame): icon size slider no longer triggers global widget re-render (flickering in other widgets)

### 0.4.96 (2026-04-23)
- Feat(autoList): adapter as discovery filter in dynamic list (first in filter order)
- Feat(list): adapter multi-select filter for static and dynamic lists
- Feat(list): sorting by name or value (ascending/descending) for static and dynamic lists

### 0.4.95 (2026-04-23)
- Feat(windowcontact): per-state icon/image configuration – icon picker or base64 image, custom color and label for each state (closed/tilted/open)

### 0.4.94 (2026-04-23)
- Feat(calendar): configurable icon for important appointments via icon picker; new toggle to hide the icon entirely

### 0.4.93 (2026-04-23)
- Fix: theme toggle now clears per-layout theme override so all themes (light, lovelace, etc.) apply correctly on devices with layout-specific overrides

### 0.4.92 (2026-04-23)
- Fix: theme toggle now correctly switches per-layout theme when a layout has its own theme override set

### 0.4.91 (2026-04-23)
- Feat: new HTML widget – display HTML from a datapoint or static input; optional title/icon header
- Feat(autolist): new "Count" layout showing entry count as large centered number
- Fix: switch widget icon now displayed in all layouts (default, compact, minimal, card)

### 0.4.90 (2026-04-22)
- Fix: consistent icon size (16px) and gap-2 spacing in all compact widget layouts
- Fix: removed bold title font in switch compact layout
- Fix: symmetric inner padding in group widgets (scrollbar-gutter: stable both-edges)

### 0.4.89 (2026-04-22)
- Feat(tabBar): navigation menu position (left/center/right) configurable in layout settings

### 0.4.88 (2026-04-22)
- Feat: HTML boot screen visible immediately on page load (before JS bundle parses)
- Feat: loading spinner with real-time datapoint counter using direct DOM updates (bypasses React batching)

### 0.4.87 (2026-04-22)
- Perf: parallel state prefetch on connect – all datapoints loaded before first widget render
- Perf: widgets initialize from cache synchronously (no null-flash / flicker)
- Feat: dashboard fades in smoothly after data is ready
- Fix: dashboard height regression after prefetch wrapper div missing flex-col

### 0.4.86 (2026-04-22)
- Feat(echartsPreset): title overlay on iframe widget, hideable via "Hide Name" toggle
- Feat(echartsPreset): fullscreen portal button (Escape / click-outside to close)
- Fix(echartsPreset): last-change timestamp overlay now visible above iframe (z-index fix)
- Feat(echart): dataMin / dataMax auto option for Y-axis min/max

### 0.4.85 (2026-04-22)
- Feat: tab bar design settings per layout – height, background color, active/inactive tab colors, indicator style (underline/filled/pills), font size
- Feat: tab bar items (clock, datapoint, static text) with left/center/right positioning in the tab bar
- Feat: layouts page uses full width (removed max-width constraint)

### 0.4.84 (2026-04-22)
- Feat(tab-wizard): added intro step explaining the wizard flow

### 0.4.83 (2026-04-22)
- Feat(tab-wizard): starts directly in datapoint picker; new review step with per-DP widget type selection, editable names, DP removal, and layout choice
- Fix(tab-wizard): type filter dependency missing in useMemo caused filter to not react
- Fix(layout-generator): last widget in a row no longer stretched to fill remaining columns

### 0.4.82 (2026-04-22)
- Fix: per-layout theme and CSS variables now correctly applied in frontend (global theme no longer overwrites per-layout settings)

### 0.4.81 (2026-04-22)
- Feat(custom-layout): image cells – insert any image via URL or base64 data URI; choose between contain, cover and fill fitting
- Feat(custom-layout): text-overflow option – allow cell text to spill into adjacent empty cells instead of being clipped

### 0.4.80 (2026-04-21)
- Feat(wizard): reworked tab wizard with 3-step flow (theme selection → datapoint picker → layout)
- Feat(wizard): improved widget-type detection for shutters, window contacts and binary sensors
- Feat(wizard): battery status theme pre-fills color thresholds (green/yellow/red)
- Feat(widgets): color thresholds (colorThresholds) option for value, dimmer, shutter and thermostat widgets
- Fix(panel): color thresholds editor moved to bottom of property panel

### 0.4.79 (2026-04-21)
- Fix(camera): stream-timeout default changed to 60 s; fixed config saving 0 as undefined (could not be disabled)

### 0.4.78 (2026-04-21)
- Feat(list): icon picker per datapoint in static list widget
- Fix(list): removed non-functional delete (X) buttons from static and dynamic list widget views
- Fix(calendar): auto-retry every 45 s when widget is in error state (e.g. after adapter restart)

### 0.4.77 (2026-04-21)
- Fix: preserve activeTabId during ioBroker config sync to prevent tab revert
- Fix: tab switching no longer marks config as dirty
- Fix: DP name filter applied per-part of 'parent › state' names and to widget title in picker
- Fix(list): auto-sync only adds relevant DPs by default; filter hides unloaded entries

### 0.4.73 (2026-04-21)
- Fix: hideTitle, showLastChange overlay and icon now work in static & dynamic list widgets
- Fix: DP names in list widgets now show parentName › stateName (channel/device resolution)
- Fix: config panel entry rows show resolved names instead of STATE/LEVEL
- Fix: remove status dot from static list default layout

### 0.4.70 (2026-04-21)
- Fix: lint errors in JSX labels and hook dependencies from previous release

### 0.4.69 (2026-04-21)
- DatapointPicker: only shows states from enabled adapter instances (common.enabled === true)
- EChart widget: toggle to hide Y-axis scale, tick marks, and grid lines
- EChart tooltip: shows units next to values and rounds to 2 decimal places

### 0.4.68 (2026-04-21)
- Camera widget: new layouts – Minimal (stream only), Standard (stream + configurable info rows), Custom Grid (5 predefined templates with configurable slots)
- Camera widget: stream health detection – countdown timer with color-coded badge, consecutive error counting; shows "Stream ended" / "Connection lost" overlay with re-activate button
- Camera widget: configurable stream timeout (seconds); info slots and widget name always visible regardless of stream state

### 0.4.67 (2026-04-21)
- Camera widget: auto-detect stream type – HTML pages (e.g. go2rtc `stream.html`) render in an iframe, RTSP URLs show a helpful hint
- Camera widget: optional wake-up datapoint for battery-powered cameras (e.g. Eufy) with three trigger modes (auto, on-view, on-click)

### 0.4.66 (2026-04-20)
- Admin PIN is now stored in ioBroker datapoint `admin.pinHash` – a PIN set on one device or URL applies to all browsers and clients

### 0.4.65 (2026-04-20)
- DatapointPicker: name resolution now includes parent channel/device names for non-Homematic adapters (Zigbee, Shelly, Hue, etc.) – shows e.g. "Living Room Lamp › on" instead of just "on"

### 0.4.64 (2026-04-19)
- Fix: iframe 'Keep Alive (no reload)' now correctly preserves state across tab switches – fill-tab views no longer cause iframes to reload

### 0.4.63 (2026-04-19)
- Admin Settings: multi-column layout reduces scrolling – Language/Editor/PIN/Backup in one row, Frontend/Grid/Guidelines in another, Clients/Expert side by side

### 0.4.62 (2026-04-19)
- Per-layout settings: Guidelines, Grid & Mobile, Theme & CSS are now configurable independently per layout
- Different layouts (e.g. different tablets) can have different grid sizes, mobile breakpoints, themes, custom CSS and guidelines
- Admin Settings: layout context switcher on Grid and Guidelines cards
- Admin Theme: layout context switcher on Theme Preset, CSS Variables, Typography & Spacing, and Custom CSS sections
- Overridden values show "Layout" badge with "↩ Global" reset button

### 0.4.61 (2026-04-19)
- Icon picker: switched to Iconify with 9,400+ icons (Lucide + MDI) bundled for offline use
- New MDI icon categories: buildings/rooms, energy/heating, smart home, security, sensors, vehicles, nature/garden
- Garage icons available: mdi:garage, mdi:garage-open, mdi:garage-variant and more
- Icon picker dialog height increased; full backwards compatibility for existing icon configs

### 0.4.60 (2026-04-19)
- Custom layout: widget-field dropdown for all widget types (Shutter, Dimmer, Gauge, Chart, Window/Door Contact, Binary Sensor, EVCC, Image, Weather)
- DatapointPicker: name shown first, technical DP ID on second line, type badge in color; search pre-filled with current DP for quick navigation
- "Add widget" dialog: category filter tabs and "Recently used" chips for fast access to frequently used templates

### 0.4.59 (2026-04-19)
- Custom layout for all widgets: free 3×3 grid, each cell configurable with title/value/unit/free text/datapoint/widget-field
- Per-cell settings: prefix/suffix for values, font size, bold/italic, color, horizontal and vertical alignment, unique CSS class per cell
- Calendar and Clock expose widget-specific fields (summary, date, time, calname, location, count / time, date, custom) for use in custom grid cells
- Custom grid editor now always positioned at the bottom of widget-specific settings
- Stronger visual separation between general and widget-specific settings in the edit panel (accent left border, increased tint)

### 0.4.58 (2026-04-19)
- New StateImage widget: boolean DP displays configurable icon/color or base64 image per state (true/false), 4 layouts, adjustable icon size
- Calendar: per-widget font scale slider (50–300%), important event highlighting by keyword/PRIORITY/description, card title uses accent color
- ValueWidget minimal layout: value and unit are now inline on the same baseline

### 0.4.57 (2026-04-18)
- Fix: status badge shows correct WiFi icon – Wifi (green) when reachable, WifiOff (red) when unreachable

### 0.4.56 (2026-04-18)
- Widget editor: "Visible fields" toggles (title, label, value, unit, slider, controls, …) for all widget types and layouts
- Layout selector and field toggles combined into one collapsible section in the edit panel

### 0.4.55 (2026-04-18)
- Tab-Wizard: only relevant DPs pre-selected by default; "Relevante / Alle / Keine" shortcut buttons; non-relevant DPs dimmed but selectable
- Tab-Wizard layout: compact variant now correctly sets `layout: 'compact'` on all widgets (was incorrectly `'card'`)

### 0.4.54 (2026-04-18)
- Static List widget replaces the group-based list: DPs added directly via object browser with multi-select, relevance filtering (INSTALL_TEST etc. dimmed/deselected by default), value filter (show only active/inactive entries)
- DatapointPicker enhanced with multi-select mode: checkboxes, "Relevante / Alle / Keine" shortcuts, confirm footer

### 0.4.53 (2026-04-18)
- New widgets: Window/Door Contact, Binary Sensor (motion, smoke detector, …)
- Status badges (battery low, unreachable) overlay for all widgets, toggleable
- Dynamic List: smart DP filtering by role (irrelevant DPs like INSTALL_TEST moved to collapsible section), unit carry-over from ioBroker, value filter (show only active / inactive entries in frontend)

### 0.4.52 (2026-04-18)
- Editor: 'Add widget manually' dialog – standard widget types displayed in 2-column grid per category; special widgets remain in collapsible 'Further Widgets' section below

### 0.4.51 (2026-04-18)
- Fix: Dynamic List filter results now match the Datapoint Picker – parent-path traversal for room/function membership; exact role matching

### 0.4.50 (2026-04-18)
- Fix: Gauge color zones now always cover the full arc; last zone always extends to max; midpoint calculation for new zones corrected

### 0.4.49 (2026-04-18)
- Editor: guidelines overlay – toggle red dashed lines at configurable width/height to plan layouts for a target device; optional display in frontend; settings in Admin → Settings

### 0.4.48 (2026-04-17)
- Fix: tabs no longer go blank after switching away from a fillTab iFrame widget (callback ref prevents ResizeObserver from firing with width=0 on detached element)

### 0.4.47 (2026-04-17)
- Fix: iFrame fullscreen overlay now uses position:fixed (covers full viewport) and is always cleared when switching tabs

### 0.4.46 (2026-04-17)
- Fix: iFrame fullscreen overlay now reliably closes when switching tabs (synchronous render-time check replaces async effect)

### 0.4.45 (2026-04-17)
- Fix: iFrame fullscreen overlay now closes automatically when switching tabs

### 0.4.44 (2026-04-17)
- Settings: delete connected devices via adapter relay state (recursive object deletion)
- Client registration now handled by adapter backend – fixes "State has no existing object" warnings
- CSS: per-tab body class `aura-{slug}` (e.g. `aura-startseite`) and `aura-titel` on header title
- Dimmer compact layout: icon + name + value row above full-width slider

### 0.4.43 (2026-04-17)
- Icon picker: all 1900+ Lucide icons with category tabs and search, lazy-loaded in a separate chunk; JSON Table: layout picker removed

### 0.4.42 (2026-04-17)
- JSON Table widget: column editor – reorder, rename, hide, HTML per column; search bar toggle; header text color; load columns from live datapoint value

### 0.4.41 (2026-04-17)
- New widget: JSON Table – display JSON datapoints as scrollable tables with configurable header/label-column colors
- Dynamic List (formerly Auto List): improved search UX, filter change replaces entries, fixed dropdown close on outside click
- iFrame: load-failure hint after 8s timeout with cert/CSP troubleshooting and direct-open button
- Gauge: object browser button for pointer 2 and 3 datapoints
- EChart (advanced chart): wizard datapoint auto-populated as first series on creation
- Fill widget: remove layout picker; improved horizontal fill-level indicator visibility
- Widget dialog: preserve explicitly selected widget type during datapoint auto-detection
- WidgetFrame: graceful fallback for unknown widget types (prevents full app crash on stale cache)
- Fix: layout chip labels showing raw i18n key in wizard step 2

### 0.4.40 (2026-04-17)
- Frontend: auto-reload when `aura.0.config.dashboard` is changed externally (ioBroker admin / script)

### 0.4.39 (2026-04-17)
- Theme & CSS: toggle to enable/disable custom CSS without deleting it

### 0.4.38 (2026-04-17)
- Widget IDs no longer include the widget type (`w-TIMESTAMP` instead of `gauge-TIMESTAMP`) – IDs stay stable when the type is changed

### 0.4.37 (2026-04-16)
- Frontend: fix active tab resetting to first tab on F5 or after ioBroker config reload

### 0.4.36 (2026-04-16)
- Datapoint auto-fill: fix title and unit lookup in manual widget dialog (was patching dead code); fix `y:null` ReactGridLayout warning (`Infinity` → `9999`); fix chart `ResponsiveContainer` 0×0 warning

### 0.4.35 (2026-04-16)
- Datapoint auto-fill: title and unit now also resolved when typing the ID directly in the edit dialog or using the manual wizard

### 0.4.34 (2026-04-16)
- Datapoint picker: auto-fill widget title from `common.name` when the title field is still empty

### 0.4.33 (2026-04-16)
- Header datapoint and value widget: optional HTML template with `{dp}` placeholder for rich value formatting (e.g. `<b style="color:var(--accent)">{dp}</b> °C`)

### 0.4.32 (2026-04-16)
- Calendar: automatic retry on fetch timeout (5 s delay, 1 retry); final errors logged to ioBroker via `aura.0.calendar.clientError`

### 0.4.31 (2026-04-16)
- iFrame widget: "Fill tab" option – widget fills entire tab area permanently; toggle is disabled when other widgets are present in the tab (with hint)

### 0.4.30 (2026-04-16)
- iFrame widget: fullscreen button (hover to reveal); click fills viewport, Esc or X to close

### 0.4.29 (2026-04-16)
- Frontend: optional admin link button in header, configurable in Settings

### 0.4.28 (2026-04-16)
- Editor: widget ID moved to dialog title bar in parentheses next to "Widget Bearbeiten"; edit dialog is draggable (no backdrop)

### 0.4.27 (2026-04-16)
- Chart widget: runtime time range selector buttons (1h/6h/24h/7d/30d) in frontend
- Gauge widget: min/max labels moved outside the arc, centred at endpoints
- CSS: add `aura-header`, `aura-tabs`, `aura-page-{slug}` classes and `data-tab` attribute
- Editor: show widget ID at the bottom of the edit dialog
- Settings: merge "This Device" and "All Clients" into one card with inline rename; fix name not written to ioBroker DP; create intermediate `.info`/`.navigate` channels

### 0.4.26 (2026-04-15)
- Chart widget: configurable custom time range; remove stray colon from tooltip
- Semantic CSS classes: `aura-page`, `aura-tab-{slug}`, `aura-widget-{id}`, `aura-widget-type-{type}`; clock CSS classes
- Theme & CSS: configurable grid gap and widget inner padding sliders
- CSS-variable reset button always visible, disabled when nothing is overridden
- `aura.0.config.dashboard`: remove double-stringify; store as pretty-printed JSON object
- Configurable horizontal snap width (`gridSnapX`) in Settings for finer widget positioning
- Connection indicator: green dot for 2 s on startup; red dot on disconnect (even when badge is hidden)

### 0.4.25 (2026-04-15)
- Fix: trailing comma in `io-package.json` news section caused CI JSON parse error

### 0.4.24 (2026-04-15)
- Clock widget custom format: add `EE` token for abbreviated weekday (e.g. `Mo`)

### 0.4.23 (2026-04-14)
- Fix W5039: remove `admin/words.js` – jsonConfig adapters use `admin/i18n/` directly

### 0.4.22 (2026-04-14)
- Fix W5022: generate `admin/words.js` from i18n JSON files; fix empty Russian translation file

### 0.4.21 (2026-04-14)
- Fix W5022: add `translate` script to `package.json` for i18n support

### 0.4.20 (2026-04-14)
- Fix W5022: migrate jsonConfig to i18n – use translation keys and `admin/i18n/` for all 11 languages

### 0.4.19 (2026-04-14)
- Fix W3009: concurrency group set to `${{ github.ref }}`
- Fix W3019: switch deploy to npm trusted publishing (remove npm-token)
- Fix W4042: extend jsonConfig `fileMatch` in `.vscode/settings.json`

### 0.4.18 (2026-04-14)
- Fix W4042: extend jsonConfig `fileMatch` in `.vscode/settings.json` to include all jsonConfig variants

### 0.4.17 (2026-04-14)
- Move `main.js` to root directory per ioBroker adapter convention

### 0.4.16 (2026-04-14)
- Adapter checker fixes: use `testing-action-deploy@v1`, ESLint flat config, `admin/i18n/`, jsonConfig schema URL, dependabot cooldown

### 0.4.15 (2026-04-14)
- Fix E2004: remove 0.4.13 from news (never published to npm due to CI failure)

### 0.4.14 (2026-04-14)
- Fix invalid JSON in io-package.json (trailing comma after last news entry)

### 0.4.13 (2026-04-14)
- Stable release: adapter checker compliance, src-vis convention, release script, i18n in npm package

### 0.4.12 (2026-04-14)
- Fix E2005: restore 0.3.98 (npm latest) in news section

### 0.4.11 (2026-04-14)
- Add `release` script to `package.json` for iobroker.dev release management

### 0.4.10 (2026-04-14)
- Add `src-vis/i18n/` to `package.json` files to include translations in npm package

### 0.4.9 (2026-04-14)
- Rename frontend source directory from `src/` to `src-vis/` per ioBroker adapter convention

### 0.4.8 (2026-04-14)
- Fix adapter checker: correct news section, fix vscode schema URL, add .releaseconfig.json

### 0.4.7 (2026-04-14)
- Fix invalid JSON in io-package.json (trailing comma after last news entry)

### 0.4.6 (2026-04-14)
- Fix npm ci: add .npmrc with legacy-peer-deps=true to resolve peer dependency conflicts in CI

### 0.4.5 (2026-04-14)
- Beta release for testing: adapter checker compliance and CI pipeline fully green

### 0.4.4 (2026-04-14)
- Fix CI: upgrade @typescript-eslint to v8, add no-require-imports override for CommonJS, fix ternary-as-statement lint errors

### 0.4.3 (2026-04-14)
- Adapter checker compliance: i18n for jsonConfig, node: prefix for built-ins, workflow deploy job, dependabot, react-resizable dependency

### 0.4.2 (2026-04-14)
- Adapter checker fixes: add globalDependencies admin >=7.6.17, remove unpublished news entry, add jsonConfig size attributes, add workflow tag trigger

### 0.4.1 (2026-04-14)
- Fix CI pipeline: add test:package and test:integration scripts, resolve all ESLint warnings

### 0.4.0 (2026-04-14)
- Adapter checker compliance: node >=20, trim news to 7 entries, remove allowInit, use ioBroker standard workflow actions, fix package dependencies

### 0.3.99 (2026-04-14)
- Add configurable default tab per layout – set which tab opens when the dashboard URL has no tab slug

### 0.3.98 (2026-04-14)
- Replace hardcoded personal domain in settings placeholder with generic example

### 0.3.97 (2026-04-14)
- Fix overview tile titles: use localLinks `name` field (ioBroker uses name, not key, as the visible title)

### 0.3.96 (2026-04-14)
- Fix overview tile names: use full replacement instead of deep-merge so old keys ("Dashboard"/"Admin") are removed

### 0.3.95 (2026-04-14)
- Fix restart loop when custom URL is set (only write localLinks when value actually changed)

Older entries: see [CHANGELOG_OLD.md](CHANGELOG_OLD.md)

---

## License

MIT License

Copyright (c) 2026 Hermann Dering <aura@dering-online.de>

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.



















































































































