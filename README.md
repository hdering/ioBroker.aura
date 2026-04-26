# ioBroker.aura

**Aura** is a modern visualization dashboard for [ioBroker](https://www.iobroker.net/).

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
