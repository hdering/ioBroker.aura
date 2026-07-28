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


### 0.36.5 (2026-07-26)
- Design - resetting per-layout header overrides now activates Save and persists after reload


### 0.36.4 (2026-07-26)
- Guidelines - horizontal guide line now lines up between the editor and the frontend (it accounts for the header and tab/section bar, so it marks the target device's bottom edge in both)


### 0.36.3 (2026-07-26)
- Timer - new option to hide the astro symbol so only the resolved time is shown
- JSON table - per-column prefix and suffix to decorate cell values (e.g. units or currency)
- Group - transparent groups now stay transparent when opened via the "Popup: widget content" click action
- Group - resizing a child in the editor no longer rescales the other children (fixed-grid pitch while editing)


### 0.36.2 (2026-07-25)
- Timer - astro events now show the resolved sunrise/sunset time next to the symbol
- Timer - all events are now shown in a scrollable list instead of being cut off at 4


### 0.36.1 (2026-07-25)
- Settings - Grid & Mobile can now hide the draggable dashboard scroll bar on touch devices


### 0.36.0 (2026-07-25)
- 🌟 **New feature:** Menu - new freely positionable navigation widget: shows the sections or the tabs as a menu, with per-widget de-selection of entries, four layouts (horizontal bar, vertical list, grid, pills) and four active styles


### 0.35.3 (2026-07-25)
- Universal widget - string datapoints are no longer coerced to numbers when no value factor/offset is set, so values like "0x004" display as-is instead of being parsed as hex


### 0.35.2 (2026-07-25)
- Popup (widget content) - embedded widget now fills the configured popup width/height instead of collapsing to a narrow box; without an explicit size it uses the widget's own designed size, so groups no longer squeeze their children


### 0.35.1 (2026-07-25)
- General - widget config changes (e.g. a widget's data point) no longer revert after saving when auto-backups are at their limit


### 0.35.0 (2026-07-25)
- 🌟 **New feature:** Mirror - new widget type that shows an existing widget live at a second position (no copy; source changes apply instantly)


### 0.34.0 (2026-07-25)
- 🌟 **New feature:** Editor - a whole tab (with its widgets) can now be moved or copied into another section from the tab settings
- 🌟 **New feature:** Layouts - a whole section (with its tabs and widgets) can now be moved or copied into another layout via a popup on each section


### 0.33.8 (2026-07-24)
- Carousel - compact layout settings plus corner radius, global background/text colours, and per-element colours (now also for popup/link items) that override the global ones
- Carousel - popup opened from an element now shows the element name as its heading instead of the carousel widget name


### 0.33.7 (2026-07-24)
- Settings - header HTML template field now grows across multiple lines


## License

MIT License

Copyright (c) 2026 Hermann Dering <aura@dering-online.de>

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.



























































































































































































































































































































































































































































































