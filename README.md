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
| **web instance** | automatic | The `iobroker.web` instance to connect to. Pick one and its port, bind address and HTTPS setting are taken from it — the two fields below are then hidden |
| **ioBroker socket port** | `8082` | Only in automatic mode: port of the `iobroker.web` instance that provides the socket.io connection |
| **Web adapter uses HTTPS** | off | Only in automatic mode: enable if that web instance runs HTTPS |

> **Requirement:** A running `iobroker.web` (or `iobroker.socketio`) instance must serve socket.io on
> the configured socket port. The stock `web.0` with **socket.io = integrated** provides this on
> port `8082` (the default). Aura auto-detects the matching instance and proxies the connection
> internally, so no `/aura/` path or web extension is needed anymore.

**If anything does not work — a blank dashboard, widgets with a load error, images that stay
empty — press *Check backend* in the instance settings first.** It tests the instance, the
socket connection and the file delivery live and says in plain words what is wrong; the report
is meant to be pasted into a forum post or a GitHub issue. Aura runs the same check at every
start and writes the result to the log and to `aura.0.info.backendCheck`.

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

### 0.82.0 (2026-10-12)
- 🌟 **New feature:** Switching a widget to the custom layout now asks how to start and can rebuild the previous layout (default, card, compact, minimal, dial) as an editable grid that looks the same — for value, binary sensor, window contact, state image, switch, thermostat, weather, knob, dimmer, shutter, slider, selection, button, HTTP request, text input, clock, time switch, countdown, media player, light, calendar and evcc ([#768](https://github.com/hdering/ioBroker.aura/issues/768))
- Thermostat - setpoints written as text (e.g. a time switch exception value "14,5") are shown instead of a fallback 20 °C, and time switch values accept a decimal comma ([#769](https://github.com/hdering/ioBroker.aura/issues/769))
- Waste collection - bins now sit at the top of the widget instead of being centered vertically when the widget is taller than its content
- 🌟 **New feature:** PIN protection - a section or tab can now reuse the PIN of another section or tab instead of a new one; the PIN stays linked, so changing it at the source changes it everywhere


### 0.81.5 (2026-10-12)
- Lost connection to ioBroker is now visible: after 5 s offline a banner shows since when, widgets are greyed out, and the status overview says "Status unknown" instead of "All clear"
- Shutter - "Re-set after drive" detects the end of a drive by the actual position reaching the target, so slow-reporting KNX actuators no longer get the slat angle mid-drive ([#745](https://github.com/hdering/ioBroker.aura/issues/745))


### 0.81.4 (2026-10-11)
- Click popups without a configured width now size to their content (e.g. the popup view's own width) instead of stopping at 600 px
- Chart / Advanced chart - time ranges can now be set in minutes (custom range and own range chips like `15m`) for watching live values ([#766](https://github.com/hdering/ioBroker.aura/issues/766))


### 0.81.3 (2026-10-11)
- Settings - web adapter extension: hint that the Visu App / ioBroker.pro remote access needs the same web instance as the cloud adapter (usually web.0) ([#688](https://github.com/hdering/ioBroker.aura/issues/688))
- 🌟 **New feature:** Group / List - group switch: choose whether a click from the mixed state turns all devices on or off ([#764](https://github.com/hdering/ioBroker.aura/issues/764))
- Status overview: the colour of the row buttons "Replaced/Acknowledge", "Later" and "Ignore" can be set per button, and each button carries its own CSS class.
- Fill level - LED segments: "Fill width" now keeps the configured segment count and spreads it over the tile (the old behaviour is the new "Adapt count to length" switch), up to 200 segments, and the value can sit below or beside the segments with its own font size ([#765](https://github.com/hdering/ioBroker.aura/issues/765))


### 0.81.2 (2026-10-11)
- Status overview - new row action "Ignore" (option latchIgnore, with confirmation) hides a false alarm such as an empty wallbox for good; ignored datapoints are never remembered again and can be shown and restored with showIgnored
- Status overview - commands on status.<cat>.cmd run one after another, accept several ids (remove:<id1>,<id2>) and report their outcome in status.<cat>.cmdResult; excluded datapoints (excludeIdPatterns) take effect in the adapter immediately, without a browser
- Status overview - remembered entries of datapoints with a bare name (e.g. vehicleSoc) are named after their channel or title


### 0.81.1 (2026-10-10)
- Shutter - without an activity datapoint, "Re-set after drive" waits until the actual position stops changing, and a preset counts as reached within ±2 points of the actual position ([#745](https://github.com/hdering/ioBroker.aura/issues/745))


### 0.81.0 (2026-10-10)
- 🌟 **New feature:** History table - per-column options like the JSON table (hide, order, width, alignment, wrap, background and text colour, prefix/suffix, value as date/time), sort rules and sorting by clicking a column title ([#760](https://github.com/hdering/ioBroker.aura/issues/760))
- Shutter - "Re-set after drive" now restores the slat angle only once, after a drive started from the widget; drives from a wall switch or logic no longer bring the old angle back ([#745](https://github.com/hdering/ioBroker.aura/issues/745))
- 🌟 **New feature:** History table - optional time grid: one row per interval (1 min to 1 day, e.g. every 30 minutes), showing the value at that moment or the average, minimum, maximum or sum of the interval ([#760](https://github.com/hdering/ioBroker.aura/issues/760))
- 🌟 **New feature:** Advanced chart - optional period value per series: consumption/yield, difference, minimum, maximum or average over the range shown, in the legend or in a row above the chart; follows the range buttons and day navigation ([#749](https://github.com/hdering/ioBroker.aura/issues/749))


### 0.80.4 (2026-10-09)
- 🌟 **New feature:** Conditions - new effect "Disable widget": while the condition matches, the widget is greyed out and cannot be operated; its look is adjustable under Theme & CSS


### 0.80.3 (2026-10-08)
- Popups - `popup.open` datapoints accept `width` and `height` (px) in the JSON payload to set the popup size ([#762](https://github.com/hdering/ioBroker.aura/issues/762))


### 0.80.2 (2026-10-08)
- Status overview - the two-line layout uses the standard text sizes, in line with the other widgets


### 0.80.1 (2026-10-08)
- Status overview - new layout "Recently changed" (history): lists every closed hint the adapter recorded in aura.0.status.<category>.history (survives restarts) with relative date, "by button" or "detected automatically", how long the battery was weak and how long the previous one lasted; "Reopen" takes back a change confirmed by mistake (reopen:<id>@<time> on .cmd); import:<JSON> on .cmd and a one-time takeover of 0_userdata.0.Batterien.Verlauf bring in an older record; retention is set in the instance settings (default 50 changes / 2 years)


### 0.80.0 (2026-10-08)
- Advanced chart - value labels at the chart edges no longer overlap the y-axis numbers or snap back over the edge after a redraw ([#703](https://github.com/hdering/ioBroker.aura/issues/703))
- 🌟 **New feature:** History table - new widget that lists the recorded values of a datapoint from a history adapter (history, sql, influxdb): the last N values or a time range, with date and time in one or two columns ([#760](https://github.com/hdering/ioBroker.aura/issues/760))
- Advanced chart - series aggregated as max, min or sum (and averages over 30 days and more) no longer end in a spike to the live value at the right edge; the current value above the chart still shows the live reading


### 0.79.0 (2026-10-08)
- 🌟 **New feature:** Status overview - new layout "Two lines": severity dot, bold device name, reading and facts on a second line, large touch buttons ("2 days later", "Replaced" with a second-tap confirmation)
- Auto height - widgets with "fit height to content" (also inside groups) no longer keep empty space below their content when the fluid grid stretches its rows ([#759](https://github.com/hdering/ioBroker.aura/issues/759))
- Timer - schedule entries added in the frontend are no longer lost when the widget is edited in the admin open in the same browser ([#758](https://github.com/hdering/ioBroker.aura/issues/758))
- Timer - optional fixed value for vacation and holiday days: written once when the exception starts, regular events pause meanwhile and the normal schedule is restored when it ends ([#757](https://github.com/hdering/ioBroker.aura/issues/757))
- Fill level - LED segments: configurable segment count and a "fill width" option that adds segments to span wide (or tall) tiles ([#756](https://github.com/hdering/ioBroker.aura/issues/756))


### 0.78.1 (2026-10-06)
- Timer - entries added in a timer that sits inside a popup view are now saved and survive a page reload ([#750](https://github.com/hdering/ioBroker.aura/issues/750))


### 0.78.0 (2026-10-05)
- iFrame - "Keep alive" now keeps the page across tab and section switches, also with "Fill tab"; without it, a hidden iFrame is unloaded and reloads fresh when shown again ([#65](https://github.com/hdering/ioBroker.aura/issues/65))
- 🌟 **New feature:** Widgets, popups and tabs can have a background image (fit, alignment, darken): per widget under Edit → Advanced, for popups globally, per popup view and per click action, behind a tab per tab, section or layout ([#442](https://github.com/hdering/ioBroker.aura/issues/442))
- Status overview - weak batteries and unreachable devices can be remembered until they are closed ("Changed"/"Acknowledge") or put back ("Later"); the adapter keeps the list for all browsers, rechecks after closing, can close on a voltage jump, and offers aura.0.status.<category>.cmd/.event for scripts
- Status overview - configurable row buttons that write a value with placeholders ({id}, {device}, {serial}, {name}, {room}), optionally after a second tap; "since …" can also be shown for batteries and reachability


### 0.77.4 (2026-10-05)
Release v0.77.4


### 0.77.3 (2026-10-05)
- Shutter - quick-select buttons can set only the slat angle, and skip the drive when the blind is already at the preset position ([#745](https://github.com/hdering/ioBroker.aura/issues/745))


### 0.77.2 (2026-10-04)
- Adapter log - startup and routine status messages moved from info to debug, so the log stays quiet unless something needs attention


### 0.77.1 (2026-10-04)
- 🌟 **New feature:** "Show last change" can now show the last update instead (datapoint written, even with the same value) — in the widget display settings, carousel items, list entries, dynamic lists and custom cells
- Opening Aura below a path other than its root (e.g. an old .../aura/ bookmark) loads the dashboard again instead of a blank page - it now redirects to the root (regression in 0.77.0)


### 0.77.0 (2026-10-04)
- 🌟 **New feature:** Settings - optional web adapter extension: Aura can additionally be opened as <web-port>/aura/, e.g. from the ioBroker Visu App or the cloud adapter; off by default, port 8095 keeps working
- Settings - the chosen socket backend instance is no longer cleared on every adapter start


## License

MIT License

Copyright (c) 2026 hdering <aura@dering-online.de>

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.











































































































































































































































































































































































































































































































































































































































































