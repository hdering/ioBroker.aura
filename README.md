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

### 0.9.226 (2026-06-11)
- chore(lint): disable prettier/prettier for main.js
- chore(deps): migrate recharts 2.12.7 -> 3.8.1 (W0083)
- chore(deps): drop @types/dompurify, use bundled types (W0083)
- fix(checker): use globalThis.setTimeout in test-socket.mjs (E5005)


### 0.9.225 (2026-06-11)
- chore(deps): migrate react-grid-layout 1.4.4 -> 2.2.3 via /legacy (W0083)
- chore(deps): bump autoprefixer, vitepress, globals, lucide-react, eslint-config (W0083)
- fix(checker): resolve E5004/E5005/E6022 (globalThis timers, CHANGELOG_OLD link)


### 0.9.224 (2026-06-11)
Release v0.9.224


### 0.9.223 (2026-06-11)
- style(prettier): auto-format src-vis and main.js
- style(prettier): format main.js (indent + collapse aligned requires)


### 0.9.222 (2026-06-11)
- fix(checker): resolve adapter-checker warnings (deps, roles, timers, prettier)


### 0.9.221 (2026-06-10)
- fix(lint): auto-fix mixed typographic quotes
- feat(group-action): per-target checklist to exclude DPs
- refactor(editor): hide empty widget-settings card for group widget
- refactor(editor): move group action into its own card outside the widget box
- feat(group-action): selectable action type (switch/dimmer/shutter/momentary)
- feat(lists): add shutter, stepper, value-presets and momentary controls


### 0.9.220 (2026-06-10)
- style: fix prettier formatting in TabBarSection
- feat(admin): tab bar height + font size as px sliders extendable beyond range


### 0.9.219 (2026-06-10)
- feat(admin): make image/file picker root folders (fsRoots) editable in settings


### 0.9.218 (2026-06-10)
- fix(editor): sort 'Weitere Widgets' by displayed label so new widget types auto-order alphabetically


### 0.9.217 (2026-06-10)
- fix(lint): prettier formatting + wrap German quotes in JSX expressions
- feat(widgets): per-column width ratios for custom-grid layout
- feat(widgets): add 'last change' custom-grid cell type (DP-only timestamp)


### 0.9.216 (2026-06-10)
- feat(editor): peek mode to hide edit chrome while holding Ctrl+Alt
- fix(widgets): add visible label to empty group master switch placeholder
- feat(widgets): show group master switch placeholder in editor when empty


### 0.9.215 (2026-06-10)
- @ fix(groups): stop empty group-defs store from clobbering ioBroker on reload


### 0.9.214 (2026-06-10)
- fix(widgets): keep list subscriptions alive under StrictMode
- feat(settings): optimistic writes with instant UI feedback
- fix(widgets): make group master switch confirm writes via getState
- @ fix(widgets): give group master switch instant optimistic feedback
- @ feat(widgets): add group master switch for lists and groups


### 0.9.213 (2026-06-09)
- fix(meta): remove unpublished 0.9.212 from io-package news (E2004)


### 0.9.212 (2026-06-09)
- fix(ci): remove release trigger to prevent E3032 run cancellation


### 0.9.211 (2026-06-09)
- chore(lint): remove obsolete eslint devDeps, fix workflow concurrency


### 0.9.210 (2026-06-09)
- fix(ts): use optional chain for unsubscribe call in CalendarWidget


### 0.9.209 (2026-06-09)
- fix(lint): suppress no-explicit-any in lazyWithReload generic bound


### 0.9.208 (2026-06-09)
- chore: add .eslintcache to .gitignore
- chore(ci): drop Node 20 from test matrix


### 0.9.207 (2026-06-09)
- fix(lint): remove unused eslint-disable directives


## License

MIT License

Copyright (c) 2026 Hermann Dering <aura@dering-online.de>

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.






































































































































































































































































