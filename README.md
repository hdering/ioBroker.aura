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

### 0.84.0 (2026-10-17)
- Tab bar - a menu item next to left- or right-aligned tabs now only takes its own width instead of half the bar ([#791](https://github.com/hdering/ioBroker.aura/issues/791))
- 🌟 **New feature:** Map - show a route along the roads between two markers, with distance and travel time ([#790](https://github.com/hdering/ioBroker.aura/issues/790))
- 🌟 **New feature:** Map - draw recorded tracks from a JSON datapoint or from the history of a position datapoint, optionally with a dot per point showing time, speed and accuracy ([#410](https://github.com/hdering/ioBroker.aura/issues/410))
- 🌟 **New feature:** Map - day bar to browse recorded tracks day by day, chips to switch between lines, and a timeline of stays and trips with addresses under the map ([#410](https://github.com/hdering/ioBroker.aura/issues/410))
- 🌟 **New feature:** Map - the settings are grouped into collapsible sections, and each marker, line and quick-access chip folds down to its name
- 🌟 **New feature:** Map - a custom tile server can no longer be set up; maps that already use one keep it and can remove it in the settings


### 0.83.3 (2026-10-16)
- Overview - timers inside groups or device cards are no longer reported as orphaned datapoints on the first visit ([#788](https://github.com/hdering/ioBroker.aura/issues/788))
- 🌟 **New feature:** Group action - a click from the mixed state can now ask "all on or all off?" in a small popup (new option "Ask")


### 0.83.2 (2026-10-16)
- Popups - a web page (iFrame) popup now uses the configured width and height
- Frontend - tapping a widget on a touch tablet no longer selects the text on the whole page


### 0.83.1 (2026-10-16)
- Icons whose name contains a number (e.g. trash, table, layers, bar chart) were requested under a wrong name, so they never showed and logged "icon cache — fetch failed" without internet access ([#787](https://github.com/hdering/ioBroker.aura/issues/787))
- Messages - a message closed by a script (messages.dismiss) stayed open when another message was sent in the same moment, e.g. an error followed by its all-clear


### 0.83.0 (2026-10-15)
- Web adapter extension - with socket.io, the web adapter's WebSocket listeners are no longer re-wired; Aura only adds its own for /aura/ ([#784](https://github.com/hdering/ioBroker.aura/issues/784))
- 🌟 **New feature:** Timer - holiday and vacation days can be picked with a date picker in the frontend (special-days button next to the add-event button, labelled with the current or next special day) and are written to the holiday / vacation datapoint; flag datapoints are only shown ([#785](https://github.com/hdering/ioBroker.aura/issues/785))


### 0.82.10 (2026-10-14)
- 🌟 **New feature:** Popups - optional countdown in a corner of the popup (top/bottom, left/right) showing the seconds until it closes automatically


### 0.82.9 (2026-10-14)
- Advanced chart - the current-time line on a category axis now shows which label it hits, warns when none matches and offers the labels from the data to pick from
- MCP - the per-widget "last change" display options are now part of the widget schema; three false validator warnings are gone (frame options called ineffective, universal widget with a custom grid but no defId, JSON chart on a string datapoint)
- Timer - switches more reliably: an edited entry fires again on the same day when its time is moved later, an entry saved while the connection was briefly lost is sent again on reconnect, one broken entry no longer stops all other timers, and an event due in the split second between two checks is no longer skipped ([#778](https://github.com/hdering/ioBroker.aura/issues/778))
- Timer - inside a popup view or a device card, a timer whose target uses a placeholder like {{dp}} now keeps its own schedule and entries per device; before, all devices shared one schedule that only switched the device opened last ([#778](https://github.com/hdering/ioBroker.aura/issues/778))
- Countdown - inside a popup view or a device card, a countdown whose target uses a placeholder like {{dp}} now runs separately per device; before, starting it for one device ran it for the device shown last ([#778](https://github.com/hdering/ioBroker.aura/issues/778))
- Media player - shuffle and repeat now show their current state (accent color with a dot) and switch the mode back off on a second click (repeat steps through off / all / one); the cover no longer sticks to the previous track or freezes with Sonos ([#782](https://github.com/hdering/ioBroker.aura/issues/782))


### 0.82.8 (2026-10-13)
- Energy flow (evcc) - datapoint picker next to the production, consumption, grid and battery fields; with an evcc instance as source these fields now fill in automatically


### 0.82.7 (2026-10-13)
- Advanced chart - the current-time line also works on a JSON category axis, placed at the label containing a chosen text (e.g. "now")


### 0.82.6 (2026-10-13)
- Advanced chart - optional vertical line marking the current time, with a freely selectable colour
- Thermostat - on the round-scale layout, dragging the dial by touch now follows the finger instead of stopping after one step, and setting the temperature no longer triggers the widget click action ([#776](https://github.com/hdering/ioBroker.aura/issues/776))
- Timer - the datapoint picker now opens for the second switched datapoint too ([#777](https://github.com/hdering/ioBroker.aura/issues/777))


### 0.82.5 (2026-10-13)
- Settings - the guidelines page explains why the frontend hides the lines while "Fill window width" is on
- Status overview - classic HomeMatic battery devices (window contacts, handles, smoke detectors …) now show "battery low"; mains actuators stay out, one row per device
- Status overview - remembered batteries imported by their full datapoint id are now picked up by the widget (snooze, recheck, quiet entries)
- 🌟 **New feature:** Timer - switch any number of datapoints with one schedule (e.g. several thermostats), all get the same value ([#774](https://github.com/hdering/ioBroker.aura/issues/774))
- 🌟 **New feature:** Widgets - the background image (Advanced) can come from a datapoint holding a URL, path or Base64 image; the fixed image stays the fallback ([#775](https://github.com/hdering/ioBroker.aura/issues/775))


### 0.82.4 (2026-10-13)
- Status overview - dimmers in the "Light" function now count as lights ("On · 60 %"), and the "Off" row action sets them to 0
- Dynamic list - a list with filters but no entries searches right away instead of waiting for the sync interval; new option to drop entries the filters no longer find


### 0.82.3 (2026-10-13)
- HTML - the whole widget surface can now trigger the click action (e.g. open a popup), selectable via the new Interaction option like on the iFrame widget ([#773](https://github.com/hdering/ioBroker.aura/issues/773))


### 0.82.2 (2026-10-13)
- Status badges - an open window now shows in orange like low battery, and battery, reachability and window each get their own alarm color; with "alert only" each badge shows only while it is itself an alarm; the battery gets a free list of "low" values instead of the invert switch, and all value lists come prefilled with their defaults ([#767](https://github.com/hdering/ioBroker.aura/issues/767))
- Status badges - slider, knob, light, select, date picker and media player get the status datapoints in their settings; the window datapoint is offered for thermostat, room climate and shutter; knob draws the badges and light/select/shutter offer the status icons in the custom layout ([#767](https://github.com/hdering/ioBroker.aura/issues/767))


### 0.82.1 (2026-10-12)
- 🌟 **New feature:** Status badges - optional window datapoint shows an open/closed window badge next to battery and reachability, e.g. on the thermostat; auto-detected from WINDOW_OPEN_REPORTING / WINDOW_STATE ([#767](https://github.com/hdering/ioBroker.aura/issues/767))
- 🌟 **New feature:** iFrame / HTML - new "Height on phone" option: keep the desktop aspect ratio (default), use the grid row height (for responsive pages like Grafana) or a fixed pixel height ([#772](https://github.com/hdering/ioBroker.aura/issues/772))


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


## License

MIT License

Copyright (c) 2026 hdering <aura@dering-online.de>

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


























































































































































































































































































































































































































































































































































































































































































