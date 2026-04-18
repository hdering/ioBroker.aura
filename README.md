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
