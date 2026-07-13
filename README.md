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

### 0.31.1 (2026-07-13)
- 🌟 **New feature:** Status icon, state image and dimmer - active/on state can now be driven by a numeric condition (==, !=, >, >=, <, <=) instead of only boolean values
- 🌟 **New feature:** Static and dynamic lists - new "States" display maps each value to its own label, icon and color for multi-state sensors (e.g. window handle: closed/tilted/open), auto-filled from the datapoint's common.states


### 0.31.0 (2026-07-13)
- 🌟 **New feature:** Value & JSON-table widgets - `aura-file:` paths now resolve inside HTML `<img src>`, so images/icons from the ioBroker file system can be embedded the same way everywhere
- 🌟 **New feature:** JSON-table widget - new per-column width (px), text alignment and line-wrap options, plus an optional max-rows limit and click-to-sort column headers


### 0.30.1 (2026-07-13)
- 🌟 **New feature:** Section menu - entries can now show markers (badges) and an optional aggregate count of how many widgets across the section's tabs currently have a badge


### 0.30.0 (2026-07-13)
- 🌟 **New feature:** Layouts - new "Sections" level: each layout can now hold several sections (the left-hand menu), each with its own tabs; export/import works per section, and a per-layout default section is used on open and for idle-return
- 🌟 **New feature:** Design - settings now cascade global → layout → section: theme, typography, grid, guidelines and tab bar can be overridden per section, and header, layout menu and idle-return per layout
- 🌟 **New feature:** Design - optional toggles to show the section menu and the tab bar even with a single entry (previously only shown from two)
- 🌟 **New feature:** Tab bar - can now be positioned at the bottom (footer) instead of the top
- 🌟 **New feature:** Layout menu - datapoint elements: pick the datapoint via the standard picker, and the template field supports HTML


### 0.25.5 (2026-07-12)
- Custom layout - wrapped cell text now respects the configured alignment (e.g. centered titles stay centered across both lines)
- JSON table / Value widget - http:// images now load on HTTPS pages (mobile); they are routed through the proxy instead of being blocked as mixed content


### 0.25.4 (2026-07-12)
- Fill widget - horizontal battery layout keeps its aspect ratio and no longer stretches to full width on mobile


### 0.25.3 (2026-07-12)
- Media player - relative cover paths (e.g. Sonos album art) now display without a helper datapoint


### 0.25.2 (2026-07-11)
- 🌟 **New feature:** Timer - event value has On/Off quick-select buttons (free text still allowed)
- 🌟 **New feature:** Timer - event list now shows an On/Off pill so you can see whether an event switches the target on or off
- 🌟 **New feature:** Advanced - widget border color and width are now configurable per widget


### 0.25.1 (2026-07-11)
- 🌟 **New feature:** Static & dynamic list - the sum line can now also show average, minimum and maximum, each with its own icon and text prefix
- 🌟 **New feature:** Value display - the HTML template can now reference any other datapoint, e.g. {alias.0.Raeume.Draussen.Suedseite.ACTUAL}, in addition to {dp} for the widget's own value; new {color} (current threshold color, e.g. for an icon) and {unit} placeholders


### 0.25.0 (2026-07-11)
- Fill widget - horizontal battery layout now fills the whole cell instead of shrinking and leaving empty margins in short/wide widgets
- Fill widget - bar width/height now previews live while editing instead of only after leaving the field
- Input widget - add field alignment (left / center / right) to position a fixed-width input field within its cell
- Layout menu - configurable spacing: gap between the layout list and the element above it, space above/below the menu title, and space above/below each added element (clock / datapoint / text)
- 🌟 **New feature:** Group widget - add "collapsed by default" option: the group shows only its header and folds its body away until clicked to expand (frontend only)


### 0.24.2 (2026-07-10)
- Layouts can be hidden from the layout menu (still reachable via their direct URL)
- Layout menu can be hidden per layout — e.g. lock a wall tablet to a single layout


### 0.24.1 (2026-07-10)
- refactor(layout-menu): show the menu-title input in a SubGroup like placement
- refactor(layout-menu): group placement-dependent settings under the placement
- feat(layout-menu): show settings conditionally per placement
- refactor(layout-menu): put placement first as a prominent heading
- refactor(layout-menu): group hamburger size + auto-hide in one bordered box


### 0.24.0 (2026-07-10)
- 🌟 **New feature:** Layout menu - new "bullet + name" entry style, configurable selected style (colored/underline/filled/pill), font size and icon size
- 🌟 **New feature:** Layout menu - add custom elements (clock, datapoint, text) positioned above or below the layout list


### 0.23.6 (2026-07-10)
- Thermostat - quick-select preset buttons now shown directly on the widget (toggleable)
- Thermostat - color thresholds now apply to the actual temperature instead of the setpoint
- Value - add status datapoints (battery / reachability) with show-always or alert-only badges


### 0.23.5 (2026-07-10)
- Media player - relative cover paths (e.g. Sonos current_cover) now resolve automatically, no full-URL datapoint needed
- Widgets - transparency mode with partial strength now keeps rounded corners in the frontend instead of showing square edges
- Widgets - enabling transparency mode no longer shifts the widget content outward (padding and border box are preserved)


### 0.23.4 (2026-07-10)
- Input widget - field width is now adjustable (setting added after Placeholder)
- Tab bar - the mobile scroll bar under the tabs can now be hidden (Frontend Design → scope → Tab bar)
- iframe & eCharts widgets - fixed white background in dark mode


### 0.23.3 (2026-07-10)
- Guidelines - vertical target-width line now marks the device edge correctly with a docked sidebar menu (subtracts the menu width); a floating menu is not subtracted
- Editor - the docked sidebar layout menu now shows greyed-out in the layout editor preview (with a hint and a link to its setting), so the design area matches the frontend


### 0.23.2 (2026-07-10)
- Distribution chart - pie and donut now render for datapoints without a history adapter (falls back to the current value)
- Distribution chart - optionally show each datapoint's icon inside the bar segments and pie/donut slices, next to the percentage
- Distribution chart - small pie/donut slices can optionally show their percentage on a leader line outside the ring instead of hiding it


### 0.23.1 (2026-07-10)
- Layout menu - docked sidebar now collapses into the tab bar on mobile and re-docks on wider screens


### 0.23.0 (2026-07-10)
- 🌟 **New feature:** Admin - appearance settings reorganized into a new "Frontend Design" menu (theme, typography, grid, guidelines and tab bar, global or per layout) with a "Global frame" group for header, layout menu and navigation (auto-return to default tab); the layout menu gained a "docked sidebar" placement (permanent left menu with configurable width, entry height and optional title), the old "Frontend" menu was dissolved, and optimistic updates moved to "Settings"


## License

MIT License

Copyright (c) 2026 Hermann Dering <aura@dering-online.de>

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.




























































































































































































































































































































































































































































