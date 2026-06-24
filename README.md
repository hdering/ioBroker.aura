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


### **WORK IN PROGRESS**
- (ioBroker-Bot) Adapter requires admin >= 7.8.23 now.

### 0.10.2-next.4 (2026-06-24) — next/test release
- chore(build): rebuild www frontend bundle
- Merge pull request #369 from hdering/fix/proxy-x-forwarded-for
- feat(proxy): forward X-Forwarded-For/Proto to the socket backend
- chore(build): rebuild www frontend bundle
- Merge pull request #368 from hdering/fix/pin-zustand-v4-prod-loop
- fix(deps): pin zustand to v4 — v5 causes prod-only infinite render loop
- chore(build): rebuild www frontend bundle
- Merge pull request #359 from hdering/fix/force-websockets-transport
- fix(socket): connect websocket-first so "Force web sockets" works
- chore(deps): bump actions/checkout from 6 to 7 (#356)
- chore(deps): bump zustand to v5 and migrate equality-fn store hooks (#358)
- chore(build): rebuild www frontend bundle
- chore(deps-dev): bump typescript from 5.9.3 to 6.0.3 (#330)
- chore(deps): bump @iobroker/adapter-core from 3.3.2 to 3.4.1 (#331)
- chore(deps): bump ioBroker/testing-action-check from 1 to 2 (#327)


### 0.10.2-next.3 (2026-06-24) — next/test release
- chore(build): rebuild www frontend bundle
- Merge pull request #368 from hdering/fix/pin-zustand-v4-prod-loop
- fix(deps): pin zustand to v4 — v5 causes prod-only infinite render loop
- chore(build): rebuild www frontend bundle
- Merge pull request #359 from hdering/fix/force-websockets-transport
- fix(socket): connect websocket-first so "Force web sockets" works
- chore(deps): bump actions/checkout from 6 to 7 (#356)
- chore(deps): bump zustand to v5 and migrate equality-fn store hooks (#358)
- chore(build): rebuild www frontend bundle
- chore(deps-dev): bump typescript from 5.9.3 to 6.0.3 (#330)
- chore(deps): bump @iobroker/adapter-core from 3.3.2 to 3.4.1 (#331)
- chore(deps): bump ioBroker/testing-action-check from 1 to 2 (#327)


### 0.10.2-next.2 (2026-06-24) — next/test release
- chore(build): rebuild www frontend bundle
- Merge pull request #359 from hdering/fix/force-websockets-transport
- fix(socket): connect websocket-first so "Force web sockets" works
- chore(deps): bump actions/checkout from 6 to 7 (#356)
- chore(deps): bump zustand to v5 and migrate equality-fn store hooks (#358)
- chore(build): rebuild www frontend bundle
- chore(deps-dev): bump typescript from 5.9.3 to 6.0.3 (#330)
- chore(deps): bump @iobroker/adapter-core from 3.3.2 to 3.4.1 (#331)
- chore(deps): bump ioBroker/testing-action-check from 1 to 2 (#327)


### 0.10.2-next.1 (2026-06-24) — next/test release
- chore(build): rebuild www frontend bundle


### 0.10.2-next.0 (2026-06-24) — next/test release
Release v0.10.2-next.0


### 0.10.1-beta.0 (2026-06-24) — beta/test release
Release v0.10.1-beta.0


### 0.10.0 (2026-06-24) — beta/test release
- Merge pull request #357 from hdering/pr218-pure-ws-followup
- fix(socket): resolve no-use-before-define in load guard
- fix(socket): dev-proxy pure-ws root upgrade + socket-lib load guard
- Support pure WebSocket transport (load socket.io client at runtime)


### 0.9.299 (2026-06-22)
- fix(io-package): restore required common.licenseInformation (E1015/E1105)


### 0.9.298 (2026-06-22)
- fix(backup): decode binary .gz reads so backups aren't reported empty


### 0.9.297 (2026-06-22)
- fix(custom-grid): align default custom-layout font sizes across all widgets
- fix(value-widget): match custom-layout font sizes to other layouts


### 0.9.296 (2026-06-22)
- fix(reset): land on backend overview after reset, not the frontend


### 0.9.295 (2026-06-22)
- test: drop licenseInformation from required io-package fields
- fix(backup): keep change-comment after reload by falling back to ioBroker cache


### 0.9.294 (2026-06-22)
- fix(reset): wipe backend config states on "reset everything", not just localStorage


### 0.9.293 (2026-06-22)
- chore(io-package): remove licenseInformation to skip admin license dialog


### 0.9.292 (2026-06-20)
- fix(group-defs): actually run gcGroupDefs to clean orphaned defs
- fix(broken-dp): skip orphaned group defs, deep-link popup-hosted children


### 0.9.291 (2026-06-20)
- fix(broken-dp): deep-link group/panels and nested-group children to editor


### 0.9.290 (2026-06-20)
- fix(lint): auto-fix mixed typographic quotes
- chore(deps): keep suncalc only in dependencies (backend runtime require)
- feat(universal-widget): deprecate standalone Button (DP) cell type
- feat(universal-widget): add button control mode to switch (DP) cell
- style(prettier): auto-format code files
- fix(timers): compute astro times with bundled suncalc instead of host getAstroDate


### 0.9.289 (2026-06-20)
- fix(settings): let device and backup lists grow together symmetrically
- fix(settings): let the backup list grow with its content


### 0.9.288 (2026-06-20)
- style(prettier): auto-format code files
- fix(settings): let the device list fill the full card height
- fix(settings): scroll the device edit/delete-confirm row into view


### 0.9.287 (2026-06-19)
- fix(enum): theme the Auswahlfeld dropdown from its anchor so it matches the layout theme


## License

MIT License

Copyright (c) 2026 Hermann Dering <aura@dering-online.de>

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.























































































































































































































































































































































