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

### 0.52.5 (2026-09-01)
- Chart (advanced) - in "manage datapoints" the mode is picked on its description card (the duplicate button row is gone), and the JSON mode is now called "Categories (JSON)" to tell it apart from a time series with a JSON data source
- Chart (advanced) - a JSON series whose labels are no timestamps no longer fails silently in a time series: the empty chart and the series editor both name the reason, and the editor offers to switch to "Categories (JSON)"


### 0.52.4 (2026-09-01)
- Chart (advanced) - a JSON series now shows the accepted JSON shapes right under its datapoint, unfolded until the payload could be read


### 0.52.3 (2026-09-01)
- Settings - MCP fields are only shown when MCP is enabled, and the token is no longer displayed in clear text ([#610](https://github.com/hdering/ioBroker.aura/issues/610))
- Settings - the MCP token is now stored encrypted; a hand-typed token has to be entered once more after this update ([#610](https://github.com/hdering/ioBroker.aura/issues/610))


### 0.52.2 (2026-09-01)
- 🌟 **New feature:** Calendar - each calendar source can carry its own icon, shown in front of its entries ([#608](https://github.com/hdering/ioBroker.aura/issues/608))
- 🌟 **New feature:** Calendar - optional calendar week, printed at the first entry of every week ([#608](https://github.com/hdering/ioBroker.aura/issues/608))
- 🌟 **New feature:** Calendar - multi-day events can be shown as one entry per day ([#608](https://github.com/hdering/ioBroker.aura/issues/608))


### 0.52.1 (2026-09-01)
- AI assistant (MCP, beta) - two new tools aimed at the same thing: dashboards that use what AURA can do. aura_recipes hands the model finished, valid widgets for the jobs that come up - a room as one list instead of a row of value tiles, a counter as consumption bars, a tile with colour thresholds and conditions, a status overview, a thermostat dial, a whole room tab. aura_review goes the other way and looks over a tab that already exists, naming what would make it better: tile rows that belong in one list, numbers with no good or bad range, a meter shown as its raw reading, a bar chart without an aggregation, a list with no second line - each finding names the widgets and the recipe that fixes it, and stays a suggestion. On top of that the instructions now send the model to a recipe and to an existing tab of the dashboard before it reads the schema, so a generated view no longer comes back as the bare minimum the schema accepts
- Editor - the "AI prompt" dialog now pastes worked examples into the prompt (the same ones the MCP server hands out) and says what a good dashboard looks like, instead of only what is valid JSON. The old wording asked the model to leave options out, which is why generated views came back as bare tiles


### 0.52.0 (2026-09-01)
- 🌟 **New feature:** Sections and tabs can be protected with a PIN - the content only appears once the code was entered, no matter whether the section menu, the tab bar, a widget click action or a bookmarked URL led there. Set per section and per tab in the dashboard editor; a section and a tab inside it sharing the same code ask only once
- Dashboard editor - the section settings popover follows the admin theme again instead of showing up dark, and its marker editor starts collapsed like the tab settings
- 🌟 **New feature:** AI assistant (MCP, beta) - popup views and group children are now first class: every widget command works there too, and a single group tile can be added or changed without rewriting the whole group. New: reorder layouts, sections and tabs, copy or move a widget between tabs and whole tabs, sections, layouts and popup views, reusable widget templates (covered by backups), and a search that finds widgets by datapoint, type or title. Fewer silent failures: parallel edits no longer overwrite each other, an ambiguous widget id or view name is reported instead of guessed, an option written at the wrong level is an error instead of a no-op, deleting a group cleans up its leftover children, and slimmer schema answers keep prompts short


### 0.51.3 (2026-08-31)
- 🌟 **New feature:** Messages - [[dp]] placeholders in a message title or body now read live in the Meldungen widget, the header bell and the admin history, not only on the toast. A message sent by a condition freezes those values when the rule fires, so the archive keeps what the datapoint said at that moment ([#605](https://github.com/hdering/ioBroker.aura/issues/605))
- General - copying a tab, a section or a layout now gives every copied widget (and every group child) a new id, so the widget picker of a click action can tell the copies apart. Dashboards that already hold such twins are repaired on load ([#606](https://github.com/hdering/ioBroker.aura/issues/606))
- 🌟 **New feature:** Carousel - each element can carry its own caption per state, e.g. "Auto" while the datapoint is true and "Manuell" while it is false. Leaving a field empty falls back to the element label ([#603](https://github.com/hdering/ioBroker.aura/issues/603))
- 🌟 **New feature:** Distribution chart and Fill level - a group with a 100 % reference, and a fill level, can now switch to a warning colour once a configurable share is reached. Both cap at full, so an exceeded budget used to look exactly like a met one; the colour now says which it is. The remainder segment keeps its own colour ([#607](https://github.com/hdering/ioBroker.aura/issues/607))
- 🌟 **New feature:** Lists - a row can now be a select field: the dropdown of the select field widget with its full option set - values with text, colour, icon, image or HTML, entries from a JSON datapoint, the current entry as text, icon + text or icon only, and a fixed width. Available in the static and the dynamic list; the value list is shared with the button display, so switching between the two keeps it ([#609](https://github.com/hdering/ioBroker.aura/issues/609))


### 0.51.2 (2026-08-30)
- 🌟 **New feature:** Lists - a condition on a row now reaches every display type and every layout: text size and colour on the switch labels, sensor states, window contacts, sliders, steppers and the date/text fields, and the icon swap/hide in the minimal layout and on a datapoint of the second line ([#601](https://github.com/hdering/ioBroker.aura/issues/601))
- 🌟 **New feature:** Conditions - a condition can now send one message per triggering list row: on a row condition (Datenpunkte verwalten) or on a widget rule watching "one entry" of the list. The message can address the row that triggered with {{dp}} / {{parent}} / {{name}} - e.g. a title of "Motion: [[{{parent}}.NAME]]" ([#605](https://github.com/hdering/ioBroker.aura/issues/605))


### 0.51.1 (2026-08-29)
- Advanced chart - a consumption ("delta") chart no longer runs on past its own data: the time axis used to end half a bucket after the newest reading, leaving an empty strip on the right, and now ends where the data does - so the curve reaches the right edge just as the bars reach the left one ([#598](https://github.com/hdering/ioBroker.aura/issues/598))
- 🌟 **New feature:** Thermostat - new "Rundskala" layout: a 270 dial with a draggable handle, the setpoint in its centre and the +/- buttons in the arc gap; the scale colour is configurable, either fixed or from a colour-threshold scale ([#599](https://github.com/hdering/ioBroker.aura/issues/599))


### 0.51.0 (2026-08-29)
- 🌟 **New feature:** Distribution chart, fill level and gauge - the scale can now come from datapoints instead of fixed numbers: a group takes its 100 % from a datapoint (a prepayment, a budget), the unused part becomes a "Rest" segment and the bar stack direction can be flipped, so the used part sits at the bottom; the gauge min/max datapoints are now offered in the editor at all ([#596](https://github.com/hdering/ioBroker.aura/issues/596))
- Advanced chart - a consumption ("delta") bar series no longer pushes the time axis out past the selected period: the window now opens on the same day/hour boundary the bars sit on, so lines and bars start at the same point instead of the line appearing to begin half a day late ([#598](https://github.com/hdering/ioBroker.aura/issues/598))
- Advanced chart - decimal places and thousands separator moved from the options panel into the "Manage datapoints" dialog, whose tabs now run Mode (with a tip on what each mode is for), Number format, Series, Values - and a single series can override decimals and separator for itself ([#600](https://github.com/hdering/ioBroker.aura/issues/600))
- List / Dynamic list - the row displays caught up with their standalone widgets: the slider brings scale and step, colour, bar look, track size, value / unit / min-max labels, write-on-release and a read-only progress bar; the input field a number range and a multi-line text area; the buttons colour, icon, image or HTML per button, a JSON datapoint as their source and a dropdown for long lists; the shutter a position slider in the row, a feedback datapoint, inverted counting and the slat control; on top of that a value mapping can draw an image per state and compare with an operator, and a window/door contact can show a lock datapoint as a padlock
- List / Dynamic list - the per-datapoint editor now runs Datapoint, Label, Display, Second line, Conditions, Colour thresholds, Behaviour, so the display and its settings sit right below the name
- List / Dynamic list - two display fixes: the dynamic list's "Slider" and "Value" displays now actually render (a slider used to be drawn only when the datapoint name looked like a dimmer), and a switch entry in the card layout now fills its cell with the labelled button instead of keeping the compact toggle
- Dynamic list - the display of the datapoints (switch, slider, value mapping ...) can now be set once for the whole list in the datapoint dialog, including that display's own settings, while a single datapoint can still override it; decimals, thousands separator and the colour scale can now also be set per row instead of only list-wide
- 🌟 **New feature:** Conditions - a rule can now set the text size as well: per element (title / value) in the widget conditions, and in the row rules of both lists, their second line and the custom-layout cells; the field sits above the text colour and empty keeps the configured size
- Slider - the track thickness set in the editor is now applied (the field was written but never read)
- Editor - dialogs no longer open partly off screen after a switch to a smaller resolution: the remembered size is capped to the current window (and kept for the bigger screen), and a dialog can no longer be dragged out of reach


### 0.50.10 (2026-08-28)
- 🌟 **New feature:** Advanced chart - a timeseries chart can now mix history series with JSON datapoint series on one time axis, e.g. measured values plus a solar forecast ([#595](https://github.com/hdering/ioBroker.aura/issues/595))
- 🌟 **New feature:** Advanced chart - mode and series moved into the "Manage datapoints" dialog: series list on the left, the selected series in full detail on the right, global settings stay in the options panel
- 🌟 **New feature:** Advanced chart - switching the mode no longer overwrites the series: a chart with a JSON series kept its data source after a look into another mode and back
- Advanced chart - the value-label default and the stack percentage moved into the "Manage datapoints" dialog (tab "Values"), next to the series they apply to


### 0.50.9 (2026-08-28)
- Advanced chart - leaving the day navigation for a rolling range (7/30 days) no longer keeps the chart framed on that single day ([#594](https://github.com/hdering/ioBroker.aura/issues/594))


### 0.50.8 (2026-08-27)
- 🌟 **New feature:** Dynamic list - one icon for all rows (icon, size and colour), set in the new "Icon" tab of the datapoint dialog; a per-datapoint icon and conditions still override it
- Color picker - dragging a colour no longer freezes the UI: the value now reaches the config at most every 120 ms, with the final one always applied


### 0.50.7 (2026-08-27)
- 🌟 **New feature:** Image - datapoints holding raw SVG markup are now displayed, e.g. the guest WLAN QR code of fb-checkpresence ([#592](https://github.com/hdering/ioBroker.aura/issues/592))
- Image - optional background colour behind the picture, keeps transparent SVGs such as QR codes readable on dark themes ([#592](https://github.com/hdering/ioBroker.aura/issues/592))
- 🌟 **New feature:** Mediaplayer - device detection now recognises any adapter that follows the ioBroker media roles (yamaha, denon, volumio, ...), including its volume range, mute and input ([#593](https://github.com/hdering/ioBroker.aura/issues/593))
- Mediaplayer - play/pause button now reads playback states that are a numbered enum, e.g. a Yamaha receiver reporting 0 = Play ([#593](https://github.com/hdering/ioBroker.aura/issues/593))
- Static and dynamic list - the Switch display now offers the same options as the Switch widget: own write values per state (e.g. 0/255, ON/OFF), a separate status datapoint for devices that split command and feedback, condition-based on/off evaluation and an icon or image instead of the slide toggle ([#591](https://github.com/hdering/ioBroker.aura/issues/591))
- 🌟 **New feature:** Dynamic list - the Switch display now also works for string and enum datapoints and gained the switch style, on/off icons, icon size and confirmation prompt the static list already had ([#591](https://github.com/hdering/ioBroker.aura/issues/591))
- Charts, lists and value display - new "show as negative" option in the value conversion, for figures that are logged as positive but belong below the zero line, such as grid feed-in or battery charging ([#594](https://github.com/hdering/ioBroker.aura/issues/594))
- Advanced chart - consumption bars (delta aggregation) came out as a row of zeros when a negative display factor was set; the counter is now differenced before the sign is applied ([#594](https://github.com/hdering/ioBroker.aura/issues/594))
- Advanced chart - the day navigation gained a date field, so a day can be picked directly instead of stepping there one day at a time ([#594](https://github.com/hdering/ioBroker.aura/issues/594))
- Advanced chart - a bar axis now always includes zero, so bar lengths stay proportional to their values and a series drawn downwards keeps its zero line; pure line charts still fit their own range, and an explicit axis minimum still wins ([#594](https://github.com/hdering/ioBroker.aura/issues/594))
- Advanced chart - horizontal grid lines were missing when every series was assigned to the right y axis ([#594](https://github.com/hdering/ioBroker.aura/issues/594))


### 0.50.6 (2026-08-26)
Release v0.50.6


### 0.50.5 (2026-08-26)
- 🌟 **New feature:** Status overview - rotary handle contacts (HmIP-SRH, HM-Sec-RHS) are now recognised and reported as tilted or open, and the widget shows that data is still loading instead of reporting all-clear before the datapoints are in


### 0.50.4 (2026-08-26)
- Calendar - entries are no longer cut off on the left edge, keep the same spacing left and right, and follow the configured widget padding; the highlight bar of important events is visible again ([#590](https://github.com/hdering/ioBroker.aura/issues/590))
- 🌟 **New feature:** Lists - row conditions can now change the icon size, per datapoint and list-wide, in the static and the dynamic list ([#572](https://github.com/hdering/ioBroker.aura/issues/572))
- 🌟 **New feature:** List - the icon size of a row can now be set per datapoint, not only for the switch display ([#572](https://github.com/hdering/ioBroker.aura/issues/572))


### 0.50.3 (2026-08-25)
- 🌟 **New feature:** Frontend design - tab bar and area menu elements can now be reordered with up/down arrows


### 0.50.2 (2026-08-25)
- 🌟 **New feature:** The installed adapter version is now published as `aura.0.info.version`, so it can be shown anywhere in the frontend


### 0.50.1 (2026-08-25)
- 🌟 **New feature:** Chart (advanced) - values at the data points can be switched per series, and thinned out to every n-th value ([#584](https://github.com/hdering/ioBroker.aura/issues/584))


## License

MIT License

Copyright (c) 2026 Hermann Dering <aura@dering-online.de>

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.














































































































































































































































































































































































































































































































































































