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

### 0.15.2 (2026-07-02)
- fix(lint): wrap German typographic quotes in StatusOverviewConfig JSX
- Auswahlfeld - current selection can now be shown as text, icon, or icon + text; entries gained per-entry icons and a compact single-row editor. The Universal widget's DP-select cell matches this: import entries from the datapoint's common.states, per-entry icons, and a tidied entry row
- 🌟 **New feature:** Status overview - new widget that automatically surfaces low batteries, open windows, lights left on, unreachable/offline devices and smoke/water alarms, with an "all clear" state and click-to-jump to the affected device; offers list/Card/Minimal layouts with per-category colors, shows battery type and count, uses robust reachability detection, and includes a battery-type assignment page to identify and manage battery devices


### 0.15.1 (2026-07-02)
- Auswahlfeld - current selection can now be shown as text, icon, or icon + text; entries gained per-entry icons and a compact single-row editor. The Universal widget's DP-select cell matches this: import entries from the datapoint's common.states, per-entry icons, and a tidied entry row
- 🌟 **New feature:** Status overview - new widget that automatically surfaces low batteries, open windows, lights left on, unreachable/offline devices and smoke/water alarms, with an "all clear" state and click-to-jump to the affected device; offers list/Card/Minimal layouts with per-category colors, shows battery type and count, uses robust reachability detection, and includes a battery-type assignment page to identify and manage battery devices


### 0.15.0 (2026-07-02)
- 🌟 **New feature:** Status overview - new widget that automatically surfaces low batteries, open windows, lights left on, unreachable/offline devices and smoke/water alarms, with an "all clear" state and click-to-jump to the affected device; offers list/Card/Minimal layouts with per-category colors, shows battery type and count, uses robust reachability detection, and includes a battery-type assignment page to identify and manage battery devices


### 0.14.2 (2026-07-01)
- Map - zoom level is now configurable (fixed zoom, or max-zoom cap when auto-centering on markers)
- Click action "Jump: Widget" now pulse-highlights and scrolls to the target widget after switching tabs
- Badges - renamed to "Marker" in the German UI


### 0.14.1 (2026-07-01)
- Badges - renamed to "Marker" in the German UI


### 0.14.0 (2026-06-30)
- 🌟 **New feature:** Dynamic List - optionally group datapoints by room with the room name as a section heading
- 🌟 **New feature:** Dynamic List - room section headings now support custom font size, text color and background color
- Tabs - fix tab switching needing multiple clicks after auto-return to the default tab
- General - fix datapoints with a JSON path (e.g. dp?soc) in header, tab bar and camera fields being rejected; the nested value is now shown


### 0.13.0 (2026-06-29)
- 🌟 **New feature:** Map - new widget: plot positions (car, person, …) from lat/lon or JSON datapoints, fixed coordinates, or a plain address on an OpenStreetMap map, with optional distance from a reference point
- 🌟 **New feature:** Map - choose a map style: standard map, satellite, or terrain/topo


### 0.12.1 (2026-06-29)
Release v0.12.1


### 0.12.0 (2026-06-29)
- 🌟 **New feature:** Badges - add configurable badges (colored dot, datapoint count, or label/icon) that sit on the edge of widgets, groups and tabs; visible always or when a condition is met, with a free corner position
- 🌟 **New feature:** Tabs - optional aggregate badge counting how many widgets on a tab currently show a badge


### 0.11.5 (2026-06-28)
- Widget menu - Copy/Move target list now uses 2–3 columns and grows to the right when there are many tabs, so entries no longer fall off the bottom of the screen


### 0.11.4 (2026-06-27)
- Popups - removing a widget-type default in the backend now stops auto-linking the built-in popup (e.g. dimmers no longer force the Standard Dimmer popup)


### 0.11.3 (2026-06-27)
- Widget editor - datapoint buttons reordered to "from ioBroker", "JSON path", "transform"
- Widget editor - unified the datapoint picker icon across all widgets (HTML, iframe, camera, carousel, chips, weather, trash, static list)


### 0.11.2 (2026-06-27)
- Universal widget - select cell now re-sends the value when the already-selected entry is picked again


### 0.11.1 (2026-06-26)
- Switch / Dimmer - toggle knob now vertically centered instead of sitting too low


