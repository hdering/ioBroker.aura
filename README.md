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


### 0.47.1 (2026-08-15)
- 🌟 **New feature:** Messages - title and text now render HTML, so a notice can carry a table, a list or emphasis; scripts and event handlers are stripped
- 🌟 **New feature:** Messages - new look options: accent bar, fully filled card, outline or no accent, plus custom colours and text alignment


### 0.47.0 (2026-08-14)
- 🌟 **New feature:** Messages - scripts can raise info, warning and error notices in the dashboard by writing to aura.0.messages.send; they show as toasts in one of nine screen positions, with an optional countdown, forced confirmation, action buttons and a shared history ([#429](https://github.com/hdering/ioBroker.aura/issues/429))
- 🌟 **New feature:** Messages widget - lists the message history with severity, time-range and unread filters; a click opens the full message
- 🌟 **New feature:** Settings - new Admin -> Messages page builds the message JSON from a form, sends a test message and manages the history
- 🌟 **New feature:** Settings - optional message bell in the header showing the number of unconfirmed messages
- 🌟 **New feature:** Conditions - new effect "send a message", so a widget rule can raise a notice without a script
- 🌟 **New feature:** Messages - the Test senden button on the Admin page now shows the message right there instead of only on the dashboard


### 0.46.0 (2026-08-14)
- 🌟 **New feature:** List and dynamic list - name pattern can now read the row label from another datapoint, e.g. `[[{{parent}}.DeviceName]]` ([#524](https://github.com/hdering/ioBroker.aura/issues/524))
- 🌟 **New feature:** List - separators can be added like a datapoint and dragged into place, splitting the list into sections; optional heading with position, font size, colour and rule on/off. Sorting then applies within a section ([#524](https://github.com/hdering/ioBroker.aura/issues/524))


### 0.45.0 (2026-08-14)
- 🌟 **New feature:** Chart (advanced) - new "1 year" and "total" time ranges, selectable in the config and in the frontend range switcher ([#536](https://github.com/hdering/ioBroker.aura/issues/536))
- 🌟 **New feature:** Chart (advanced) - "total" charts everything the history adapter holds; the window start is detected per series instead of being configured ([#536](https://github.com/hdering/ioBroker.aura/issues/536))
- 🌟 **New feature:** Chart (advanced) - consumption series accept time unit "Automatic", deriving hour/day/month/year buckets from the active time range, plus a new "Per year" unit ([#536](https://github.com/hdering/ioBroker.aura/issues/536))
- 🌟 **New feature:** Chart (advanced) - time ranges beyond two months no longer lose data points to the query row limit
- 🌟 **New feature:** Conditions - new "Reload widget" effect: embedded content (iframe, camera, image) reloads when the rule fires, including widgets inside an open popup ([#537](https://github.com/hdering/ioBroker.aura/issues/537))
- 🌟 **New feature:** Conditions - new "Has changed" operator matching any new value of a datapoint, so a widget can reload whenever its data source moves ([#537](https://github.com/hdering/ioBroker.aura/issues/537))
- 🌟 **New feature:** Shutter - optional "actual position" datapoint for actuators whose real position lives on a read-only DP (e.g. HmIP-BROLL channel 3) while commands keep going to the controllable one; auto-detect fills it ([#538](https://github.com/hdering/ioBroker.aura/issues/538))


### 0.44.3 (2026-08-13)
- 🌟 **New feature:** Camera - info rows and grid tiles can now switch a datapoint too: a toggle (with optional custom on/off values) or a push button writing a fixed value, both with an optional icon and confirmation prompt ([#535](https://github.com/hdering/ioBroker.aura/issues/535))


### 0.44.2 (2026-08-12)
- fix(status-overview): show full device name in card and minimal layouts


### 0.44.1 (2026-08-12)
- 🌟 **New feature:** Popups - transparency and backdrop dim are now configurable, globally under Popups and per popup view or click action ([#534](https://github.com/hdering/ioBroker.aura/issues/534))
- 🌟 **New feature:** Room climate - optional air pressure datapoint, shown next to the humidity with its own icon, unit and decimals ([#531](https://github.com/hdering/ioBroker.aura/issues/531))


### 0.44.0 (2026-08-12)
- 🌟 **New feature:** The name of every widget, and the popup heading, resolve [[dp.id]] to that datapoint's live value, e.g. "Living room [[0_userdata.0.Temp]] °C"
- Popup heading now also resolves the {{dp}} / {{parent}} / {{name}} placeholders - for a list row against the clicked row, so one heading serves every row
- 🌟 **New feature:** Dynamic list - second line with additional datapoints, either per entry or as one template for every row via {{parent}} / {{dp}} / {{name}} placeholders, e.g. {{parent}}.BATTERY
- 🌟 **New feature:** Dynamic list - template rows whose datapoint a device does not have are left out instead of showing a dash
- 🌟 **New feature:** List and dynamic list - own display filters instead of just "only active / only inactive": rules with operator and value on the main datapoint, on the extra datapoints of the second line or on both, combined with AND/OR and offered by name in the filter menu
- 🌟 **New feature:** List and dynamic list - the filter value can be picked from the values the configured datapoints currently hold, and the editor shows live how many entries a filter matches
- 🌟 **New feature:** List and dynamic list - free-text search in the filter menu, matching the row name, the datapoint id and every value of a row


### 0.43.3 (2026-08-11)
- 🌟 **New feature:** Custom layout - column widths can now be set to "auto" (as wide as the content) instead of a ratio, so icon/title columns stay in place when the widget is rendered full-width on mobile
- Static and dynamic list - display-only value conversion (presets such as Wh to kWh, or a custom factor/offset) and time/date formatting, configurable per datapoint or list-wide, just like the value widget
- Static list, dynamic list and status overview - "row click" now defaults to "off": rows stay inert until a popup or navigation action is picked
- Manage datapoints - the datapoint id of the selected entry is shown in the same roomy field the value widget uses, instead of a cramped one-line strip; in the dynamic list the full path now wraps instead of being cut off
- 🌟 **New feature:** Static list - every row can show additional datapoints in a second line, each placed left, centre or right with its own label, icon, unit, decimals, font size and colour; datapoints of the same device are offered as a dropdown


### 0.43.2 (2026-08-11)
- 🌟 **New feature:** Lists - the row popup title can now be set per datapoint (and its title bar hidden), overriding the list-wide setting ([#524](https://github.com/hdering/ioBroker.aura/issues/524))
- 🌟 **New feature:** Lists - new "Eingabefeld" display type per datapoint, with the same options as the Eingabefeld widget (placeholder, field width, text/number, live or confirmed submit, send button, clear after send, confirmation, text alignment, read-only) ([#524](https://github.com/hdering/ioBroker.aura/issues/524))


### 0.43.1 (2026-08-11)
- iFrame/Camera - embedded pages no longer show a permanent scrollbar on desktop when interaction is set to "click action only" ([#529](https://github.com/hdering/ioBroker.aura/issues/529))
- Camera - HTML streams now offer the same interaction setting as the iFrame widget (click action / operable content) ([#529](https://github.com/hdering/ioBroker.aura/issues/529))
- Connected devices - devices that never finished registering (missing navigate and popup datapoints) now complete their object tree automatically on the next connect ([#532](https://github.com/hdering/ioBroker.aura/issues/532))
- Connected devices - "last seen" is now refreshed on every connect instead of only at first registration ([#532](https://github.com/hdering/ioBroker.aura/issues/532))
- List / Dynamic list / Status overview - a row click now opens the datapoints of the clicked device by default (same branch, relevant datapoints only); the previous role-based popup is still available as "Automatisch" ([#524](https://github.com/hdering/ioBroker.aura/issues/524))


### 0.43.0 (2026-08-10)
- 🌟 **New feature:** Lists and status overview - clicking a row now opens a detail popup for that datapoint: picked automatically from the datapoint's role, or configured per row (widget popup, jump to another tab, all datapoints of the device). Datapoints moved into a dedicated resizable dialog with the entry list next to a sectioned per-entry editor, the options panel is grouped into collapsible sections, and the datapoint search of the dynamic list now finds alias.0.* datapoints ([#524](https://github.com/hdering/ioBroker.aura/issues/524))


### 0.42.7 (2026-08-08)
- Camera - embedded streams (go2rtc and friends) reload when the device wakes from display standby instead of stopping on a play button; new "Reload after standby" option, on by default ([#526](https://github.com/hdering/ioBroker.aura/issues/526))
- iFrame - new "Reload after standby" option reloads embedded videos and streams after display standby, overriding "Keep alive" ([#526](https://github.com/hdering/ioBroker.aura/issues/526))


## License

MIT License

Copyright (c) 2026 Hermann Dering <aura@dering-online.de>

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.











































































































































































































































































































































































































































































































































