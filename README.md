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


### 0.18.0 (2026-07-04)
- Settings - Frontend options reordered (Header first) with clearer grouping for sub-settings, and a note that the layout menu only appears with 2+ layouts
- General - adapter readme link now points to the online documentation instead of a dead iobroker.net page
- 🌟 **New feature:** Energiebilanz - new widget: any number of stacked bars, each from multiple datapoints with history aggregation (e.g. Production/Consumption)


### 0.17.5 (2026-07-03)
- Groups - widgets keep their current size when dropped into a group instead of resetting to the type default


### 0.17.4 (2026-07-03)
- Script Status, Adapter Status, Adapter Logs - add optional zebra striping (like the JSON table widget)


### 0.17.3 (2026-07-03)
- Weather - fixed weather condition labels (WMO codes 1-3 were shifted; code 1 now correctly shows "Mainly clear")


### 0.17.2 (2026-07-03)
- Script status - list entries, filter buttons and search box now respect transparent mode
- JSON table - header and search box now respect transparent mode
- Adapter logs - filter buttons, source buttons, search box, table header and log rows now respect transparent mode
- Adapter status - filter buttons, search box and instance rows now respect transparent mode


### 0.17.1 (2026-07-03)
- feat(config): apply typed hex color live in ColorPicker


### 0.17.0 (2026-07-03)
- 🌟 **New feature:** Color pickers - add a 0-100% transparency (alpha) slider plus a hex input to every color control (widgets and settings).


### 0.16.0 (2026-07-03)
- 🌟 **New feature:** Map - add quick-access chips that recenter the map to a configured position on click; each chip supports the same position sources as markers (JSON datapoint, two datapoints, fixed coordinates or address) plus an optional zoom, and can be placed below the map or as an overlay in any corner


### 0.15.5 (2026-07-03)
- Settings - the global decimal-places setting now applies on all browsers/devices, not just the one where it was configured


### 0.15.4 (2026-07-02)
- Tabs - badges are no longer clipped by the header
- Weather - fix jumbled/incorrect forecast weekday labels when using adapter data source (open-meteo-weather emits DD.MM.YYYY dates)
- Weather - forecast now shows rain amount consistently (0 mm on dry days) instead of hiding it, so the column no longer looks ragged
- fix(lint): wrap German typographic quotes in StatusOverviewConfig JSX
- Auswahlfeld - current selection can now be shown as text, icon, or icon + text; entries gained per-entry icons and a compact single-row editor. The Universal widget's DP-select cell matches this: import entries from the datapoint's common.states, per-entry icons, and a tidied entry row
- 🌟 **New feature:** Status overview - new widget that automatically surfaces low batteries, open windows, lights left on, unreachable/offline devices and smoke/water alarms, with an "all clear" state and click-to-jump to the affected device; offers list/Card/Minimal layouts with per-category colors, shows battery type and count, uses robust reachability detection, and includes a battery-type assignment page to identify and manage battery devices


## License

MIT License

Copyright (c) 2026 Hermann Dering <aura@dering-online.de>

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
















































































































































































































































































































































































































