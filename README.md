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

Install dependencies:
```bash
npm install
```

Start dev server (connects to ioBroker via proxy):
```bash
npm run dev
```

Production build:
```bash
npm run build:adapter
```

---

## Changelog

_Older releases: see [CHANGELOG_OLD.md](CHANGELOG_OLD.md)._

### 0.9.248 (2026-06-15)
- @ feat(theme): element-specific CSS variables for widgets (#313)


### 0.9.247 (2026-06-15)
- fix(lint): auto-fix mixed typographic quotes
- feat(backup): generic list-item change detection across all widget types
- feat(backup): record per-entity change details in backup list


### 0.9.246 (2026-06-15)
- fix(clients): only register client when new or renamed


### 0.9.245 (2026-06-15)
- fix(theme): readable preset names + explain what a preset changes (#307)
- feat(layouts): export/import complete layouts with all tabs, widgets and groups


### 0.9.244 (2026-06-15)
- chore: ignore examples/ directory
- chore: remove examples/testdata-generator.js from repo
- fix(editor): hide 'card' layout option for header widget in new-widget dialog


### 0.9.243 (2026-06-15)
- style(prettier): auto-format code files
- fix(universal-widget): apply preselected state-text colors initially


### 0.9.242 (2026-06-15)
- feat(popup): sample chart preview + visible history instance in editor


### 0.9.241 (2026-06-14)
- fix(popup): inherit history adapter instance into popup charts
- Merge branch 'fix/309-open-in-dashboard-editor'
- docs(popup): add concrete placeholder examples in popup-view editor


### 0.9.240 (2026-06-13)
- feat(widgets): add "open in dashboard editor" button to widget rows (#309)


### 0.9.239 (2026-06-13)
- fix(popup): resolve {{placeholders}} in nested option arrays (#314)


### 0.9.238 (2026-06-13)
- style(prettier): auto-format code files


### 0.9.237 (2026-06-12)
- feat(datapoint): JSON path support on datapoint refs (id#path)
- feat(group): show loading spinner while group children hydrate


### 0.9.236 (2026-06-12)
- revert(tabbar): remove tab-bar settings preview
- feat(tabbar): live preview in tab-bar settings for the edited scope


### 0.9.235 (2026-06-12)
- fix(tabbar): guard undefined global tabBar for pre-existing configs
- feat(tabbar): make tab-bar settings global with per-layout override
- fix(lint): wrap shutter help text in JS string to avoid JSX typographic quotes


### 0.9.234 (2026-06-12)
- fix(lint): auto-fix mixed typographic quotes
- fix(group-action): resolve target checklist labels like the list does
- refactor(auto-list): compact general per-entry settings to match static list
- refactor(static-list): compact general per-entry settings layout
- refactor(static-list): move font size up to general settings (paired with decimals)
- fix(list-widgets): hide switch-only styling for Auto display type too
- feat(list-widgets): hide switch-only entry styling for non-switch display types
- refactor(static-list): move per-entry icon picker up next to label/unit
- feat(list-widgets): support HomeMatic LEVEL position control for shutter entries


### 0.9.233 (2026-06-12)
- style(list-widgets): use template literal in shutter DP scope check
- style(prettier): auto-format code files
- feat(list-widgets): add shutter DP auto-detection to entry controls
- feat(admin-widgets): sort widget type listing alphabetically by label


### 0.9.232 (2026-06-12)
- style(prettier): auto-format code files
- refactor(backup): drop legacy dashboard_backup state and one-time migration


### 0.9.231 (2026-06-12)
- feat(popup): derive {{parent}}/{{name}} placeholders and add optional popup DP override
- chore(deps): ignore Vite major version bumps in Dependabot
- chore(deps): ignore React major version bumps in Dependabot
- chore(deps): bump actions/checkout from 4 to 6 (#222)
- chore(deps): bump actions/deploy-pages from 4 to 5 (#223)
- chore(deps): bump actions/configure-pages from 5 to 6 (#224)
- chore(deps): bump actions/upload-pages-artifact from 3 to 5 (#225)
- chore(deps): bump dependabot/fetch-metadata from 2 to 3 (#262)


### 0.9.230 (2026-06-11)
- feat(admin): add tab bar icon size control


### 0.9.229 (2026-06-11)
- fix(ci): drop broken npm dist-tag fixup; add missing 0.9.228 changelog
- fix(ci): skip npm publish when version already published (E403 guard)


## License

MIT License

Copyright (c) 2026 Hermann Dering <aura@dering-online.de>

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.





























































































































































































































































































