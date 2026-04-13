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

### Step 3 – Open dashboard

The dashboard is available at:

```
http://<iobroker-ip>:8082/aura/
```

The admin interface at:

```
http://<iobroker-ip>:8082/aura/#/admin
```

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

### 0.3.85 (2026-04-13)
- Fix news section: remove unpublished versions; fix extIcon URL

### 0.3.84 (2026-04-13)
- CI/CD pipeline fully operational

### 0.3.83 (2026-04-13)
- Fix CI publish: use granular npm access token

### 0.3.82 (2026-04-13)
- Fix CI publish: explicitly remove npm auth token to enable OIDC Trusted Publishing

### 0.3.81 (2026-04-13)
- Fix CI publish: remove registry-url to allow npm Trusted Publishing OIDC auth

### 0.3.80 (2026-04-13)
- Remove unpublished versions from news section; ioBroker repository compliance fixes

### 0.3.79 (2026-04-13)
- Switch npm publish to Trusted Publishing (OIDC) for secure CI/CD

### 0.3.78 (2026-04-13)
- Version bump for npm publish

### 0.3.77 (2026-04-13)
- CI/CD pipeline fully operational: npm publish via automation token

### 0.3.76 (2026-04-13)
- Fix lint: disable no-var-requires for CommonJS adapter entry point

### 0.3.75 (2026-04-13)
- Fix npm publish: use automation token for 2FA-protected CI publishing

### 0.3.74 (2026-04-13)
- ioBroker repository compliance: PNG icon, platform field, updated dependencies and workflow

### 0.3.73 (2026-04-13)
- Stable fingerprint-based client ID – no more duplicate devices on mobile

### 0.3.72
- Calendar widget: fetch via state relay instead of sendTo for reliable operation

### 0.3.63
- New widgets: fill level indicator and waste collection

### 0.1.0
- Initial release

---

## License

MIT License

Copyright (c) 2026 Hermann Dering <aura@dering-online.de>

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
