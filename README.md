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

### 0.9.271 (2026-06-17)
- feat(widgets): derive panels/group add-widget pickers from registry


### 0.9.270 (2026-06-17)
- docs(widgets): expand every widget page with layout & option details


### 0.9.269 (2026-06-17)
- docs(widgets): document all remaining widgets with screenshots


### 0.9.268 (2026-06-17)
- fix: apply value transform to numeric string states
- docs: click-to-zoom lightbox + modest inline image sizing
- docs(admin): document the full admin area with screenshots
- style: wrap configLoader persistManager import (prettier)
- feat(docs): add switch custom-layout screenshot
- feat(docs): screenshot harness + real switch widget screenshots


### 0.9.267 (2026-06-17)
- fix(objects): use role 'text' for navigate.target selector


### 0.9.266 (2026-06-17)
- fix(backup): gzip auto-backups to stay under socket.io frame limit


### 0.9.265 (2026-06-17)
- style(prettier): auto-format code files
- feat(binarysensor): add active/inactive label color pickers, fix icon toggle wobble


### 0.9.264 (2026-06-17)
- style(prettier): auto-format code files
- feat(group): add autoShrink option that collapses group height when child widgets are condition-hidden


### 0.9.263 (2026-06-17)
- feat(panels): block save when group-defs unhydrated, rename slides→panels, move to Spezial
- fix(panels): align defId seeding to GroupWidget + loading state
- feat(panels): re-add slide-of-widgets carousel as new 'panels' widget


### 0.9.262 (2026-06-16)
- fix(navigate): create per-client navigate.target for existing clients
- fix(popup-editor): copy widgets within the popup, drop cross-tab move


### 0.9.261 (2026-06-16)
- feat(navigate): add view/tab selector datapoint


### 0.9.260 (2026-06-16)
- fix(value-transform): persist selected preset so presets sharing a factor stay distinct


### 0.9.259 (2026-06-16)
- fix(image-widget): write selected datapoint to imageDatapoint option


### 0.9.258 (2026-06-16)
- feat(adapter-status): add "Deaktiviert" filter for disabled instances


### 0.9.257 (2026-06-16)
- feat(popup): auto-detect history adapter for charts opened from value widgets


### 0.9.256 (2026-06-16)
- feat(widgets): display-only value transform (factor/offset) with preset dropdown
- chore(deps-dev): bump lucide-react from 1.17.0 to 1.20.0 (#332)


### 0.9.255 (2026-06-16)
- style(prettier): auto-format code files
- feat(widget-editor): card framing with amber tint for Darstellung/Erweitert sections


### 0.9.254 (2026-06-16)
- chore(frontend): silence benign recharts zero-size container warning


### 0.9.253 (2026-06-16)
- refactor(echart): single shared time range, drop per-series ranges
- feat(echart-config): auto-select sole history adapter per series
- fix(echart): fit Y-axis to data range (scale) to remove empty space
- feat(echart): current value, frontend range selector, grid-line toggle


### 0.9.252 (2026-06-16)
- fix(useIoBroker): allow spaces in state IDs


## License

MIT License

Copyright (c) 2026 Hermann Dering <aura@dering-online.de>

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.




















































































































































































































































































































