# ioBroker.aura

**Aura** is a modern visualization dashboard for [ioBroker](https://www.iobroker.net/).

📖 **[Documentation](https://hdering.github.io/ioBroker.aura/)** – widgets, settings, screenshots

---

## Installation

### Step 1 – Install adapter

Install Aura via ioBroker Admin:

1. Open ioBroker Admin
2. Go to **Adapters**
3. Search for **Aura** and install it

### Step 2 – Create instance

After installation, create a new **Aura** instance (if not done automatically).

### Step 3 – Configure the instance

Aura runs its **own web server** (frontend + built-in iframe proxy) and connects to an existing
`iobroker.web` instance only for the socket.io data connection. Open the **Aura** instance settings:

| Setting | Default | Meaning |
|---------|---------|---------|
| **Port** | `8095` | Port of Aura's HTTP server (frontend + iframe proxy) |
| **ioBroker socket port** | `8082` | Port of the `iobroker.web` instance that provides the socket.io connection |
| **Web adapter uses HTTPS** | off | Enable if that web instance runs HTTPS |

> **Requirement:** A running `iobroker.web` (or `iobroker.socketio`) instance must serve socket.io on
> the configured socket port. The stock `web.0` with **socket.io = integrated** provides this on
> port `8082` (the default). Aura auto-detects the matching instance and proxies the connection
> internally, so no `/aura/` path or web extension is needed anymore.

### Step 4 – Open dashboard

The dashboard is available at:

```
http://<iobroker-ip>:8095/
```

The admin interface at:

```
http://<iobroker-ip>:8095/#/admin
```

---

## HTTPS / Reverse Proxy

Aura can serve HTTPS in two ways.

### Option A – Built-in TLS

Enable **Use HTTPS** in the Aura instance settings and select the certificates (loaded from ioBroker
`system.certificates`). Aura's own server then serves `https://<iobroker-ip>:8095/`.

> The default self-signed certificate triggers a browser warning. For a clean setup use proper
> certificates (e.g. Let's Encrypt) or put Aura behind a reverse proxy (Option B).

### Option B – Reverse proxy

Point a reverse proxy (e.g. **nginx**, **Nginx Proxy Manager**, **Caddy**) with a valid TLS
certificate at Aura's port. Aura proxies the socket.io connection to the web instance internally, so
a single forwarded port is enough.

#### Nginx Proxy Manager – example configuration

| Field | Value |
|-------|-------|
| Forward Scheme | `http` |
| Forward Hostname / IP | `<iobroker-ip>` |
| Forward Port | `8095` |
| Websockets Support | enabled |

> **Alternative topology:** If you instead proxy `/socket.io/` and `/echarts/` directly to the web
> adapter port, set **ioBroker socket URL (override)** in the Aura settings to your public URL
> (e.g. `https://your-domain.com`) so the frontend connects socket.io to the right endpoint.

---

## Bugs & Feature Requests

Please report directly as a GitHub issue:

**[github.com/hdering/ioBroker.aura/issues](https://github.com/hdering/ioBroker.aura/issues)**

---

## Versioning

Aura uses a simple scheme so you can tell stable releases from test builds at a glance:

| Version | Meaning |
|---------|---------|
| `0.10.2-next1`, `0.10.2-next2`, … | **Test builds** for the upcoming `0.10.2` release. Pre-releases, published for testing only. |
| `0.10.1` in the **Latest** repo | A published release in ioBroker's *Latest* repository. Available to everyone, but still on probation — not yet promoted to *Stable*. |
| `0.10.1` in the **Stable** repo | The same version after it has proven itself error-free in the field. This is the truly stable build. |

- A **`-nextN` suffix** marks a pre-release. The number counts the test builds leading up to the next plain version (`next1`, `next2`, …). Pre-releases are **not** offered automatically in ioBroker; you only get them if you explicitly install that version.
- A **plain number** (`0.10.1`, `0.10.2`, …) is first published to ioBroker's **Latest** repository. This makes it generally available, but *Latest* is the proving ground — one step before truly stable.
- Once a *Latest* release has run long enough with no errors reported, the **same version** is promoted to the **Stable** repository. Only then is it considered fully stable.

So the path of any release is: `-nextN` test build → **Latest** (published, on probation) → **Stable** (promoted once confirmed error-free).

---

## Changelog

_Older releases: see [CHANGELOG_OLD.md](CHANGELOG_OLD.md)._

### 0.23.2 (2026-07-10)
- Distribution chart - pie and donut now render for datapoints without a history adapter (falls back to the current value)
- Distribution chart - optionally show each datapoint's icon inside the bar segments and pie/donut slices, next to the percentage
- Distribution chart - small pie/donut slices can optionally show their percentage on a leader line outside the ring instead of hiding it


### 0.23.1 (2026-07-10)
- Layout menu - docked sidebar now collapses into the tab bar on mobile and re-docks on wider screens


### 0.23.0 (2026-07-10)
- 🌟 **New feature:** Admin - appearance settings reorganized into a new "Frontend Design" menu (theme, typography, grid, guidelines and tab bar, global or per layout) with a "Global frame" group for header, layout menu and navigation (auto-return to default tab); the layout menu gained a "docked sidebar" placement (permanent left menu with configurable width, entry height and optional title), the old "Frontend" menu was dissolved, and optimistic updates moved to "Settings"


### 0.22.5 (2026-07-09)
- Advanced chart - optional day navigation (prev day / today / next day) to browse single calendar days
- Advanced chart - per-series history aggregation option (average/minmax/max/min/total); minmax keeps true extremes for sparsely logged counters
- Advanced chart - monotone line smoothing, so flat data runs no longer wobble around their value
- Advanced chart - choose which time-range presets the frontend selector offers
- Advanced chart - a range without recorded changes draws a flat line at the current value instead of "no data"
- Advanced chart - fixed periodic chart flicker when adapters re-write unchanged values
- Panels - loop now wraps seamlessly onto the first/last slide instead of rewinding across the whole row
- Settings - new "Colored" tab-bar style that only tints the active tab's text (no underline)


### 0.22.4 (2026-07-09)
- Status Overview - remove leftover jump-to-device behavior (no more pointer cursor or navigation on row click)
- Datapoint picker - scene datapoints (scene.0.*) are now selectable and shown by default
- Popups - choosing "no view" for a widget type default now correctly disables the popup instead of falling back to the built-in one
- Tab bar - bottom-corner tab badges are no longer hidden behind iframe widgets that fill the tab
- Dark themes - native controls (dimmer/slider rails, scrollbars, dropdowns) now render dark instead of light, so the dimmer slider rail is no longer brighter in the frontend than in the admin backend
- Popups - widget visibility conditions now work inside popup/tab views (hide-widget and reflow "move others up"), matching how they behave on the dashboard


### 0.22.3 (2026-07-08)
- Settings - Connected Devices now show a device-type icon (phone/tablet/desktop), OS/browser, screen resolution and the client ID so each device is easy to identify
- Settings - optional on-screen badge (toggle in Connected Devices) shows each device its own client ID, so it can be identified without opening the backend


### 0.22.2 (2026-07-08)
- Settings - Connected Devices now show a device-type icon (phone/tablet/desktop), OS/browser and screen resolution so each client is easy to identify
- Settings - a client renamed from another device no longer reverts to its generic name on reconnect


### 0.22.1 (2026-07-08)
- Settings - Connected Devices now show a device-type icon (phone/tablet/desktop), OS/browser and screen resolution so each client is easy to identify


### 0.22.0 (2026-07-08)
- 🌟 **New feature:** Load times - add a dedicated backend page (Admin -> Ladezeiten) with live metrics, a per-widget breakdown showing each widget's tab with click-through to the editor, network breakdown metrics (TTFB, transfer, DNS, TCP/TLS) plus a backend ping (RTT) to spot high latency (e.g. over VPN), client names from Settings instead of raw ids, a toggleable chart legend, a refresh spinner, and an info popup on which metrics to watch; the old dashboard widget is superseded and hidden from the picker but keeps working
- Popup views - widgets now show their normal card background instead of always appearing transparent; a widget's own transparency setting is still respected


### 0.21.15 (2026-07-08)
- 🌟 **New feature:** Switch - control element can now be an image (URL or base64) with separate on/off images, alongside toggle and icon
- Color picker - typing a hex code (e.g. #ef4) is no longer auto-expanded while you type; the colour still previews live and normalizes on blur


### 0.21.14 (2026-07-08)
- fix(loadtimes): make view toggle label show the action (Details/Verlauf anzeigen)
- fix(loadtimes): stop breakdown list bloating over long sessions
- feat(loadtimes): split widget Name/Type columns + reset button + freshness time


### 0.21.13 (2026-07-07)
- feat(loadtimes): add refresh button that re-polls the backend


### 0.21.12 (2026-07-07)
- fix(loadtimes): add "ms" unit label to the chart Y-axis
- feat(loadtimes): explain Bereit/Render/Summe columns in an info popup
- feat(loadtimes): widget breakdown as ready|render|sum table with column headers
- Add Test section to README (#425)


### 0.21.11 (2026-07-07)
- Settings - fix admin configuration page failing to load (missing i18n property in jsonConfig)


### 0.21.10 (2026-07-07)
- fix(list): stop frontend value filter from resetting after config sync
- fix(list): apply frontend value filter instantly via local state


### 0.21.9 (2026-07-07)
- Static list / Auto list - frontend filter (all / active / inactive) now applies instantly instead of only when the admin config tab is open


### 0.21.8 (2026-07-07)
- feat(guidelines): drop "hide now" button from resolution hint
- fix(guidelines): show resolution badge in mobile view too


### 0.21.7 (2026-07-07)
- 🌟 **New feature:** Clients - store each client's current screen resolution in ioBroker (clients.<id>.info.resolutionWidth / resolutionHeight), updated on connect and on resize
- 🌟 **New feature:** Settings - the frontend resolution display is now its own block, independent of the guidelines (no longer requires guidelines to be active)
- Tab bar - fix tabs sticking to the top instead of being vertically centered (regression from the mobile scroll-hint change)


### 0.21.6 (2026-07-07)
- Fill level - value text now uses the theme text color for readable contrast in light mode (was tinted with the fill/zone color); in the wave and battery layouts the number is split at the fill line so both halves stay legible when the level crosses the middle of the digits


### 0.21.5 (2026-07-07)
- Tabs - the "more tabs" scroll hint no longer flickers on mobile and sits higher, right under the tabs


## License

MIT License

Copyright (c) 2026 Hermann Dering <aura@dering-online.de>

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.











































































































































































































































































































































































































































