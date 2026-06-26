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

### Step 3 – Configure web adapter

Open ioBroker Admin → Instances → **web.0** → Settings and set:

| Setting | Value |
|---------|-------|
| **socket.io** | **integrated** |

> **Important:** The default value "socket.io" uses the separate `iobroker.socketio` adapter on port 8084.
> Aura requires socket.io on the **same port** as the web adapter (integrated mode) so that both
> plain HTTP access and HTTPS via reverse proxy work with a single connection endpoint.

### Step 3b – (Optional) Dedicated web instance for proxy

Aura loads a proxy extension into a web adapter instance to enable the **iframe X-Frame-Options bypass** feature. By default no web instance is configured (proxy disabled).

> **Tip:** If you configure `web.0` as the proxy target, stopping or restarting aura will also restart `web.0` — taking down VIS, Material UI etc. To avoid this, create a dedicated instance:
>
> 1. Admin → **Adapters** → **web** → **+** → create `web.1`, set port to e.g. `8083`.
> 2. In **aura** admin → **"Web instance for proxy"** → select `system.adapter.web.1` → save.

### Step 4 – Open dashboard

The dashboard is available at:

```
http://<iobroker-ip>:8082/aura/
```

The admin interface at:

```
http://<iobroker-ip>:8082/aura/#/admin
```

---

## HTTPS / Reverse Proxy

Aura works behind a reverse proxy (e.g. **nginx**, **Nginx Proxy Manager**, **Caddy**) with a
valid TLS certificate (e.g. Let's Encrypt). The web adapter socket.io must be set to **integrated**
(see Step 3) so that `/socket.io/` and `/aura/` are served from the same port.

### Nginx Proxy Manager – example configuration

| Field | Value |
|-------|-------|
| Forward Scheme | `http` |
| Forward Hostname / IP | `<iobroker-ip>` |
| Forward Port | `8082` |
| Websockets Support | enabled |

No additional custom nginx directives are needed when socket.io is set to **integrated**.

### Why not use the ioBroker web adapter's built-in HTTPS?

When the web adapter itself terminates TLS (self-signed certificate), browsers block programmatic
WebSocket connections (`wss://`) from JavaScript even after the user accepted the HTTPS warning in
the browser. A reverse proxy with a CA-signed certificate (e.g. Let's Encrypt) avoids this
restriction entirely.

---

## Bugs & Feature Requests

Please report directly as a GitHub issue:

**[github.com/hdering/ioBroker.aura/issues](https://github.com/hdering/ioBroker.aura/issues)**

---

## Versioning

Aura uses a simple scheme so you can tell stable releases from test builds at a glance:

| Version | Meaning |
|---------|---------|
| `0.10.1` | **Latest** – a stable release. This is what ioBroker shows and installs by default. |
| `0.10.2-next1`, `0.10.2-next2`, … | **Test builds** for the upcoming `0.10.2` release. Pre-releases, published for testing only. |

- **Plain numbers** (`0.10.1`, `0.10.2`, …) are stable. Only these appear directly in ioBroker.
- A **`-nextN` suffix** marks a pre-release. The number counts the test builds leading up to the next stable version (`next1`, `next2`, …).
- Pre-releases are **not** offered automatically in ioBroker; you only get them if you explicitly install that version.

Once a `-nextN` build is confirmed stable, it is published as the matching plain version (e.g. `0.10.2`) and becomes the new Latest.

---

## Changelog

_Older releases: see [CHANGELOG_OLD.md](CHANGELOG_OLD.md)._

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


### 0.9.299 (2026-06-22)
- fix(io-package): restore required common.licenseInformation (E1015/E1105)


### 0.9.298 (2026-06-22)
- fix(backup): decode binary .gz reads so backups aren't reported empty


### 0.9.297 (2026-06-22)
- fix(custom-grid): align default custom-layout font sizes across all widgets
- fix(value-widget): match custom-layout font sizes to other layouts


### 0.9.296 (2026-06-22)
- fix(reset): land on backend overview after reset, not the frontend


### 0.9.295 (2026-06-22)
- test: drop licenseInformation from required io-package fields
- fix(backup): keep change-comment after reload by falling back to ioBroker cache


## License

MIT License

Copyright (c) 2026 Hermann Dering <aura@dering-online.de>

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.












































































































































































































































































































































































