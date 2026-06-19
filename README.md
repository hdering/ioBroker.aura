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

### 0.9.286 (2026-06-19)
- fix(panels): track hover and focus separately so open dropdowns don't slide away


### 0.9.285 (2026-06-19)
- fix(panels): let child clicks through; capture pointer only on real swipe


### 0.9.284 (2026-06-19)
- fix(panels): pause autoplay while pointer over or focus inside panel


### 0.9.283 (2026-06-19)
- feat(popup): default importer datapoint to {{dp}}
- feat(popup): import widgets in the popup-view editor
- @ feat(editor): copy/move dashboard widget into a popup view


### 0.9.282 (2026-06-19)
- feat(enum): per-entry render mode (text/image/html/icon) with pickers
- feat(enum): support HTML in Auswahlfeld entry labels


### 0.9.281 (2026-06-19)
- feat(editor): surface save-blocked hint in the save bar


### 0.9.280 (2026-06-19)
- style(list): use template literal for invalid-entry marker (prefer-template)
- fix(list): stop id-less entries from crashing list widgets and config


### 0.9.279 (2026-06-19)
- style(prettier): auto-format code files
- chore: stop tracking .vite-dev.log dev artifact
- feat(admin-widgets): collapse all type sections by default + clickable summary chips


### 0.9.278 (2026-06-19)
- perf(panels): keep slide track on its own GPU layer to reduce autoplay jank


### 0.9.277 (2026-06-19)
- fix(theme): rename config.themeMode.admin → adminUi (hidden by Admin tree)


### 0.9.276 (2026-06-19)
- fix(persist): acknowledge config-storage DP writes (ack=true)


### 0.9.275 (2026-06-19)
- fix(theme): upsert themeMode sub-states so admin DP actually persists


### 0.9.274 (2026-06-17)
- fix(widgets): keep last-change timestamp inside narrow widgets


### 0.9.273 (2026-06-17)
- fix(popup): keep long popup-view fully scrollable and stop scrollbar overlap


### 0.9.272 (2026-06-17)
Release v0.9.272


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


## License

MIT License

Copyright (c) 2026 Hermann Dering <aura@dering-online.de>

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.



































































































































































































































































































































