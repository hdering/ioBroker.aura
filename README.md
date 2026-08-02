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

### 0.39.1 (2026-08-02)
- 🌟 **New feature:** Frontend Design - new "Values & Formatting" tab (global scope) holding the global decimals and DP name cleanup settings, which moved here from Settings
- 🌟 **New feature:** Values - new thousands separator for numeric values (off, 1.234,5, 1,234.5, 1 234,5, 1'234.5) with a matching decimal separator; set globally and overridable per widget, cell and list entry
- 🌟 **New feature:** Widget options - unit, decimals and thousands separator now sit together in one row


### 0.39.0 (2026-08-01)
- 🌟 **New feature:** Timestamp datapoints can be shown as time, date or both - in the value display, in custom-layout dp cells and per entry of the static and dynamic list


### 0.38.12 (2026-08-01)
- Image - datapoint values holding an adapter asset path (e.g. /adapter/pirate-weather/icons/...) now render instead of staying blank; same path handling in universal widget cells, JSON table image columns, image popups, state images, switch/window contact images, camera and HTML img tags
- Every image field now lists the accepted path formats (URL, adapter path, ioBroker file, local file, base64) - see the new "Bildpfade" doc page


### 0.38.11 (2026-08-01)
- 🌟 **New feature:** Clock - optional source datapoint: formats a time value from a datapoint (ISO timestamp, HH:mm or Unix time) instead of the current time, with a new REL token for relative output ("in 3 h 12 min")
- evcc - grid power is read again with evcc adapter 0.2.9+ (renamed states status.Grid.Power); optional custom grid power datapoint added
- JSON table - table header stays readable in light mode when the widget is set to transparent
- 🌟 **New feature:** Section menu - separate placement for mobile; a docked sidebar no longer forces the tab bar to stay visible with a single tab


### 0.38.10 (2026-07-31)
- Static list - statistics are shown on the same line as the title instead of a second header row
- Group - the editor now shows the same spacing as the frontend and never shows an inner scrollbar, at any grid row height or gap: children fill the group box in both views, grid settings, header height and fitted height are resolved identically, and a child too small for its own content is clipped the same way in both views
- Group - an empty group no longer collapses to a single grid row in the editor: it keeps its configured height and can be resized until the first child is added
- Group - new groups start wider and taller instead of as a narrow strip; default sizes dialog no longer caps width/height at 12
- 🌟 **New feature:** Settings - every Design card (theme, CSS variables, typography and spacing, grid and mobile, guidelines and resolution, header, section menu, navigation, tab bar) has a "Reset" button that restores the default values, or removes the layout/section overrides in scoped views


### 0.38.9 (2026-07-31)
- 🌟 **New feature:** Chart (Advanced) - new JSON mode: chart a JSON datapoint holding label/value entries, no history adapter needed
- 🌟 **New feature:** Chart (Advanced) - JSON mode can read the label as a timestamp (epoch ms/s or ISO) and draw a real time axis
- 🌟 **New feature:** Chart (Advanced) - JSON mode detects the label and value fields on its own and offers the datapoint's actual keys for picking


### 0.38.8 (2026-07-30)
- Calendar - event list scrolls when more entries are shown than fit the cell; max entries raised to 100
- Calendar - agenda layout aligns all event titles on one edge, whatever the calendar names are; the calendar column width can be set manually


### 0.38.7 (2026-07-30)
- 🌟 **New feature:** Calendar - calendar sources can now come from an ioBroker ical adapter instance or an iCal URL; no URL is required when adding the widget
- Calendar - agenda layout shows the full calendar name instead of cutting it off


### 0.38.6 (2026-07-30)
- Mirror - a mirrored group now shows its full content on mobile instead of only scrolling


### 0.38.5 (2026-07-30)
- 🌟 **New feature:** @ feat(climate): add UNREACH/LOWBAT status datapoints to Raumklima widget
- fix(echart): current value follows live state; add raw aggregation
- @ fix(calendar): expand recurring RRULE events so repeating feeds show up
- 🌟 **New feature:** feat(trashSchedule): add compact single-line layout


### 0.38.4 (2026-07-29)
- 🌟 **New feature:** Waste Collection Schedule - new compact layout showing a colored dot, bin name and pickup countdown on one line, each part individually hideable with optional date
- Calendar - recurring events (RRULE) are now expanded, so calendars built from repeating entries (e.g. waste-collection feeds) no longer appear empty
- Advanced Chart - the shown current value now follows the live datapoint (drops to 0 when the value does) instead of holding the last logged value, and a new "None (raw data)" aggregation option skips server-side bucket averaging
- 🌟 **New feature:** Room Climate - now supports the standard status datapoints (battery/UNREACH), auto-detected on insert and shown as badges like other sensor widgets


### 0.38.3 (2026-07-28)
- 🌟 **New feature:** Universal Widget - image cells can now take their source from a datapoint (URL / path / base64) and be sized in pixels


### 0.38.2 (2026-07-28)
- Copy/Move widget - target list is now grouped per section, so tabs with the same name (e.g. Dashboard) in different sections are no longer ambiguous
- Copy/Move widget - the target menu now scrolls when it has more entries than fit on the screen
- Copy/Move widget - each layout is highlighted in its own colour, and a section's tabs are laid out in up to 5 columns


### 0.38.1 (2026-07-28)
- Room climate - the show/hide toggles (actual/target temperature, humidity, comfort zone, temperature chart) moved from the generic Display section into the Room climate settings
- Popup views - with popup height set to auto, a list widget now grows the popup to fit all its rows instead of scrolling inside a fixed box
- Popup views - a widget placed away from the left edge in the editor is no longer stuck at the right edge of the popup; the used content is now centered


### 0.38.0 (2026-07-28)
- 🌟 **New feature:** Universal Widget - per-cell conditions: each grid cell can now react to its own or another datapoint and change text color, background, bold/italic, icon or hide itself — configured in a separate popup so only that cell is affected, not the whole widget


### 0.37.3 (2026-07-27)
- Mirror - picking a source now adopts its size and frame look, and a mirrored group hugs its children exactly like the original, so the mirror matches the source 1:1 from the start
- Mirror - the editor now marks a mirror widget with a badge showing which widget it reflects


### 0.37.2 (2026-07-27)
- Mirror - a mirrored group now renders full-bleed like the original instead of shrinking and clipping child badges


### 0.37.1 (2026-07-27)
- Import - tab/section/layout imports now keep their original size: exports record the source grid geometry and imports rescale widgets (and group children) to your grid, so a tab built on a larger grid no longer imports tiny and squeezed (legacy files without geometry are auto-fitted)


### 0.37.0 (2026-07-26)
- 🌟 **New feature:** AC Control - new widget to control air conditioners (power, mode, fan speed, vanes, eco) with per-manufacturer profiles and automatic datapoint filling; Mitsubishi (mitsubishi-local-control) supported first


### 0.36.6 (2026-07-26)
- 🌟 **New feature:** Calendar - multi-day events now show their end date as a range and an optional "ongoing / N days left" badge (configurable: span / badge / both / off)


## License

MIT License

Copyright (c) 2026 Hermann Dering <aura@dering-online.de>

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.








































































































































































































































































































































































































































































































