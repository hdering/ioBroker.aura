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

### 0.115.1 (2026-11-14)
- 🐛 **Bug fix:** Group - a mirrored device card or group no longer scrolls inside a group on phones and tablets ([#988](https://github.com/hdering/ioBroker.aura/issues/988))


### 0.115.0 (2026-11-13)
- 🌟 **New feature:** Editor - arrange mode on touch devices: tap a widget, drag its grip to move it and its corner to resize it on tablets and phones ([#699](https://github.com/hdering/ioBroker.aura/issues/699))
- 🌟 **New feature:** Editor - a short note when "scale like the frontend" is switched on, explaining that the shown heights follow the preview while the design grid is saved


### 0.114.2 (2026-11-13)
- 🌟 **New feature:** Group / Device card - new "No frame" option: no background, border or inner spacing, the widgets inside sit on the tab grid with the same edges and height as outside ([#981](https://github.com/hdering/ioBroker.aura/issues/981))
- 🌟 **New feature:** Editor - resizing a widget shows its live size (grid cells and px) ([#981](https://github.com/hdering/ioBroker.aura/issues/981))
- 🌟 **New feature:** Editor - nested groups without a header (e.g. a device card in a group) no longer stack their toolbars: the innermost one is shown, a button switches to the parent, and each level has its own colour ([#981](https://github.com/hdering/ioBroker.aura/issues/981))
- 🐛 **Bug fix:** Editor - a widget menu opened inside a group or device card now closes on a click into an empty spot of the group ([#981](https://github.com/hdering/ioBroker.aura/issues/981))
- 🌟 **New feature:** Editor - new toolbar switch "Scale like the frontend": with the fluid grid the editor shows the widgets stretched exactly as the frontend does on the guidelines' target size; positions are still stored in grid cells ([#981](https://github.com/hdering/ioBroker.aura/issues/981))


### 0.114.1 (2026-11-13)
- 🐛 **Bug fix:** Editor - dragging a widget no longer stutters: the grid library is back on the smooth version (react-grid-layout 2.2.4), its text is not selected any more, picking a widget up no longer restyles the whole page, widgets making room jump to their place instead of gliding, dropping no longer re-renders every widget on the page, the admin editor no longer re-renders four times a second while idle, and returning to the browser window no longer re-reads every datapoint while the first drag runs ([#982](https://github.com/hdering/ioBroker.aura/issues/982))


### 0.114.0 (2026-11-13)
- 🐛 **Bug fix:** Datapoints - object names of timers, status overview and published lists are now English, and popup.close is a write-only button
- 🐛 **Bug fix:** Security - the built-in proxy (iframes, HTTP requests, feeds) no longer reaches services on the ioBroker host itself (localhost) or link-local addresses, and proxy and file routes refuse requests from foreign web pages; LAN devices stay reachable - use the LAN IP instead of localhost
- 🐛 **Bug fix:** Countdowns, announcements, status overview and published lists - a command to a device datapoint (not yet confirmed by its adapter) no longer counts as a value; script datapoints under 0_userdata and javascript still count right away
- 🐛 **Bug fix:** Client datapoints - reported values (lastSeen, screen resolution, idle.active, idle.enabled, speech.playing) are now read-only, and the auto-return and idle delays use the role level.timer
- 🌟 **New feature:** Instance settings - all texts of the adapter configuration are now available in all eleven admin languages
- 🐛 **Bug fix:** Speech output - SayIt's default browser instance FFFFFFFF now plays on every dashboard instead of on none
- 🐛 **Bug fix:** Widget editor - a right-click in a field of the edit dialog (e.g. the datapoint field) no longer closes the dialog; the browser's copy/paste menu opens instead
- 🌟 **New feature:** Tab bar / section bar - when the active tab or section changes (swipe, address, auto-return, click), a scrolling bar now centres it; on page load without animation, a bar moved by hand stays put until the active entry changes; the active entry carries aria-current ([#979](https://github.com/hdering/ioBroker.aura/issues/979))
- 🌟 **New feature:** Shutter and thermostat - optional security prompt (Behavior › Sicherheitsabfrage): every drive, slat change or setpoint change asks first and shows the target (e.g. "Close", "40% open", "21.5 °C"); Stop never asks, and the sliders then always send on release ([#977](https://github.com/hdering/ioBroker.aura/issues/977))
- 🌟 **New feature:** Web components - the "add widget" dialog also lists the components of adapters that are not installed yet, with name and picture from the repository (adapters with @iobroker/web-components 0.8 or newer)


### 0.113.3 (2026-11-12)
- 🐛 **Bug fix:** PIN protection - the "Editable via MCP" switch no longer turns itself off when the dashboard is saved, and a protected view no longer answers "wrong PIN" after a save that held it only as a locked placeholder
- 🐛 **Bug fix:** PIN protection - a tab the MCP added to a protected area no longer disappears when the admin editor saves before it has loaded that tab
- 🐛 **Bug fix:** Admin settings - the "Reachable on" option and its web-instance hint are now translated into all admin languages


### 0.113.2 (2026-11-12)
- 🐛 **Bug fix:** Web components - after an adapter update the browser loads the new files of its components instead of cached ones ([#954](https://github.com/hdering/ioBroker.aura/issues/954))
- 🐛 **Bug fix:** Thermostat - with a Homematic MANU_MODE datapoint the widget now shows the setpoint from SET_TEMPERATURE, so changes made on the device itself appear ([#973](https://github.com/hdering/ioBroker.aura/issues/973))
- 🌟 **New feature:** Timer and group actions - optional delay between target datapoints, so e.g. several shutters start one after another instead of all at once; the adapter runs the sequence and stop always acts on all at once ([#974](https://github.com/hdering/ioBroker.aura/issues/974))
- 🌟 **New feature:** Web components - settings of type selectSendTo and autocompleteSendTo (@iobroker/web-components 0.8) show the choices the adapter returns instead of a plain text field, e.g. the location of openmeteo-notify ([#975](https://github.com/hdering/ioBroker.aura/issues/975))


### 0.113.1 (2026-11-11)
- 🐛 **Bug fix:** PIN-protected sections - an unlocked view now picks up changes made via MCP (edited widgets, new tabs) without a page reload


### 0.113.0 (2026-11-11)
- 🌟 **New feature:** Adapter logs - all five ioBroker log levels (Silly, Debug, Info, Warn, Error) can be filtered separately; Silly entries no longer appear under Debug ([#969](https://github.com/hdering/ioBroker.aura/issues/969))
- 🌟 **New feature:** Adapter logs - adjustable font size for the log table ([#970](https://github.com/hdering/ioBroker.aura/issues/970))
- 🌟 **New feature:** Adapter status - adjustable font size and larger restart/update buttons with bigger touch targets ([#971](https://github.com/hdering/ioBroker.aura/issues/971))
- 🌟 **New feature:** Layouts - flow columns can be filled by height (masonry) or compactly with as few columns as needed, centred; columns are only re-dealt when a tab opens or the window width changes ([#939](https://github.com/hdering/ioBroker.aura/issues/939))


### 0.112.1 (2026-11-10)
- 🐛 **Bug fix:** MCP - a tab created in a PIN-protected section now goes into the PIN vault when the section is released for MCP editing, and is refused otherwise; the editor and "remove PIN" no longer drop tabs that exist only in the tab bar


### 0.112.0 (2026-11-10)
- 🌟 **New feature:** List - shutter rows get a button size option, like the Rollladen widget ([#943](https://github.com/hdering/ioBroker.aura/issues/943))
- 🐛 **Bug fix:** Web component - Aura draws the title, the component no longer adds its own second title (e.g. the name of the cameras' RTSP picture)
- 🌟 **New feature:** Web component - title and icon can come from the component instead of the widget (Title from / Icon from)
- 🌟 **New feature:** Web component - new option "Click on the component" (Off / Component): off by default - a click belongs to the widget and runs its normal click action; interactive components (e.g. calendar) need "Component"
- 🌟 **New feature:** Web component - dialogs of a component open as a popup of the widget and follow its popup options (size, fullscreen, look)
- 🐛 **Bug fix:** Adapter status - available updates follow the active repository: after switching back from Beta to Stable the Beta updates disappear right away instead of staying until admin's next repository check ([#962](https://github.com/hdering/ioBroker.aura/issues/962))


### 0.111.1 (2026-11-10)
- 🌟 **New feature:** Web components - dialogs of a component (a form or its own content) open in Aura's popup style instead of the browser dialog, full width on phones ([#957](https://github.com/hdering/ioBroker.aura/issues/957))
- 🌟 **New feature:** AI access (MCP) - new tool aura_web_components lists the installed web components with their tag, adapter, name, size and settings, so an AI can build web component widgets without guessing ([#956](https://github.com/hdering/ioBroker.aura/issues/956))
- 🐛 **Bug fix:** Web components - after an ioBroker restart or an adapter update the list of components no longer stays incomplete until the page is reloaded


### 0.111.0 (2026-11-09)
- 🌟 **New feature:** Timer - switching times are listed in ascending order of time instead of order of entry ([#960](https://github.com/hdering/ioBroker.aura/issues/960))
- 🐛 **Bug fix:** Web components - a component that subscribes to datapoints with a wildcard (e.g. `assistant-satellite.0.*`) now gets their changes ([#955](https://github.com/hdering/ioBroker.aura/issues/955))
- 🌟 **New feature:** Web components - a component can watch every object of a pattern (e.g. events of the calendar adapter); a component that throws in its object callback no longer breaks the object updates of the others ([#953](https://github.com/hdering/ioBroker.aura/issues/953))
- 🌟 **New feature:** Section menu - tabs can be listed as sub-entries under each section (collapsible or always open, per layout with a per-section override); a tap opens the tab directly ([#951](https://github.com/hdering/ioBroker.aura/issues/951))
- 🌟 **New feature:** Web components - own highlighted group "Web components" in "New widget" (tested, untested and missing-adapter entries plus "Other web component …") and in the widget type list; the edit dialog shows the component, its adapter and version; the fullcalendar calendar is now a tested component


### 0.110.0 (2026-11-08)
- 🌟 **New feature:** Advanced chart - a series can get its own y scale (e.g. valve position 0-100 % next to temperatures), hidden or shown on the far left or right in the series colour ([#959](https://github.com/hdering/ioBroker.aura/issues/959))
- 🌟 **New feature:** Advanced chart - reference lines and bands at a fixed value or a datapoint value (e.g. setpoint, comfort range), with label and value ([#959](https://github.com/hdering/ioBroker.aura/issues/959))


### 0.109.1 (2026-11-08)
- 🐛 **Bug fix:** Values written by widgets now follow the datapoint type - e.g. a shutter command "1" reaches a string datapoint (Mediola gateway) as text instead of being rejected as a number


### 0.109.0 (2026-11-08)
- 🌟 **New feature:** Dynamic list / status overview - name rules: a typed ">" now also matches the "›" separator, plus one-click presets "device only", "datapoint only" and "› to space" ([#950](https://github.com/hdering/ioBroker.aura/issues/950))
- 🌟 **New feature:** evcc - selectable power unit: kW (default), W or automatic (W below 1000 W) ([#947](https://github.com/hdering/ioBroker.aura/issues/947))


### 0.108.0 (2026-11-07)
- 🐛 **Bug fix:** PIN-protected tabs and sections can show their conditions and markers while locked - new option "Show markers and conditions while locked" in the PIN settings ([#944](https://github.com/hdering/ioBroker.aura/issues/944))
- 🐛 **Bug fix:** Mirror - a mirrored widget now shows its source's conditions, markers and click action; settings of the mirror itself still take precedence ([#945](https://github.com/hdering/ioBroker.aura/issues/945))
- 🐛 **Bug fix:** Web component - the flow diagram now updates as soon as it is changed and saved in the Flow tab of admin, without reloading the page ([#946](https://github.com/hdering/ioBroker.aura/issues/946))
- 🌟 **New feature:** Charts - pick a free date range from-to in the paging bar (e.g. a holiday); arrows page by its own length, linked charts follow, and an optional end datapoint makes it scriptable ([#931](https://github.com/hdering/ioBroker.aura/issues/931))
- 🌟 **New feature:** Charts - optionally return to the configured range and current date after N minutes without use, for wall tablets; linked charts follow ([#932](https://github.com/hdering/ioBroker.aura/issues/932))
- 🐛 **Bug fix:** Charts - windows up to 3 hours no longer break off for datapoints that log every few seconds; when the raw values exceed 1000 rows, the chart now fetches them in fine steps
- 🌟 **New feature:** Charts - computed series from several datapoints with a formula (e.g. voltage x current, sum of three meters); inputs logged on change keep their last value, works with delta bars and the previous-year comparison, plus a new period value "area over time" (W to Wh) for any series ([#930](https://github.com/hdering/ioBroker.aura/issues/930))
- 🐛 **Bug fix:** Menu - the header settings now work: title and icon can be shown above the menu entries (off by default, so existing menus stay unchanged) ([#949](https://github.com/hdering/ioBroker.aura/issues/949))
- 🌟 **New feature:** JSON table - the last row can be shown as a highlighted footer (e.g. a sum row) with its own colours, bold/italic and pinned to the bottom; it stays in place when sorting, searching or limiting rows. Header and footer settings now live together under Look ([#938](https://github.com/hdering/ioBroker.aura/issues/938))
- 🌟 **New feature:** Collapsible widgets - when expanded, the title row looks like the folded header (chevron in front, icon and title in the same place, same weight) and a click on it folds the widget again; switches and buttons in the row keep their own click ([#941](https://github.com/hdering/ioBroker.aura/issues/941))


### 0.107.0 (2026-11-06)
- 🌟 **New feature:** Map - own tile server is a regular map type again: URL template, min/max zoom as hard limits and attribution, e.g. for offline installs with a local tile cache ([#934](https://github.com/hdering/ioBroker.aura/issues/934))
- 🌟 **New feature:** Map - recorded tracks get the chart's time controls: range chips, paging by the active range, and linking with charts via link group or date/range datapoints; long tracks are simplified (Douglas-Peucker) instead of cut to the newest points ([#929](https://github.com/hdering/ioBroker.aura/issues/929))


### 0.106.2 (2026-11-06)
- 🐛 **Bug fix:** List / dynamic list - display "Auto" no longer shows a number datapoint as a switch while it reads 0 or 1
- 🐛 **Bug fix:** Camera - snapshot refresh no longer blanks the picture; the previous image stays until the next one has loaded


### 0.106.1 (2026-11-06)
- 🐛 **Bug fix:** Section menu / tab bar - datapoint, clock and text elements in a docked section bar or the tab bar no longer stick together; they get the same spacing as in the header. In the docked section bar the element position is now labelled left / right instead of top / bottom


## License

MIT License

Copyright (c) 2026 hdering <aura@dering-online.de>

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.








































































































































































































































































































































































































































































































































































































































































































































