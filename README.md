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

### 0.21.7 (2026-07-07)
- 🌟 **New feature:** Clients - store each client's current screen resolution in ioBroker (clients.<id>.info.resolutionWidth / resolutionHeight), updated on connect and on resize
- 🌟 **New feature:** Settings - the frontend resolution display is now its own block, independent of the guidelines (no longer requires guidelines to be active)
- Tab bar - fix tabs sticking to the top instead of being vertically centered (regression from the mobile scroll-hint change)


### 0.21.6 (2026-07-07)
- Fill level - value text now uses the theme text color for readable contrast in light mode (was tinted with the fill/zone color); in the wave and battery layouts the number is split at the fill line so both halves stay legible when the level crosses the middle of the digits


### 0.21.5 (2026-07-07)
- Tabs - the "more tabs" scroll hint no longer flickers on mobile and sits higher, right under the tabs


### 0.21.4 (2026-07-06)
- 🌟 **New feature:** Guidelines - show a live badge with the current device screen resolution; enabled by default on fresh installs with a dismissible hint on how to turn it off


### 0.21.3 (2026-07-06)
- Load times - color-coded good/ok/slow thresholds with reference lines and latest-value badges so numbers are interpretable at a glance
- Load times - samples are now tagged per client; widget defaults to the current device and can filter/compare individual clients
- Load times - time range (1h/6h/24h/7d/all) is now switchable live from the widget header, not only in edit mode
- Load times - new "Details" view attributes slowness per widget (render and ready time) and per backend command, so you can see which one is responsible
- Settings - add performance-diagnostics switches: record load-time metrics (default on) and optional per-widget timing (default off, higher overhead)


### 0.21.2 (2026-07-06)
- Chart (Distribution) - "last" values now show the true current value instead of a history bucket average (e.g. 0 was shown as non-zero)


### 0.21.1 (2026-07-06)
- Zeitschaltuhr - adding or editing events now saves when the widget is used inside a popup


### 0.21.0 (2026-07-06)
- Energiebilanz - legend position is now a single option (left/right/above/below) shown under "Show legend", instead of a per-bar dropdown
- Energiebilanz - added a legend text-alignment option (left/center/right)
- Energiebilanz - legend content can now show the label only
- Energiebilanz - bar title and total can now be aligned left/center/right
- 🌟 **New feature:** Energiebilanz - new display style: bars, pie or donut chart (donut shows the total in its center)
- Energiebilanz - fixed legend labels being cut off in pie/donut view
- Energiebilanz - renamed to "Diagramm (Verteilung)" and moved into the standard widget group (it works for any part-of-whole data, not just energy)
- Diagramm (Verteilung) - adjustable bar width (bars) and diagram size (pie/donut)


### 0.20.0 (2026-07-06)
- 🌟 **New feature:** Export - optionally anonymise datapoints, titles, URLs, coordinates and custom code when exporting a widget, tab, layout or popup


### 0.19.5 (2026-07-06)
- Layouts - changing the global theme preset now shows the Save button again


### 0.19.4 (2026-07-06)
- Map - corners are now rounded in the live view too (transparent map widgets used to render square outside the editor)


### 0.19.3 (2026-07-06)
- Map - opens on a sensible overview and zooms to the marker once its position resolves (no more long wait on a blank zoomed-in patch)
- Map - keeps following a slowly moving marker instead of staying put on small position changes
- Datapoint picker - adds a "Show inactive" toggle to reveal states of disabled/uninstalled adapters and orphaned or imported datapoints


### 0.19.2 (2026-07-05)
- Universal widget - slider cell now offers a decimal-places option (with Global fallback) when the value display is enabled


### 0.19.1 (2026-07-05)
- Map - now centers reliably on a marker positioned via two lat/lon datapoints instead of staying on the default view


### 0.19.0 (2026-07-05)
- 🌟 **New feature:** New "Load times" widget - charts frontend load performance over time (initial load, first paint, socket warm-up, tab switches, long tasks), recorded in the aura backend


### 0.18.5 (2026-07-05)
- Popup views - HTTP request, button, map and status overview widgets now render inside popups instead of showing "unknown type"


### 0.18.4 (2026-07-04)
- Status overview - each category now has a freely selectable background color in addition to the highlight color
- Status overview - enabled categories now group their settings in a card so it is clear which settings belong to which category
- Status overview - the hint-count chip in the top-right can now be hidden
- Status overview - new option to size the widget height to its content (auto height), in both the grid and the stacked/mobile view


### 0.18.3 (2026-07-04)
- Conditions - visibility can now show a widget or tab on match, not just hide it (new Hide/Show on match toggle)


### 0.18.2 (2026-07-04)
- Weather - card sizes to its content on mobile, removing the empty gap below it in the single-column layout


### 0.18.1 (2026-07-04)
- Input field - optional confirmation prompt before sending the value (input widget submit mode and universal-widget input cell)
- Universal widget - input cell now matches the input widget: submit-on-Enter/Send vs. live mode, an optional Send button, and a multi-line (textarea) mode
- Input field - add a number input type with optional Min/Max/Step


## License

MIT License

Copyright (c) 2026 Hermann Dering <aura@dering-online.de>

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


























































































































































































































































































































































































































