# ioBroker.aura

**Aura** is a modern visualization dashboard for [ioBroker](https://www.iobroker.net/).

> **Beta** – The project is under active development. Bugs and breaking changes are possible.

---

## Features

- **Flexible grid layout** with drag & drop
- **Multiple tabs / pages** per dashboard
- **Themes:** Dark, Light, Catppuccin (Latte, Frappé, Macchiato, Mocha), Apple Liquid Glass and more
- **Full admin interface** – no YAML, no JSON editing required
- **Responsive** – works on tablet, smartphone and desktop

### Widgets

| Widget | Description |
|--------|-------------|
| Switch | On/Off toggle |
| Dimmer | Brightness slider |
| Thermostat | Target / actual temperature |
| Gauge | Round gauge with color zones |
| Fill level | Tank / water / gas level – vertical or horizontal |
| Chart | Line, bar, pie chart (ECharts) |
| Calendar | iCal / Google Calendar |
| Weather | Current weather data |
| Clock | Analog or digital |
| iFrame / Camera | Embed any URL |
| EVCC | Wallbox, solar, battery storage |
| Waste collection | Which bin needs to go out? |
| Group | Nested widgets |

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

## Development

```bash
# Install dependencies
npm install

# Start dev server (connects to ioBroker via proxy)
npm run dev

# Production build
npm run build:adapter
```

---

## Changelog

### 0.4.20 (2026-04-14)
- Fix W5022: migrate jsonConfig to i18n – use translation keys and `admin/i18n/` for all 11 languages

### 0.4.19 (2026-04-14)
- Fix W3009: concurrency group set to `${{ github.ref }}`
- Fix W3019: switch deploy to npm trusted publishing (remove npm-token)
- Fix W4042: extend jsonConfig `fileMatch` in `.vscode/settings.json`

### 0.4.18 (2026-04-14)
- Fix W4042: extend jsonConfig `fileMatch` in `.vscode/settings.json` to include all jsonConfig variants

### 0.4.17 (2026-04-14)
- Move `main.js` to root directory per ioBroker adapter convention

### 0.4.16 (2026-04-14)
- Adapter checker fixes: use `testing-action-deploy@v1`, ESLint flat config, `admin/i18n/`, jsonConfig schema URL, dependabot cooldown

### 0.4.15 (2026-04-14)
- Fix E2004: remove 0.4.13 from news (never published to npm due to CI failure)

### 0.4.14 (2026-04-14)
- Fix invalid JSON in io-package.json (trailing comma after last news entry)

### 0.4.13 (2026-04-14)
- Stable release: adapter checker compliance, src-vis convention, release script, i18n in npm package

### 0.4.12 (2026-04-14)
- Fix E2005: restore 0.3.98 (npm latest) in news section

### 0.4.11 (2026-04-14)
- Add `release` script to `package.json` for iobroker.dev release management

### 0.4.10 (2026-04-14)
- Add `src-vis/i18n/` to `package.json` files to include translations in npm package

### 0.4.9 (2026-04-14)
- Rename frontend source directory from `src/` to `src-vis/` per ioBroker adapter convention

### 0.4.8 (2026-04-14)
- Fix adapter checker: correct news section, fix vscode schema URL, add .releaseconfig.json

### 0.4.7 (2026-04-14)
- Fix invalid JSON in io-package.json (trailing comma after last news entry)

### 0.4.6 (2026-04-14)
- Fix npm ci: add .npmrc with legacy-peer-deps=true to resolve peer dependency conflicts in CI

### 0.4.5 (2026-04-14)
- Beta release for testing: adapter checker compliance and CI pipeline fully green

### 0.4.4 (2026-04-14)
- Fix CI: upgrade @typescript-eslint to v8, add no-require-imports override for CommonJS, fix ternary-as-statement lint errors

### 0.4.3 (2026-04-14)
- Adapter checker compliance: i18n for jsonConfig, node: prefix for built-ins, workflow deploy job, dependabot, react-resizable dependency

### 0.4.2 (2026-04-14)
- Adapter checker fixes: add globalDependencies admin >=7.6.17, remove unpublished news entry, add jsonConfig size attributes, add workflow tag trigger

### 0.4.1 (2026-04-14)
- Fix CI pipeline: add test:package and test:integration scripts, resolve all ESLint warnings

### 0.4.0 (2026-04-14)
- Adapter checker compliance: node >=20, trim news to 7 entries, remove allowInit, use ioBroker standard workflow actions, fix package dependencies

### 0.3.99 (2026-04-14)
- Add configurable default tab per layout – set which tab opens when the dashboard URL has no tab slug

### 0.3.98 (2026-04-14)
- Replace hardcoded personal domain in settings placeholder with generic example

### 0.3.97 (2026-04-14)
- Fix overview tile titles: use localLinks `name` field (ioBroker uses name, not key, as the visible title)

### 0.3.96 (2026-04-14)
- Fix overview tile names: use full replacement instead of deep-merge so old keys ("Dashboard"/"Admin") are removed

### 0.3.95 (2026-04-14)
- Fix restart loop when custom URL is set (only write localLinks when value actually changed)

Older entries: see [CHANGELOG_OLD.md](CHANGELOG_OLD.md)

---

## License

MIT License

Copyright (c) 2026 Hermann Dering <aura@dering-online.de>

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
