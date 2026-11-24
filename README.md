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

### Step 3 – Choose the web instance

Aura is served by the **web adapter** (`iobroker.web`, 8.0.0 or newer, installed along with Aura) under
`/aura/`. Open the **Aura** instance settings:

| Setting | Default | Meaning |
|---------|---------|---------|
| **Web instance (/aura/)** | picked automatically on a new installation | The `iobroker.web` instance Aura runs in. Its port, HTTPS, certificate and login apply to Aura. For the Visu App and remote access through ioBroker.pro choose the instance set in `cloud.0` (usually `web.0`) |

One web instance serves one Aura instance. A second Aura instance needs a web instance of its own
(e.g. `web.1` on another port).

> **Coming from port 8095?** Existing installations keep their own port until **Own port (deprecated)**
> is switched off; the old port then forwards every device to `/aura/` and takes its settings along.
> Checklist (kiosks, bookmarks, home screen app, reverse proxy, MCP):
> [Moving to the web adapter](https://hdering.github.io/ioBroker.aura/anleitungen/umzug-web-adapter) (German).

**If anything does not work — a blank dashboard, widgets with a load error, images that stay
empty — press *Check backend* in the instance settings first.** It tests the instance, the
socket connection and the file delivery live and says in plain words what is wrong; the report
is meant to be pasted into a forum post or a GitHub issue. Aura runs the same check at every
start and writes the result to the log and to `aura.0.info.backendCheck`.

### Step 4 – Open dashboard

The dashboard is available at (port and protocol of the chosen web instance):

```
http://<iobroker-ip>:8082/aura/
```

The admin interface at:

```
http://<iobroker-ip>:8082/aura/#/admin
```

---

## HTTPS / Reverse Proxy

HTTPS comes from the web instance: enable **Secure (HTTPS)** there and choose the certificates. Aura is
then served as `https://<iobroker-ip>:8082/aura/`.

> The default self-signed certificate triggers a browser warning. For a clean setup use proper
> certificates (e.g. Let's Encrypt) or put the web instance behind a reverse proxy.

### Reverse proxy

Point a reverse proxy (e.g. **nginx**, **Nginx Proxy Manager**, **Caddy**) with a valid TLS
certificate at the **web instance** and forward the **whole host**, not only `/aura/`, with
WebSockets. The frontend under `/aura/` also uses the top level of the domain: the web instance's
socket on `/` (`wss://<host>/?sid=…`), `/socket.io/socket.io.js`, and `/adapter/…` and `/lib/…`
for web components. A plain `location /aura/` on a shared domain gives a page without live values -
use a (sub)domain of its own for the web instance instead.

#### Nginx Proxy Manager – example configuration

| Field | Value |
|-------|-------|
| Forward Scheme | `http` (or `https` if the web instance runs HTTPS) |
| Forward Hostname / IP | `<iobroker-ip>` |
| Forward Port | `8082` (port of the web instance) |
| Websockets Support | enabled |
| Cache Assets | off (recommended) |

Optional redirect from `/` to `/aura/` (tab **Advanced**):

```nginx
if ($request_uri = "/") {
    return 302 /aura/;
}
```

> **Not** `location = / { return 302 /aura/; }` - `location` only looks at the path, so it also
> catches the WebSocket `/?sid=…` (302 instead of 101) and the dashboard gets no values.
> `$request_uri` includes the query string, so `/?sid=…` passes.

Then open `https://your-domain.com/aura/`. Examples for plain nginx and Caddy, checks with `curl`
and a troubleshooting table: [Reverse proxy](https://hdering.github.io/ioBroker.aura/anleitungen/reverse-proxy) (German).

> **Moving from port 8095:** point the proxy at the web instance **before** switching the own port
> off. Behind a proxy the old port cannot forward (it would send devices to `<host>:8082`); it shows
> what to change instead.

---

## Messages for scripts and AI agents

`sendTo('aura.0', 'help', {})` answers with a description of the messages (`notify`, scenes, `staggeredWrite`, …) and the command states of Aura for AI agents (e.g. pi-agent) and script authors; the answer lists all commands with `write` (whether a command changes something).

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

### 1.5.0-next.3 (2026-11-24) — next/test release
- 🐛 **Bug fix:** The frontend now notices an adapter update and reloads itself even when its connection stays up during the update; before, open dashboards could keep running the old version
- 🐛 **Bug fix:** Instances - an own port that is switched off and no longer forwarded is no longer shown in the instance list of admin (it is kept and comes back when "Forward the old port" is switched on again) ([#997](https://github.com/hdering/ioBroker.aura/issues/997))
- 🐛 **Bug fix:** After an update the frontend reloads only once the updated Aura answers, and the "Aura is not reachable" page of the web adapter retries by itself - before, dashboards could stay on that error page after an update


### 1.5.0-next.2 (2026-11-23) — next/test release
- 🐛 **Bug fix:** Chart - switching the time range quickly no longer leaves the chart stuck on the wrong range: a slower history answer for the previous range (e.g. 3 months still loading after switching to 24 h) is discarded instead of overwriting the current one; applies to the range chips, linked charts and the navigation datapoints ([#1013](https://github.com/hdering/ioBroker.aura/issues/1013))
- 🐛 **Bug fix:** Chart - in JSON mode, series hidden via the legend now stay hidden when the datapoint delivers new JSON ([#1014](https://github.com/hdering/ioBroker.aura/issues/1014))
- 🐛 **Bug fix:** Status overview and dynamic list no longer download every object while the adapter restarts (e.g. during an update) - they ask the adapter again instead; with several dashboards open this could stall a large ioBroker installation for minutes


### 1.5.0-next.1 (2026-11-23) — next/test release
- ⚠️ **Breaking change:** Aura moves into the web adapter - Aura is now reached through a web instance as <web-port>/aura/ (e.g. http://192.168.1.10:8082/aura/), its own port (8095) is deprecated and will be removed in a coming major version. Existing installations keep the port for now: choose the web instance at the top of the instance settings, move kiosk URLs, bookmarks, home screen icons, reverse proxies and MCP clients (copy the client configuration again) to /aura/, then switch "Own port (deprecated)" off. After that the old port only forwards to /aura/ and takes each device's settings along ("Forward the old port"), and the log names every device that still comes that way. Reverse proxies must point at the web instance and forward the whole host (the socket runs on /), before the own port is switched off - behind a proxy the old port explains this instead of forwarding. A base URL set in the instance (e.g. https://aura.example.com) means <that host>/aura/ for the instance links and the MCP client configuration once Aura runs through the web instance. The web adapter (8.0.0 or newer) is now required and installed along with Aura. New installations start without an own port when a web instance runs on the same host; without one Aura opens its port anyway. One web instance serves one Aura instance - the settings, the logs and the backend check name a clash. Also: the web extension talks to Aura over a local socket, pages shown through Aura's proxy run sandboxed and no longer get the cookies of the ioBroker host, and the admin login is kept in an HttpOnly cookie ([#997](https://github.com/hdering/ioBroker.aura/issues/997))


### 1.5.0-next.0 (2026-11-23) — next/test release
- ⚠️ **Breaking change:** Aura moves into the web adapter - Aura is now reached through a web instance as <web-port>/aura/ (e.g. http://192.168.1.10:8082/aura/), its own port (8095) is deprecated and will be removed in a coming major version. Existing installations keep the port for now: choose the web instance at the top of the instance settings, move kiosk URLs, bookmarks, home screen icons, reverse proxies and MCP clients (copy the client configuration again) to /aura/, then switch "Own port (deprecated)" off. After that the old port only forwards to /aura/ and takes each device's settings along ("Forward the old port"), and the log names every device that still comes that way. The web adapter (8.0.0 or newer) is now required and installed along with Aura. New installations start without an own port when a web instance runs on the same host; without one Aura opens its port anyway. One web instance serves one Aura instance - the settings, the logs and the backend check name a clash. Also: the web extension talks to Aura over a local socket, pages shown through Aura's proxy run sandboxed and no longer get the cookies of the ioBroker host, and the admin login is kept in an HttpOnly cookie ([#997](https://github.com/hdering/ioBroker.aura/issues/997))


### 1.4.0-next.4 (2026-11-22) — next/test release
- 🌟 **New feature:** Status overview - second sort rule ("Then sort by": name, room or urgency), e.g. urgent hints first and below them grouped by room ([#1012](https://github.com/hdering/ioBroker.aura/issues/1012))
- 🐛 **Bug fix:** Chart - in comparison mode a series with "Show earlier values" (time shift) now shows the last recorded value at that earlier time instead of the current value; its history instance is detected automatically, and without recorded history the bar stays empty ([#730](https://github.com/hdering/ioBroker.aura/issues/730))
- 🐛 **Bug fix:** Status overview - row actions writing to a placeholder target such as {id} or {device} are no longer listed as references to missing datapoints ([#1008](https://github.com/hdering/ioBroker.aura/issues/1008))
- 🌟 **New feature:** Status overview - devices running on a single 1.5 V cell (1x AA/AAA by battery type or manual assignment, e.g. HmIP-SWDO) get their own voltage warning threshold (default 1.2 V) instead of being reported as weak against the 2.4 V limit ([#1009](https://github.com/hdering/ioBroker.aura/issues/1009))
- 🐛 **Bug fix:** Battery types - devices that report only a battery voltage (V/mV) are now listed on the battery types page too, so their type can be assigned for the status overview ([#1010](https://github.com/hdering/ioBroker.aura/issues/1010))
- 🌟 **New feature:** Status overview - the counts are available as header values: hints and watched devices in total and per category (widget value, or {hints} {devices} {battery_devices} … in a text item, e.g. "3 hints of 10 devices"); the number beside a category heading can show hints, devices or "3 / 10"; when the header shows the hint count, the built-in count chip steps back by itself; hint counts take the severity colour (green, orange, red) ([#1011](https://github.com/hdering/ioBroker.aura/issues/1011))
- 🌟 **New feature:** Header items - new option "As chip": the item gets a background tinted in its colour, like a status chip
- 🐛 **Bug fix:** Status overview - a header item in row 1 no longer overlaps the widget's own count chip; header items now sit in the widget's title row ([#1011](https://github.com/hdering/ioBroker.aura/issues/1011))


### 1.4.0-next.3 (2026-11-21) — next/test release
- 🐛 **Bug fix:** Status overview - in the card layout long values (e.g. a text datapoint) no longer run past the tile: they end in "…" on one line; the new option "Wrap long values" (Optik, card layout) wraps them onto several lines instead


### 1.4.0-next.2 (2026-11-21) — next/test release
- 🌟 **New feature:** Device card - new "Further datapoints": besides its own datapoint a card can hold more datapoints under a short name (e.g. an outdoor sensor as "outside"), usable in the card's widgets as {{outside}}, {{outside_parent}}, {{outside_dpname}} …; linked cards show the short names of the others as empty rows to fill in ([#1007](https://github.com/hdering/ioBroker.aura/issues/1007))
- 🌟 **New feature:** Editor - the options menu of a group or device card with hidden title and icon now starts with a heading in the colour of its nesting level (widget type and title), so with nested frameless boxes it is clear which level the menu belongs to


### 1.4.0-next.1 (2026-11-21) — next/test release
- 🐛 **Bug fix:** Status overview / lists - the row popup "Datapoints of the device" opens much faster: it reads only the clicked device's branch instead of the whole object database, which took up to 20 seconds on large installations
- 🌟 **New feature:** Status overview - new setting "Additional alarm datapoints" in the smoke & water alarm category: datapoints matching these patterns (text or /regex/) count as alarms even without an alarm role, e.g. a Shelly Flood mirrored over MQTT; true (or 1) triggers the alarm. The same field also exists for open windows & doors ("Additional window and door datapoints") and lights on ("Additional light datapoints"; a number counts as brightness). A "+ Datapoint" button next to each of these fields (and next to "Additional offline datapoints") picks single datapoints from the datapoint picker and appends their ids


### 1.4.0-next.0 (2026-11-21) — next/test release
- 🌟 **New feature:** Add widget dialog - the "Web components" section shows how many components are available
- 🌟 **New feature:** Status overview - the many settings moved from the options panel into a tabbed dialog "Configure status overview" (categories with a list on the left and their settings on the right, datapoints, reminder list, rows, names, battery types); the panel keeps only the quick display options
- 🌟 **New feature:** Status overview - new setting "Additional battery datapoints" in the battery category: datapoints matching these patterns (text or /regex/) count as batteries even without a battery role, e.g. Shelly devices mirrored over MQTT; numbers or text are read as a level in %, booleans as a low-battery flag


### 1.3.0-next.0 (2026-11-20) — next/test release
- 🐛 **Bug fix:** Status overview - aliases filed as alias.0.<room>.<device>.<state> now count as one device each instead of the whole room folder, so a percent battery alias no longer hides the voltage and LOWBAT aliases of the other devices in that room; device names and the battery level lookup follow ([#1002](https://github.com/hdering/ioBroker.aura/issues/1002))
- 🌟 **New feature:** Status overview - new layout "Table": every part of a row is a column lined up across all rows, so values, battery types and rooms sit under each other, with a header row of column names; new "Row layout" setting to order, place (left / behind the name / right; two-line layout: line 1 / line 2 / right) and hide the parts of a row, e.g. the battery type before the value ([#1003](https://github.com/hdering/ioBroker.aura/issues/1003))
- 🌟 **New feature:** Adapter - new message "help": a description of all messages for AI agents (e.g. pi-agent) and script authors, and common.supportedMessages.help
- 🌟 **New feature:** Datapoint picker - new "Pin filters" button: the chosen filters (e.g. adapter "alias") are remembered and every picker opens with them; changes are kept while pinned, "Unpin" goes back to the default ([#1005](https://github.com/hdering/ioBroker.aura/issues/1005))
- 🌟 **New feature:** Click actions - the URL of "External link" and "iFrame popup" may contain datapoint placeholders: {dp} is the value of the clicked list row (or the widget's datapoint), {adapter.0.id} that of any datapoint; e.g. http://{dp}/ opens an IP stored in a datapoint, a missing http:// is added ([#1006](https://github.com/hdering/ioBroker.aura/issues/1006))


### 1.2.0-next.0 (2026-11-19) — next/test release
- 🌟 **New feature:** Web components - bind the value a component edits (e.g. a schedule or a list) to a datapoint (new widget option value datapoint); JSON text arrives as an object and changes are written back ([#958](https://github.com/hdering/ioBroker.aura/issues/958))
- 🐛 **Bug fix:** Status overview - mains-powered HomeMatic IP devices (plugs, switches, dimmers) whose OPERATING_VOLTAGE reads 0 V are no longer reported as weak batteries; entries already remembered for them disappear ([#1000](https://github.com/hdering/ioBroker.aura/issues/1000))
- 🌟 **New feature:** Status overview - new "Detected datapoints" list in the widget editor: every found datapoint has a checkbox to hide it (stored in the existing exclusion list), and an alias and the datapoint it reads from are marked as duplicates, with one click to hide all originals or all aliases ([#1002](https://github.com/hdering/ioBroker.aura/issues/1002))


### 1.1.0-next.3 (2026-11-18) — next/test release
- 🌟 **New feature:** Status overview - choose which battery datapoints count: boolean (LOWBAT), percent, volt and millivolt, with an own warning threshold in volts; a device shows one row (percent before voltage before LOWBAT), so battery voltages like OPERATING_VOLTAGE or a Zigbee "voltage" can be listed all the time ([#1000](https://github.com/hdering/ioBroker.aura/issues/1000))
- 🐛 **Bug fix:** Status overview - the adapter field under "Restriction" is now labelled as an include filter ("only these adapters, empty = all"), and the exclusion pattern shows how to hide a whole adapter ([#998](https://github.com/hdering/ioBroker.aura/issues/998))
- 🌟 **New feature:** Web components - when a component cannot be loaded, the widget now says why: its file is not served (upload the adapter again) or the shared React (/lib/esm/react-19.js) is missing, which behind the web extension needs web 9.2.0; the backend check ("Check backend") reports the same for the web extension's instance; behind the web extension (<web>/aura/) with web before 9.2.0, Aura now serves /lib/esm/react-19.js itself, so web components such as flow, TR-064 or Laundrylens load there too (after a restart of the web instance)
- 🐛 **Bug fix:** Universal widget (custom grid) - a cell without its own horizontal alignment is centred; the editor now marks "Centre" for it instead of "Left", so choosing "Left" takes effect right away ([#1001](https://github.com/hdering/ioBroker.aura/issues/1001))


### 1.1.0-next.2 (2026-11-17) — next/test release
- 🐛 **Bug fix:** Last change - the datapoint field for the timestamp is now also shown when the widget has its own datapoint; a fixed id left there (e.g. in a device card child) made every card show the same time and could not be seen or cleared ([#996](https://github.com/hdering/ioBroker.aura/issues/996))


### 1.1.0-next.1 (2026-11-17) — next/test release
- 🐛 **Bug fix:** Status overview - classic HomeMatic window/door contacts (role value.window, e.g. HM-Sec-SCo) are now found, one row per window; a heating group's window state no longer duplicates the contacts of its room
- 🌟 **New feature:** Status overview - better default names: generic channel names like "Channel sensor" give way to the device name, and a state name repeating its channel ("X:0.LOW_BAT") loses the prefix; new name filter preset to drop the HomeMatic channel number
- 🌟 **New feature:** Status overview - own display names per device ("Edit device names"), used for every row of the device, the remembered hints and the history


### 1.1.0-next.0 (2026-11-16) — next/test release
- 🐛 **Bug fix:** Adapter - no more "adapter is shutting down" warnings and "Connection is closed" rejection when the instance restarts itself right after an update
- 🌟 **New feature:** The loading bar along the top edge also runs while the connection to ioBroker is being established (start-up, reconnect) until the offline banner appears, so a page without any hint is always current


### 1.0.2 (2026-11-15)
- 🌟 **New feature:** Thin loading bar along the top edge while the values are refreshed after the app wakes up or reconnects ([#992](https://github.com/hdering/ioBroker.aura/issues/992))
- 🌟 **New feature:** Circle menu - hide single entries (e.g. Stop for shutters, −/+ for thermostats) with the eye in the order list; thermostat and room climate can drop the setpoint in the middle of the open menu ([#993](https://github.com/hdering/ioBroker.aura/issues/993))


### 1.0.1 (2026-11-15)
- 🐛 **Bug fix:** Clients - a client delete via clients.deleteRequest written with ack=true is now ignored and logged instead of executed; write it without ack
- 🐛 **Bug fix:** Network requests to the WebSocket proxy and through the web extension now time out instead of hanging
- 🐛 **Bug fix:** Device card - without frame, its widgets no longer end short on the right in the phone/tablet stack in browsers with classic scrollbars such as Fully Kiosk ([#989](https://github.com/hdering/ioBroker.aura/issues/989))
- 🌟 **New feature:** Section menu - new option to pin the hamburger in the tab bar, so it stays reachable when a tab further along is open (mainly on phones)
- 🐛 **Bug fix:** Tab bar - with centred or right-aligned tabs on phones, the section-menu hamburger was cut off and the first tabs could not be scrolled into view


### 1.0.0 (2026-11-14)
- 🐛 **Bug fix:** Device card - a frameless card no longer shows a phantom border (offset and wider gaps) on tablet and phone ([#989](https://github.com/hdering/ioBroker.aura/issues/989))
- 🐛 **Bug fix:** Device card - the last-change timestamp of a child whose datapoint uses {{parent}} is shown again ([#989](https://github.com/hdering/ioBroker.aura/issues/989))


### 0.115.1 (2026-11-14)
- 🐛 **Bug fix:** Group - a mirrored device card or group no longer scrolls inside a group on phones and tablets ([#988](https://github.com/hdering/ioBroker.aura/issues/988))


### 0.115.0 (2026-11-13)
- 🌟 **New feature:** Editor - arrange mode on touch devices: tap a widget, drag its grip to move it and its corner to resize it on tablets and phones ([#699](https://github.com/hdering/ioBroker.aura/issues/699))
- 🌟 **New feature:** Editor - a short note when "scale like the frontend" is switched on, explaining that the shown heights follow the preview while the design grid is saved


## License

MIT License

Copyright (c) 2026 hdering <aura@dering-online.de>

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


























































































































































































































































































































































































































































































































































































































































































































































