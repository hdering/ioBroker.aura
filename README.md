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

### 0.9.102 (2026-05-21)
Release v0.9.102


### 0.9.101 (2026-05-21)
- fix(lint): stabilise hook deps and drop unused catch binding


### 0.9.100 (2026-05-21)
- fix(knob): remove legacy auto/1fr/auto axis sizes so dial stays centered
- fix(custom-grid): use minmax(0, 1fr) so cell contents don't unbalance tracks
- fix(docs): drop unresolved screenshot placeholders for timer page
- fix(lint): wrap typographic quotes in JSX expressions
- Revert "chore: bump version to 99.99.99"


### 0.9.99 (2026-05-20)
- fix(lint): auto-fix mixed typographic quotes
- fix(lint): typographic quote in timer empty-state text
- docs(timer): add Zeitschaltuhr widget reference


### 0.9.98 (2026-05-20)
- fix(timer): read-only in edit mode, frontend save flush, no object warnings
- fix(timer): icon size, hide DP picker, custom layout, hide-able master
- fix(timer): adopt template config panel layout
- fix(timer): non-dismissible backdrop on event modal
- fix(timer): admin-only target DP, layout list, modal theme, DP examples
- feat(timer): Zeitschaltuhr widget with backend scheduler


### 0.9.97 (2026-05-20)
Release v0.9.97


### 0.9.96 (2026-05-20)
- feat(weather): bar-only temp-strahl variant in custom layout


### 0.9.95 (2026-05-20)
- feat(list): toggle row dividers in static and auto list widgets
- feat(static-list): drag-handle to reorder data point entries


### 0.9.94 (2026-05-20)
- fix(custom-grid): prevent descender clipping on free-text cells
- ci: add dependabot auto-merge workflow (S8913)
- fix(ci): match ioBroker.example concurrency pattern exactly (E3009)


### 0.9.93 (2026-05-20)
- chore(repo): adapter-checker compliance (E3008/E3009/W0050)


### 0.9.92 (2026-05-20)
Release v0.9.92


### 0.9.91 (2026-05-20)
Release v0.9.91


### 0.9.90 (2026-05-19)
- feat(universal-widget): hide dropdown option for select cell


### 0.9.89 (2026-05-19)
- fix(layout-drawer): disable both placement buttons when header is on
- fix(layout-drawer): disable 'in tab bar' when header on or auto-hide on
- feat(layout-drawer): customize title and entry display style
- feat(layouts): drag to reorder layouts in admin list
- feat(layout-drawer): add 'in tab bar' placement option
- fix(layout-drawer): allow inline trigger width to fit icon + name


### 0.9.88 (2026-05-19)
- fix(knob): use knob default grid as editor fallback
- feat(knob): empty default custom grid except dial at 2/2
- fix(knob): honour titleAlign in bogen/skala/endless layouts
- feat(custom-grid): allow fontSize as explicit pixel size on component cells
- feat(knob): add custom layout with selectable dial style


### 0.9.87 (2026-05-19)
- fix(knob): auto-compute label decimals to avoid duplicate scale labels


### 0.9.86 (2026-05-19)
- fix(editor): sort widget types alphabetically within each category


### 0.9.85 (2026-05-19)
- feat(knob): add knob widget with 3 layouts (Bogen / Skala / Endlos 3D)


### 0.9.84 (2026-05-19)
- fix(editor): keep widget type when changing DP; ask before auto-switch on new widgets


### 0.9.83 (2026-05-19)
- feat(weather): pre-populate custom grid from standard layout settings


## License

MIT License

Copyright (c) 2026 Hermann Dering <aura@dering-online.de>

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.










































































































