### 0.11.0 (2026-06-26)
- Adapter now requires admin >= 7.8.23
- Clock / astro timers - more accurate sunrise/sunset times (suncalc 2.0)


### 0.10.5 (2026-06-26)
- Editor - reordered tab settings (Name, Icon, URL slug, options, export, conditions) and highlighted the conditions section
- Editor - tabs hidden from the tab bar now show an eye-off icon in the tab list


### 0.10.4 (2026-06-25)
- fix(thermostat): drop "Soll:" label from target temperature
- fix(thermostat): inline "Soll:" label and fix doubled °CC unit


### 0.10.3 (2026-06-25)
- feat(tabs): add "hide from tab bar" option (still reachable via direct link)
- fix(alarm): make acknowledge (quit_changes) button actually clear state
- fix(alarm): wrap long log entries instead of truncating
- feat(alarm): allow hiding individual mode buttons (off/sharp/inside/night)
- feat(light): add hex color mode for single #RRGGBB string datapoints
- fix(light): power entry toggles directly instead of duplicating switch
- feat(list): per-entry icon-switch icons and confirmation prompt
- feat(weather): add separate size factor for warnings
- fix(weather): give warnings their own flex/scroll region, stop them inflating
- fix(weather): size warnings into auto-scale baseline so they fit without scroll
- fix(weather): render DWD warning content instead of empty yellow box
- fix(adapter-status): show schedule-mode adapters as 'scheduled' not 'stopped'
- fix(editor): keep tab settings panel on-screen when conditions expand
- fix(tabbar): keep settings panel on-screen for far-right tabs
- fix(chart): show full German unit word for custom range button
- feat(group): per-group option to keep grid layout on mobile
- fix(group): fill and scroll inside fixed-height containers on mobile
- fix(panels): prevent viewport collapse in mobile portrait layout


### 0.10.2 (2026-06-25)
- chore(build): rebuild www frontend bundle
- chore(build): rebuild www frontend bundle
- Merge pull request #383 from hdering/chore/ws-upgrade-log-debug
- chore(proxy): lower WS-upgrade diagnostic log to debug level
- chore(build): rebuild www frontend bundle
- style(prettier): auto-format code files
- Merge pull request #382 from hdering/fix/pure-ws-sid-diag
- fix(proxy): inject sid also when empty + log WS upgrades (pure-ws diag)
- chore(build): rebuild www frontend bundle
- Merge pull request #381 from hdering/fix/pure-ws-ensure-sid
- fix(proxy): guarantee a sid on pure-ws root upgrades (fixes 5s reconnect loop)
- chore(build): rebuild www frontend bundle
- style(prettier): auto-format code files
- Merge pull request #380 from hdering/fix/adaptive-forwarded-for
- fix(proxy): only forward X-Forwarded-For for engine.io socket modes
- chore(build): rebuild www frontend bundle
- Merge pull request #369 from hdering/fix/proxy-x-forwarded-for
- feat(proxy): forward X-Forwarded-For/Proto to the socket backend
- chore(build): rebuild www frontend bundle
- Merge pull request #368 from hdering/fix/pin-zustand-v4-prod-loop
- fix(deps): pin zustand to v4 — v5 causes prod-only infinite render loop
- chore(build): rebuild www frontend bundle
- Merge pull request #359 from hdering/fix/force-websockets-transport
- fix(socket): connect websocket-first so "Force web sockets" works
- chore(deps): bump actions/checkout from 6 to 7 (#356)
- chore(deps): bump zustand to v5 and migrate equality-fn store hooks (#358)
- chore(build): rebuild www frontend bundle
- chore(deps-dev): bump typescript from 5.9.3 to 6.0.3 (#330)
- chore(deps): bump @iobroker/adapter-core from 3.3.2 to 3.4.1 (#331)
- chore(deps): bump ioBroker/testing-action-check from 1 to 2 (#327)


### 0.10.0 (2026-06-24) — beta/test release
- Merge pull request #357 from hdering/pr218-pure-ws-followup
- fix(socket): resolve no-use-before-define in load guard
- fix(socket): dev-proxy pure-ws root upgrade + socket-lib load guard
- Support pure WebSocket transport (load socket.io client at runtime)


## License

MIT License

Copyright (c) 2026 Hermann Dering <aura@dering-online.de>

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.



























































































































































































































































































































































































