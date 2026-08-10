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

### 0.43.0 (2026-08-10)
- 🌟 **New feature:** Lists and status overview - clicking a row now opens a detail popup for that datapoint: picked automatically from the datapoint's role, or configured per row (widget popup, jump to another tab, all datapoints of the device). Datapoints moved into a dedicated resizable dialog with the entry list next to a sectioned per-entry editor, the options panel is grouped into collapsible sections, and the datapoint search of the dynamic list now finds alias.0.* datapoints ([#524](https://github.com/hdering/ioBroker.aura/issues/524))


### 0.42.7 (2026-08-08)
- Camera - embedded streams (go2rtc and friends) reload when the device wakes from display standby instead of stopping on a play button; new "Reload after standby" option, on by default ([#526](https://github.com/hdering/ioBroker.aura/issues/526))
- iFrame - new "Reload after standby" option reloads embedded videos and streams after display standby, overriding "Keep alive" ([#526](https://github.com/hdering/ioBroker.aura/issues/526))


### 0.42.6 (2026-08-08)
- Popups now show current datapoint values on every open - previously a popup reopened with the values it had shown the last time, until the datapoint changed again ([#528](https://github.com/hdering/ioBroker.aura/issues/528))
- Widgets no longer stay on their placeholder when a value arrives from the load-time prefetch just after they appear ([#528](https://github.com/hdering/ioBroker.aura/issues/528))


### 0.42.5 (2026-08-08)
- iFrame - click action stays reachable while the embedded page is operable: a small action button is shown over the widget, and "Allow interaction" became a three-way "Interaction" setting ([#527](https://github.com/hdering/ioBroker.aura/issues/527))
- General - HTML, eCharts preset and camera widgets with an embedded page now offer the same action button for their click action ([#527](https://github.com/hdering/ioBroker.aura/issues/527))


### 0.42.4 (2026-08-08)
- A notice now explains when the browser has put the dashboard tab to sleep, including how to exclude the page from tab sleeping in Edge and Chrome ([#528](https://github.com/hdering/ioBroker.aura/issues/528))


### 0.42.3 (2026-08-08)
- Datapoints no longer stay stale after the browser tab was inactive for a long time - the dashboard now revalidates all values on reconnect and checks the connection when the tab becomes visible again ([#528](https://github.com/hdering/ioBroker.aura/issues/528))


### 0.42.2 (2026-08-07)
- 🌟 **New feature:** Status overview - room and the "open since ..." duration can each be hidden
- 🌟 **New feature:** Input field - new command mode: the field clears itself after sending, no longer mirrors the datapoint value across devices, and only sends on Enter / Send button ([#525](https://github.com/hdering/ioBroker.aura/issues/525))


### 0.42.1 (2026-08-07)
- Popups - datapoint triggers now offer popup actions only; picking a navigation action left an unusable overlay on screen ([#523](https://github.com/hdering/ioBroker.aura/issues/523))


### 0.42.0 (2026-08-05)
- 🌟 **New feature:** Popups - open a popup from a datapoint condition, with optional auto-reset of the trigger ([#523](https://github.com/hdering/ioBroker.aura/issues/523))
- 🌟 **New feature:** Popups - scripts can open a popup view via aura.0.popup.open or per client ([#523](https://github.com/hdering/ioBroker.aura/issues/523))


### 0.41.2 (2026-08-05)
- fix(lint): resolve remaining eslint warnings
- fix(ui): wrap German typographic quotes in JSX expressions


### 0.41.1 (2026-08-05)
- Editor - the "Sections:" label now links to Layout settings and opens the current layout expanded


### 0.41.0 (2026-08-05)
- Section menu - datapoint elements now show their value right away when the menu is opened (mobile hamburger no longer stuck on a placeholder)
- Status overview - no more stray horizontal scrollbar when there is enough space
- 🌟 **New feature:** Status overview, static list and dynamic list - new name pattern with name filter: reshape the placeholder texts with plain-language rules (remove/replace text, keep a segment, first/last words, upper/lower case) or regex, with one-click templates and a live preview of real datapoints; the filter dialog can be moved and resized ([#524](https://github.com/hdering/ioBroker.aura/issues/524))


### 0.40.0 (2026-08-03)
- 🌟 **New feature:** Conditions and badges - an empty datapoint field now falls back to the widget's main datapoint and replaces the separate "main DP" source, new "is active" / "is inactive" operators test a datapoint for > 0, true or non-empty, and a badge's visibility is now configured in one place through conditions
- 🌟 **New feature:** Conditions and badges - list and dynamic list widgets can match any/all/no list entry or use the entry count, active count, sum, average, min or max


### 0.39.5 (2026-08-03)
- 🌟 **New feature:** Panels - each widget now gets its own slide selector datapoint under aura.<n>.panels, so buttons, scripts or a select widget can jump straight to a slide; the slide names are published as common.states, swiping writes the value back, and a custom datapoint can be used instead ([#504](https://github.com/hdering/ioBroker.aura/issues/504))


### 0.39.4 (2026-08-02)
- 🌟 **New feature:** Date picker - output format and input now accept a custom pattern; the input pattern picks the matching field, so MM.yyyy shows a month picker ([#518](https://github.com/hdering/ioBroker.aura/issues/518))


### 0.39.3 (2026-08-02)
- 🌟 **New feature:** Widget management now lists the widgets of all layouts and sections instead of only the active one, with a layout filter and layout/section shown per widget
- 🌟 **New feature:** Chart (advanced) - new "Consumption (difference)" aggregation for ever-rising meters (electricity, water, gas): plots consumption per hour, day, week or month instead of the meter reading, with counter resets clamped to zero ([#521](https://github.com/hdering/ioBroker.aura/issues/521))


### 0.39.2 (2026-08-02)
- 🌟 **New feature:** Settings - popup views and widget type defaults are now sorted alphabetically, with a search box and a sort selector (alphabetical, newest first, oldest first) ([#520](https://github.com/hdering/ioBroker.aura/issues/520))


### 0.39.1 (2026-08-02)
- 🌟 **New feature:** Frontend Design - new "Values & Formatting" tab (global scope) holding the global decimals and DP name cleanup settings, which moved here from Settings
- 🌟 **New feature:** Values - new thousands separator for numeric values (off, 1.234,5, 1,234.5, 1 234,5, 1'234.5) with a matching decimal separator; set globally and overridable per widget, cell and list entry
- 🌟 **New feature:** Widget options - unit, decimals and thousands separator now sit together in one row


### 0.39.0 (2026-08-01)
- 🌟 **New feature:** Timestamp datapoints can be shown as time, date or both - in the value display, in custom-layout dp cells and per entry of the static and dynamic list


### 0.38.12 (2026-08-01)
- Image - datapoint values holding an adapter asset path (e.g. /adapter/pirate-weather/icons/...) now render instead of staying blank; same path handling in universal widget cells, JSON table image columns, image popups, state images, switch/window contact images, camera and HTML img tags
- Every image field now lists the accepted path formats (URL, adapter path, ioBroker file, local file, base64) - see the new "Bildpfade" doc page


## License

MIT License

Copyright (c) 2026 Hermann Dering <aura@dering-online.de>

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

























































































































































































































































































































































































































































































































