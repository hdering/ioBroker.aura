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

### 0.49.1 (2026-08-24)
- Static & dynamic list - title alignment (left/centre/right) now actually moves the header title ([#575](https://github.com/hdering/ioBroker.aura/issues/575))
- Dynamic list - the frontend filter chip can be hidden, like the static list already could ([#575](https://github.com/hdering/ioBroker.aura/issues/575))


### 0.49.0 (2026-08-24)
- 🌟 **New feature:** Dynamic list - the custom category filter now names the category in the closed field ("Floors: Upper floor, Attic"), so identically named entries from different categories stay distinguishable ([#568](https://github.com/hdering/ioBroker.aura/issues/568))
- Frontend design - a theme picked for a whole layout is now applied in the frontend; before that only per-section overrides had any effect ([#573](https://github.com/hdering/ioBroker.aura/issues/573))
- Frontend design - the header light/dark button and the themeMode.frontend datapoint now switch the *mode* only: a design that already matches the requested brightness is kept, and the configured design is no longer overwritten for good ([#573](https://github.com/hdering/ioBroker.aura/issues/573))
- Frontend design - the theme presets are greyed out with a hint while "theme follows browser" is on, and the admin says when a light/dark mode datapoint replaces the picked design ([#573](https://github.com/hdering/ioBroker.aura/issues/573))
- Status overview - the "All clear" message is now shown in the card and minimal layouts too; before that they stayed empty when nothing needed attention, and it can now be switched off entirely
- 🌟 **New feature:** Calendar - new option "adjust height to content": the widget grows with its entries instead of filling a fixed cell height, like the status overview
- 🌟 **New feature:** HTML and value widget - placeholders can now calculate: vis-style operation chains {id;round(1)}, named variables {a:id1;b:id2;a * b} and inline {{ ... }} expressions with Math functions, comparisons and filters ([#571](https://github.com/hdering/ioBroker.aura/issues/571))
- 🌟 **New feature:** HTML and value widget - the .ts / .lc suffixes render a datapoint's update and last-change timestamp, e.g. {id.lc;date(HH:mm)} ([#571](https://github.com/hdering/ioBroker.aura/issues/571))


### 0.48.4 (2026-08-22)
- Chart (advanced) - consumption/yield bars are now labelled by their own period on the time axis; a yearly bar no longer shows stray day numbers left and right of the year, and the tooltip names the period instead of the second it starts at ([#570](https://github.com/hdering/ioBroker.aura/issues/570))
- 🌟 **New feature:** Switch widget and custom layout - a switch can take its state from a separate status datapoint, so devices that split command and status (e.g. MQTT/Tasmota plugs with cmnd/stat) show the real state and label while switching still writes to the command datapoint; the switch widget (all layouts) and the switch, status text and status icon cells now also recognise the string "on", stop reading "OFF"/"false"/"0" as on, and can compare the state against any value ([#567](https://github.com/hdering/ioBroker.aura/issues/567))


### 0.48.3 (2026-08-22)
- 🌟 **New feature:** Custom layout - switch cells in button mode can now carry separate captions, background and text colours for ON / true / 1 and OFF / false / 0
- 🌟 **New feature:** Dynamic list - the datapoint search can now filter by custom enum categories (e.g. enum.floors); floors that hold rooms resolve down to the datapoints of those rooms, and a category that carries its members directly can be picked as a whole ([#568](https://github.com/hdering/ioBroker.aura/issues/568))
- 🌟 **New feature:** Advanced chart - new "Show percentage share of the stack" option labels each stacked value with its share of the stack total, alone or in brackets behind the value, and adds it to the tooltip ([#569](https://github.com/hdering/ioBroker.aura/issues/569))
- 🌟 **New feature:** HTML - the HTML code can now contain live datapoint placeholders: {any.dp.id} for any state, {dp} for the widget's own value datapoint, both with an optional JSON path ({dp}#battery.soc); placeholders are also filled in HTML that comes from a datapoint


### 0.48.2 (2026-08-21)
- 🌟 **New feature:** List and dynamic list - a row can now be a date picker: the new display type offers the same options as the Date picker widget (native pickers or a token pattern, time only, output format) and writes the picked value to the row's datapoint ([#566](https://github.com/hdering/ioBroker.aura/issues/566))
- Popups - the built-in popup views (dimmer, thermostat, switch, shutter, media player) are no longer set up in new installations; existing setups keep theirs unchanged, and Admin -> Popups can now remove the ones nothing uses
- Popups - a widget type default set to "no view" now stays that way after a reload instead of falling back to the built-in popup


### 0.48.1 (2026-08-20)
- Theme - reloading no longer flashes the previous theme before the datapoint-driven dark/light mode is applied


### 0.48.0 (2026-08-20)
- Chart (advanced) - y-axis bounds from a JSON datapoint are now found when the payload is wrapped in an array, min/max written the wrong way round are swapped, and the editor shows the accepted JSON shapes plus the paths that hold an array ([#550](https://github.com/hdering/ioBroker.aura/issues/550))
- Chart (Distribution) - the stacked bar now fills its full height with small readings too; totals below 1 (e.g. 0.01 + 0.04 + 0.02 kWh) used to shrink the bar to a sliver and clip the segment percentages ([#560](https://github.com/hdering/ioBroker.aura/issues/560))
- Chart (Distribution) - new "consumption/yield (increase)" aggregation for counters: it sums the increase over the period, so day counters that reset to 0 at midnight (sourceanalytix currentDay, PV day yield) add up instead of turning negative under "difference" ([#561](https://github.com/hdering/ioBroker.aura/issues/561))
- Chart (advanced) - the "consumption/yield (increase)" aggregation showed far too low values for the year and total ranges: a day counter's midnight reset was mistaken for a stray reading, which dropped every day that reached the previous day's level, and ranges over roughly four months were fetched too coarsely to see the daily resets at all ([#562](https://github.com/hdering/ioBroker.aura/issues/562))
- 🌟 **New feature:** Map - a quick-access chip can now be filled with its colour instead of showing it as a thin border only, switchable per chip ([#563](https://github.com/hdering/ioBroker.aura/issues/563))
- Popups - popups no longer disappear or fall back to a weeks-old state: loading the built-in popups marked the browser as having unsaved changes, so that browser stopped pulling the current popup configuration and pushed its own outdated copy back over it on the next admin visit
- Popups - a built-in popup you edited yourself is no longer reset to the shipped version when an update ships a new revision of it; use "Reset" in Admin - Popups to pull the new version on purpose
- Popups - editing a timer or syncing a dynamic list in the frontend no longer writes that browser's theme, group and popup configuration back to ioBroker along with the dashboard
- 🌟 **New feature:** Map - the map type can now be switched in the running frontend: optional chips over the map, placed in any corner, offering all or only the selected types ([#564](https://github.com/hdering/ioBroker.aura/issues/564))
- Settings - the automatic backups no longer fill up with one entry per editor visit: opening the editor rewrote the group and preset data every time, so the older backups worth restoring were pushed out of the list
- Groups and widget presets changed on another device now reach an already open editor again instead of being ignored until the next save
- 🌟 **New feature:** Settings - the number of automatic backups to keep now goes up to 100 (was 20) and defaults to 20 instead of 5, so a config problem noticed days later can still be rolled back


### 0.47.14 (2026-08-19)
- Mirror - every widget type can be mirrored now; the menu widget reported an unknown type
- Menu - a mirrored menu shows the layout being edited instead of the first one
- Advanced chart - stacked areas are now filled with the colour you picked instead of a paler mix with the background ([#557](https://github.com/hdering/ioBroker.aura/issues/557))
- 🌟 **New feature:** Advanced chart - new "Area opacity" option per series sets the fill strength of its area ([#557](https://github.com/hdering/ioBroker.aura/issues/557))
- 🌟 **New feature:** Chart & Climate - new "Horizontal grid lines" option draws helper lines at the y values, like in the advanced chart ([#558](https://github.com/hdering/ioBroker.aura/issues/558))
- List - the "+/-" display now colours its value with the configured colour scale ([#559](https://github.com/hdering/ioBroker.aura/issues/559))
- Value, Dimmer, Shutter, Thermostat & List - colour scales no longer depend on the order the thresholds were entered in ([#559](https://github.com/hdering/ioBroker.aura/issues/559))
- List - the global colour scale now sits in "Werte & Farben" next to the other list-wide colours ([#559](https://github.com/hdering/ioBroker.aura/issues/559))


### 0.47.13 (2026-08-18)
Release v0.47.13


### 0.47.12 (2026-08-18)
- 🌟 **New feature:** Advanced chart - the JSON datapoint may carry a min/max block that scales the Y axis ([#550](https://github.com/hdering/ioBroker.aura/issues/550))
- Advanced chart - Y axis min and max can be read from datapoints, in every mode ([#550](https://github.com/hdering/ioBroker.aura/issues/550))


### 0.47.11 (2026-08-18)
- Chart (advanced) - the current value can be taken from the first instead of the last data point, and shown on the left or the right ([#549](https://github.com/hdering/ioBroker.aura/issues/549))


### 0.47.10 (2026-08-18)
- Advanced chart - the consumption aggregation now also handles counters that reset every day, e.g. a PV day yield ([#545](https://github.com/hdering/ioBroker.aura/issues/545))


### 0.47.9 (2026-08-18)
- Chart (advanced) - axis labels and the gauge readout now follow the configured decimal places ([#548](https://github.com/hdering/ioBroker.aura/issues/548))


### 0.47.8 (2026-08-18)
- Date picker - custom patterns without a native field (e.g. `yyyy`, `dd.MM`) now open a picker list of their own instead of only accepting typed input
- 🌟 **New feature:** Shutter - slat tilt for venetian blinds and external blinds: its own datapoint with value range and inversion, a vertical regulator beside the blind graphic (left or right), step buttons or a popover in the flat layouts, and an option for whether the slats already follow the regulator while dragging ([#547](https://github.com/hdering/ioBroker.aura/issues/547))
- 🌟 **New feature:** Messages - unanswered messages now survive a page reload: per severity (errors by default) they reappear until someone confirms or closes them on any device


### 0.47.7 (2026-08-17)
- Messages - editing the presentation defaults under Admin -> Messages now activates the Save button instead of writing every keystroke straight to the instance; Undo restores the stored values
- 🌟 **New feature:** Messages - the send time can now be shown on the message card: pick the default under Admin -> Messages (clock, or date plus clock), and override it per message with `showTime` / `timeFormat`


### 0.47.6 (2026-08-17)
- 🌟 **New feature:** Advanced chart - stacked areas are drawn without an outline, so a series sitting at 0 no longer looks like a line; the outline can be switched back on per series, and line width can now be set to 0 ([#541](https://github.com/hdering/ioBroker.aura/issues/541))
- 🌟 **New feature:** Advanced chart - the right Y axis can be left unlabelled while still scaling its series, and the axis labels now take exactly the width they need instead of a fixed strip, so short labels no longer leave an empty band and long ones are no longer cut off ([#541](https://github.com/hdering/ioBroker.aura/issues/541))
- Date picker - a "HH:mm" field can now be picked in every browser: it always shows a button, and where the browser has no time picker of its own (Firefox) an hour/minute list opens instead of nothing; applies to the widget, custom layout cells and the timer event editor ([#544](https://github.com/hdering/ioBroker.aura/issues/544))


### 0.47.5 (2026-08-16)
- 🌟 **New feature:** Advanced chart - new option to show the values at the data points, now available in the JSON and timeseries modes as well ([#543](https://github.com/hdering/ioBroker.aura/issues/543))


### 0.47.4 (2026-08-16)
- 🌟 **New feature:** Status overview - new "text alignment" setting (left / centered / right) for rows, cards and the Minimal layout's pills
- 🌟 **New feature:** Chart (simple and advanced) - display-only value conversion, set with the fx button next to the datapoint field: presets like W to kW or Wh to kWh, or a custom factor and offset. The simple chart converts curve, current value, average and axis; the advanced one converts per series and fills in the unit of the axis the series belongs to. The datapoint and its history stay untouched ([#540](https://github.com/hdering/ioBroker.aura/issues/540))
- 🌟 **New feature:** Chart (advanced) - new "stack" switch per series: stacked series add up instead of overlapping, e.g. battery discharge plus grid draw as bands that together make up the house consumption. Left and right y axis stack separately, a stacked axis starts at zero, and the tooltip adds a total line next to the individual values ([#541](https://github.com/hdering/ioBroker.aura/issues/541))
- 🌟 **New feature:** Gauge - the value no longer sits under the needle hub, its font size is configurable, and it can be shown as a badge below the arc instead of (or next to) the big number - with its own label, like pointers 2 and 3. Each of the three pointers can now optionally take the colour of the zone its own value falls into ([#539](https://github.com/hdering/ioBroker.aura/issues/539))


### 0.47.3 (2026-08-15)
- 🌟 **New feature:** Messages - can now be sent with sendTo('aura.0','notify',{...}) as well; the call answers with the assigned id, and notifyAck / notifyDismiss confirm or close a message from a script ([#429](https://github.com/hdering/ioBroker.aura/issues/429))
- 🌟 **New feature:** Settings - Admin -> Messages now shows ready-to-copy setState and sendTo lines for the message you just built, plus a reference of every message datapoint ([#429](https://github.com/hdering/ioBroker.aura/issues/429))


### 0.47.2 (2026-08-15)
- Messages - height now sets the card height instead of only capping it, and content taller than the card scrolls rather than being cut off


## License

MIT License

Copyright (c) 2026 Hermann Dering <aura@dering-online.de>

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
























































































































































































































































































































































































































































































































































