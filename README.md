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

### 0.9.173 (2026-05-30)
- fix(popup): register ChipsWidget in widgetMap
- feat(chips): raise chipSize max from 240 to 500 px
- feat(evcc): add showLoadpoints toggle to hide loadpoint cards


### 0.9.172 (2026-05-30)
- feat(echart): per-series custom history range


### 0.9.171 (2026-05-30)
- feat(static-list): allow changing datapoint of an existing entry


### 0.9.170 (2026-05-30)
- fix(weather): retry online fetch every 30s while no data


### 0.9.169 (2026-05-30)
- fix(alarm): hide datapoint-id field in widget edit panel


### 0.9.168 (2026-05-29)
- fix(lint): auto-fix mixed typographic quotes
- feat(alarm): new widget for ioBroker.alarm adapter


### 0.9.167 (2026-05-29)
- feat(evcc): responsive auto-scale + per-section size sliders
- feat(chips): raise chipSize slider max from 96 to 240 px
- feat(chips): replace sm/md/lg dropdown with px slider (16-96)


### 0.9.166 (2026-05-28)
- chore(theme): add verbose [themeMode] init logging to diagnose missing admin DP


### 0.9.165 (2026-05-28)
- fix(theme): always create themeMode admin/frontend DPs even when migration throws


### 0.9.164 (2026-05-28)
- fix(theme): make themeMode.frontend DP override sticky


### 0.9.163 (2026-05-28)
- refactor(theme): split themeMode into separate frontend & admin DPs


### 0.9.162 (2026-05-28)
- refactor(theme): rename config.darkMode to config.themeMode


### 0.9.161 (2026-05-28)
- fix(io-package): drop empty-key state from config.darkMode states map
- fix(theme): frontend now reacts to config.darkMode DP


### 0.9.160 (2026-05-28)
- feat(theme): add aura.0.config.darkMode DP for bidirectional dark/light sync


### 0.9.159 (2026-05-28)
- feat(input-widget): add text alignment option and cap width to maxLength


### 0.9.158 (2026-05-28)
- feat(custom-grid): flash the matching preview cell when an editor cell is clicked


### 0.9.157 (2026-05-28)
- fix(custom-grid): respect alignment for select cells in display-only mode
- feat(custom-grid): clear selected cell with Delete/Backspace key


### 0.9.156 (2026-05-28)
- feat(iconpicker): live Iconify online search beyond curated categories


### 0.9.155 (2026-05-28)
- feat(jsontable): per-column Iconify toggle for inline mdi: tokens


### 0.9.154 (2026-05-28)
- feat(jsontable): rewrite admin image paths via adminBaseUrl + per-column prefix


## License

MIT License

Copyright (c) 2026 Hermann Dering <aura@dering-online.de>

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

















































































































































































































