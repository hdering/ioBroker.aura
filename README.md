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
| **web instance** | automatic | The `iobroker.web` instance to connect to. Pick one and its port, bind address and HTTPS setting are taken from it — the two fields below are then hidden |
| **ioBroker socket port** | `8082` | Only in automatic mode: port of the `iobroker.web` instance that provides the socket.io connection |
| **Web adapter uses HTTPS** | off | Only in automatic mode: enable if that web instance runs HTTPS |

> **Requirement:** A running `iobroker.web` (or `iobroker.socketio`) instance must serve socket.io on
> the configured socket port. The stock `web.0` with **socket.io = integrated** provides this on
> port `8082` (the default). Aura auto-detects the matching instance and proxies the connection
> internally, so no `/aura/` path or web extension is needed anymore.

**If anything does not work — a blank dashboard, widgets with a load error, images that stay
empty — press *Check backend* in the instance settings first.** It tests the instance, the
socket connection and the file delivery live and says in plain words what is wrong; the report
is meant to be pasted into a forum post or a GitHub issue. Aura runs the same check at every
start and writes the result to the log and to `aura.0.info.backendCheck`.

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

### 0.107.0 (2026-11-06)
- 🌟 **New feature:** Map - own tile server is a regular map type again: URL template, min/max zoom as hard limits and attribution, e.g. for offline installs with a local tile cache ([#934](https://github.com/hdering/ioBroker.aura/issues/934))
- 🌟 **New feature:** Map - recorded tracks get the chart's time controls: range chips, paging by the active range, and linking with charts via link group or date/range datapoints; long tracks are simplified (Douglas-Peucker) instead of cut to the newest points ([#929](https://github.com/hdering/ioBroker.aura/issues/929))


### 0.106.2 (2026-11-06)
- 🐛 **Bug fix:** List / dynamic list - display "Auto" no longer shows a number datapoint as a switch while it reads 0 or 1
- 🐛 **Bug fix:** Camera - snapshot refresh no longer blanks the picture; the previous image stays until the next one has loaded


### 0.106.1 (2026-11-06)
- 🐛 **Bug fix:** Section menu / tab bar - datapoint, clock and text elements in a docked section bar or the tab bar no longer stick together; they get the same spacing as in the header. In the docked section bar the element position is now labelled left / right instead of top / bottom


### 0.106.0 (2026-11-06)
- 🐛 **Bug fix:** AI access (MCP) - backups taken before each change are now gzipped, a burst of changes within a minute shares one, and old ones are deleted (keep count and days configurable in the instance settings; existing files are cleaned up on start)
- 🐛 **Bug fix:** Chart - a series that drops out of a multi-series JSON datapoint now disappears from the time-series chart right away instead of staying drawn until reload ([#926](https://github.com/hdering/ioBroker.aura/issues/926))
- 🌟 **New feature:** Universal widget (custom grid) - new per-cell line height option, so large values fit flat cells instead of being cut at the top ([#933](https://github.com/hdering/ioBroker.aura/issues/933))
- 🌟 **New feature:** AI access (MCP) - with the web adapter extension switched on, the MCP endpoint is also reachable as `<web-port>/aura/mcp` and authenticates with its own token even when the web instance requires a login (needs a web adapter newer than 9.2.0)
- 🐛 **Bug fix:** Aura writes its own instance settings at most once per start - a PIN reset or an MCP token stored in clear text no longer restarts Aura (and the web instance with the extension switched on) several times in a row
- 🌟 **New feature:** Web components - every ioBroker web component of an installed adapter (e.g. the flow diagram of the flow adapter) appears as a widget of its own in the "New widget" dialog, with its own name, icon, size and settings, Aura's theme colors and tab navigation; the flow diagram can be added even before the flow adapter is installed (its settings name the missing adapter), the edit dialog shows the component's name as widget type, and title and icon are on by default ([#891](https://github.com/hdering/ioBroker.aura/issues/891))
- 🌟 **New feature:** Settings - new option "Reachable on: only via the web instance (/aura/)" closes Aura's own port 8095 for the network; instance links and the MCP client block then point to `<web-port>/aura/`
- 🌟 **New feature:** js-controller 8 - Aura's port and listen address show up in the host's used resources, and a port already held by another instance is named in the log
- 🐛 **Bug fix:** Web adapter extension - together with another web extension that handles its own WebSockets (e.g. victron-cerbo), every socket connection of the web instance was closed right after connecting ("ws connection error: CLOSE_ABNORMAL", endless reconnects); Aura now leaves the web instance's WebSocket listeners untouched
- 🐛 **Bug fix:** HTML widget - with "fit height to content" switched on, no scrollbar appears in the frame after resizing the browser window anymore; the "Allow scrolling" option is greyed out in that mode ([#940](https://github.com/hdering/ioBroker.aura/issues/940))


### 0.105.0 (2026-11-05)
- 🌟 **New feature:** Charts - range chips and paging bar can each be made bigger (touch size) and moved below the chart ([#871](https://github.com/hdering/ioBroker.aura/issues/871))
- 🐛 **Bug fix:** Fullscreen - the close button no longer covers the top-right corner of the widget ([#871](https://github.com/hdering/ioBroker.aura/issues/871))
- 🌟 **New feature:** Countdown - announce a text or sound file when the countdown ends, on the device that started it, on all devices or on selected ones ([#918](https://github.com/hdering/ioBroker.aura/issues/918))
- 🌟 **New feature:** New Announcements widget - create, switch and test announcement rules for this device right in the dashboard; Admin - Announcements shows them as "from device" and can take them over ([#918](https://github.com/hdering/ioBroker.aura/issues/918))
- 🐛 **Bug fix:** Popup views - widgets hidden by a "show on match" condition no longer flash briefly when the popup opens, and the popup opens straight at its final height instead of shrinking into it ([#924](https://github.com/hdering/ioBroker.aura/issues/924))
- 🌟 **New feature:** Timer - an event can announce a text or sound file when it fires, on the device it was saved on or on all devices; a timer may then run without target datapoint ([#918](https://github.com/hdering/ioBroker.aura/issues/918))
- 🐛 **Bug fix:** Mirror - status symbols (battery, reachability, own symbols) of mirrored Universal, Button, Gauge and similar widgets now show in the mirror too ([#927](https://github.com/hdering/ioBroker.aura/issues/927))
- 🐛 **Bug fix:** Dimmer, Shutter - after a slider drag that ended off the slider (cancelled touch, keyboard, pointer released elsewhere) the widget no longer sticks to the dragged value and follows status updates again ([#935](https://github.com/hdering/ioBroker.aura/issues/935))
- 🐛 **Bug fix:** Instance links - with "reachable via web adapter" switched on, the quick links now also offer the backend under `<web-port>/aura/#/admin` ([#936](https://github.com/hdering/ioBroker.aura/issues/936))
- 🐛 **Bug fix:** Universal widget - the "Fullscreen" switch of a cell's click action now sticks, and the cell popup opens fullscreen; same for a list row's own click action ([#937](https://github.com/hdering/ioBroker.aura/issues/937))
- 🌟 **New feature:** Light - colour temperature and brightness range follow the datapoint's min/max when the Min/Max fields are left empty, so one shared popup fits lamps with different ranges; typed values still override ([#923](https://github.com/hdering/ioBroker.aura/issues/923))
- 🌟 **New feature:** Light - new option "Detect datapoints when shown" finds switch, brightness, colour and colour temperature in the lamp's channel at runtime (alias names ON, DIMMER, TEMPERATURE, RGB, HUE/SAT …), so ONE light widget in a shared list popup fits every lamp - no helper script or popup variants; auto-detect now also recognises single RGB hex datapoints ([#925](https://github.com/hdering/ioBroker.aura/issues/925))
- 🌟 **New feature:** Lists - rows set to "Automatic" open a fitting built-in popup per device type (light, switch, dimmer, shutter, thermostat, window contact, sensor, value), editable under Admin › Popups; a lamp opens the light popup, which finds brightness, colour and colour temperature itself; the "Click on row" tab lists what each row was recognised as and which popup it opens; Admin › Popups › List rows picks another popup per type for all lists, e.g. an edited copy ([#925](https://github.com/hdering/ioBroker.aura/issues/925))
- 🐛 **Bug fix:** Datapoint roles - colour temperature datapoints are no longer taken for a thermostat, and motion or other sensor datapoints no longer for a switch ([#925](https://github.com/hdering/ioBroker.aura/issues/925))
- 🌟 **New feature:** Popups - new placeholder {{dpunit}} for the unit of the popup's datapoint ([#925](https://github.com/hdering/ioBroker.aura/issues/925))
- 🌟 **New feature:** Dynamic list - new options to hide rows whose device reports itself unreachable (UNREACH, available, online …; the row comes back once the device answers) and alias rows whose target datapoint does not exist ([#925](https://github.com/hdering/ioBroker.aura/issues/925))
- 🐛 **Bug fix:** Date picker - time/date fields on Chrome for Android are now really sized to their value and show the clock/calendar icon instead of a dropdown arrow; the fix in 0.104.0 did not detect real Android devices ([#920](https://github.com/hdering/ioBroker.aura/issues/920))
- 🌟 **New feature:** Widgets - own padding per widget (top/bottom and left/right) under Edit › Advanced; empty keeps the layout padding, e.g. for slim bars of chips or date fields next to normal tiles ([#928](https://github.com/hdering/ioBroker.aura/issues/928))
- 🌟 **New feature:** Chart (advanced) - one JSON series can now draw several lines: with "Several series from the JSON" every entry of the datapoint (name, data, optional color, line style, axis, type) becomes its own line, so new entries show up without editing the widget; JSON data also accepts [timestamp, value] pairs ([#926](https://github.com/hdering/ioBroker.aura/issues/926))


### 0.104.0 (2026-11-04)
- 🐛 **Bug fix:** Date picker - time and date fields in Chrome on Android no longer render too wide with a dropdown arrow; they fit their value and show the clock/calendar button ([#920](https://github.com/hdering/ioBroker.aura/issues/920))
- 🌟 **New feature:** Charts - series names (advanced chart) and group titles, labels and remainder label (distribution chart) can contain bindings, e.g. a forecast date from a datapoint as the bar label ([#919](https://github.com/hdering/ioBroker.aura/issues/919))
- 🌟 **New feature:** Media player - new option "Marquee": titles and artist/album that are too long scroll instead of being cut off ([#921](https://github.com/hdering/ioBroker.aura/issues/921))
- 🌟 **New feature:** Header - clicking the dashboard title or the menu title can go to the home tab, any tab or a link; set under Header and Section menu per layout ([#922](https://github.com/hdering/ioBroker.aura/issues/922))


### 0.103.0 (2026-11-04)
- 🐛 **Bug fix:** Group - the group action no longer makes the group and its children taller; the divider under the title stays at the same height with and without it ([#915](https://github.com/hdering/ioBroker.aura/issues/915))
- 🐛 **Bug fix:** News - the ticker no longer stops on touch screens after it was tapped or swiped over; pausing on hover now only applies to mouse pointers ([#916](https://github.com/hdering/ioBroker.aura/issues/916))
- 🌟 **New feature:** Tabs - linked tabs: a tab can be shown in further layouts via '+ Tab' > 'Link an existing tab' in the editor; name, icon and order stay per layout, the widgets and the PIN come from the original ([#896](https://github.com/hdering/ioBroker.aura/issues/896))
- 🌟 **New feature:** Tabs - tab and section conditions resolve {{clientId}} in their datapoints, so a tab can be shown or hidden per device ([#896](https://github.com/hdering/ioBroker.aura/issues/896))
- 🐛 **Bug fix:** Editor - the tab settings panel is more compact and no longer shows a second scrollbar; the editor page itself no longer scrolls by the height of the save bar
- 🐛 **Bug fix:** Date picker - in the compact layout without a title the field no longer sticks out past the right edge of narrow tiles; new option 'Field alignment' places the field left, centered or right in every layout ([#917](https://github.com/hdering/ioBroker.aura/issues/917))


### 0.102.0 (2026-11-03)
- 🌟 **New feature:** Distribution chart - per-entry value conversion (e.g. Wh → kWh), converted before delta/consumption is differenced; the group reference datapoint gets its own factor
- 🌟 **New feature:** Distribution chart - optional automatic unit (850 Wh, 1.25 kWh, 3.4 MWh) for values and totals
- 🌟 **New feature:** Value conversion - new preset Wh → MWh
- 🌟 **New feature:** News - adjustable ticker text size: default, fixed px, or automatic from the widget height ([#906](https://github.com/hdering/ioBroker.aura/issues/906))
- 🌟 **New feature:** Sections - conditions like on tabs: colour the icon/text/background, pulse/blink, hide or disable the menu entry ([#907](https://github.com/hdering/ioBroker.aura/issues/907))
- 🐛 **Bug fix:** Section bar - markers sit on the entry's corner instead of widening it, so entries no longer get pushed out of the bar on phones ([#907](https://github.com/hdering/ioBroker.aura/issues/907))
- 🌟 **New feature:** Tabs - a condition's accent colour now also colours the icon of an inactive tab ([#907](https://github.com/hdering/ioBroker.aura/issues/907))
- 🌟 **New feature:** Tab bar - new switch to hide the tab bar in the frontend (global, per layout or per section); tabs stay reachable through their address ([#910](https://github.com/hdering/ioBroker.aura/issues/910))
- 🌟 **New feature:** Navigation - swipe gestures on touch devices: left/right and up/down switch tab or section (configurable per direction, globally, per layout or per section); widgets with a swipe of their own keep it ([#908](https://github.com/hdering/ioBroker.aura/issues/908))
- 🐛 **Bug fix:** Weather - the comma after the condition text sits directly behind the word instead of after a gap ("Overcast, 3°C") ([#913](https://github.com/hdering/ioBroker.aura/issues/913))
- 🌟 **New feature:** Alarm - optional touch keypad in a popup for the PIN instead of the input field, for wall tablets ([#911](https://github.com/hdering/ioBroker.aura/issues/911))
- 🌟 **New feature:** Alarm - new option "Arm only with PIN": Armed and delayed arming ask for the alarm adapter's password ([#911](https://github.com/hdering/ioBroker.aura/issues/911))
- 🌟 **New feature:** Weather - optional air pressure (hPa) next to humidity, also available as a field in the custom layout ([#909](https://github.com/hdering/ioBroker.aura/issues/909))
- 🐛 **Bug fix:** Group - the group action now also controls mirrored widgets inside the group ([#912](https://github.com/hdering/ioBroker.aura/issues/912))


### 0.101.0 (2026-11-02)
- 🌟 **New feature:** Named PINs - create a PIN once (e.g. "Kids") and pick it for any section or tab; Layouts > Access protection lists every PIN with the views it guards, changing a PIN applies everywhere at once, and existing PINs are converted automatically
- 🐛 **Bug fix:** Slideshow - the chosen transition and its time now apply on devices with "reduce motion" turned on; only slide and page turn give way to a fade, with the set time ([#903](https://github.com/hdering/ioBroker.aura/issues/903))
- 🐛 **Bug fix:** iFrame - in fullscreen the tile underneath no longer keeps playing, so sound is not heard twice and out of step; also when the iFrame sits in a group ([#904](https://github.com/hdering/ioBroker.aura/issues/904))


### 0.100.1 (2026-11-01)
- 🐛 **Bug fix:** iOS - Safari now also shows the Aura icon in the browser tab; the PNG favicon was missing from the 0.100.0 bundle ([#899](https://github.com/hdering/ioBroker.aura/issues/899))


### 0.100.0 (2026-11-01)
- 🌟 **New feature:** Header items - text items support HTML (e.g. an image per moon phase); every item carries a CSS class by slot and position, e.g. .aura-header-item-r1-right-0 ([#883](https://github.com/hdering/ioBroker.aura/issues/883))
- 🌟 **New feature:** Header editor - tapping a slot in the overview no longer creates an item; use "Add item" ([#883](https://github.com/hdering/ioBroker.aura/issues/883))
- 🌟 **New feature:** Dynamic list, list and status overview - the name pattern resolves {{dpname}}, {{parentname}}, {{parent2name}} ... to the object names, like the device card ([#888](https://github.com/hdering/ioBroker.aura/issues/888))
- 🌟 **New feature:** Menu widget - new option "Show hidden" also lists sections and tabs hidden in the tab bar, e.g. room tabs reachable only from an overview tab ([#892](https://github.com/hdering/ioBroker.aura/issues/892))
- 🌟 **New feature:** HTML widget - option "Fit height to content": the tile grows and shrinks with the HTML, e.g. a table from a datapoint, on every screen width ([#884](https://github.com/hdering/ioBroker.aura/issues/884))
- 🌟 **New feature:** Conditions - list rows, list values, custom-grid cells and tabs can now be shown disabled (greyed out, not operable) while a rule matches ([#889](https://github.com/hdering/ioBroker.aura/issues/889))
- 🐛 **Bug fix:** Group - on the phone, a group inside a group grows to show all its children instead of scrolling inside its desktop height ([#897](https://github.com/hdering/ioBroker.aura/issues/897))
- 🌟 **New feature:** Map - markers on the same spot are drawn side by side instead of on top of each other, and a line chip can show/hide the person's marker together with the track (lines.markerId) ([#895](https://github.com/hdering/ioBroker.aura/issues/895))
- 🐛 **Bug fix:** Advanced chart - the tooltip lists every visible series at the hovered moment; a series without a point at exactly that time shows its last known value instead of disappearing ([#898](https://github.com/hdering/ioBroker.aura/issues/898))
- 🌟 **New feature:** List and dynamic list - new option "Row spacing" (compact / normal / spacious) sets the space between rows independently of the text size ([#890](https://github.com/hdering/ioBroker.aura/issues/890))
- 🐛 **Bug fix:** Datapoints - after a dropped connection, widgets show the values fetched on reconnect instead of keeping their old ones until the next change; most visible on "last update" timestamps of rarely reporting sensors ([#900](https://github.com/hdering/ioBroker.aura/issues/900))


### 0.99.0 (2026-10-31)
- 🌟 **New feature:** Shutter - the actuator convention (0 % = open) can now be set in the up/down and push-button control modes too ([#876](https://github.com/hdering/ioBroker.aura/issues/876))
- 🐛 **Bug fix:** Datapoints shown in the header, tab bar and section menu now load together with the active tab instead of last
- 🐛 **Bug fix:** Thermostat - header items in the dial layout get a row of their own above the scale instead of overlapping it on narrow cards
- 🐛 **Bug fix:** Thermostat and other widgets - switching to the custom layout keeps the status symbols when only own status items are configured
- 🐛 **Bug fix:** AI assistant (MCP) - height checks now count the header subtitle and report content that reaches into the card padding or is cut off without scrolling; the custom layout template carries the status badges cell; every browser measurement names the frontend build it came from, and one from an outdated browser no longer claims that nothing is cut off
- 🐛 **Bug fix:** Gauge, HTTP action and Countdown - new widgets start one or two rows taller, so their content no longer reaches into the card edge or gets cut off
- 🐛 **Bug fix:** iFrame - with the proxy enabled, searching in single-page apps such as Paperless-ngx no longer ends in "Missing url parameter"; plain search forms keep their input too ([#881](https://github.com/hdering/ioBroker.aura/issues/881))
- 🌟 **New feature:** Slideshow - the folder can now come from a datapoint, so a script or timer can switch the album ([#880](https://github.com/hdering/ioBroker.aura/issues/880))
- 🌟 **New feature:** Dashboard values appear right away instead of after the whole object database has loaded; widgets only read the objects of the datapoints they show, and the status overview gets its datapoints from the adapter instead of downloading every object — which matters most on large installations and mobile connections ([#882](https://github.com/hdering/ioBroker.aura/issues/882))
- 🌟 **New feature:** The dashboard no longer downloads its whole configuration again every 30 seconds and after every reconnect; it only reads what changed, which saves a lot of traffic on mobile connections ([#882](https://github.com/hdering/ioBroker.aura/issues/882))
- 🌟 **New feature:** Aura's web server lets the browser cache the app files and sends them compressed (5.7 MB → 1.4 MB), so the dashboard opens much faster, especially on mobile connections ([#882](https://github.com/hdering/ioBroker.aura/issues/882))
- 🌟 **New feature:** The editor warns when an image is embedded as Base64: it is saved with the configuration and loaded by every device on every start, so larger images are better added as a file or URL ([#882](https://github.com/hdering/ioBroker.aura/issues/882))
- 🐛 **Bug fix:** HTML widget - images and CSS backgrounds with ioBroker paths such as `/adapter/<name>/…` now load, like in vis and Lovelace ([#885](https://github.com/hdering/ioBroker.aura/issues/885))
- 🐛 **Bug fix:** Dynamic list - "remove entries that are no longer found" works again when a list-wide display is set; the sync no longer copies that display into every entry, existing lists are cleaned up on the next sync, and the "only relevant datapoints" switch now shows its actual default (on) ([#886](https://github.com/hdering/ioBroker.aura/issues/886))
- 🐛 **Bug fix:** Widget management - the search now also finds datapoints used inside widget options, e.g. the series of the advanced chart, custom-grid cells, background images and the widgets inside groups, panels and device cards (also by their title); rows without a main datapoint show the first one they use ([#887](https://github.com/hdering/ioBroker.aura/issues/887))
- 🌟 **New feature:** Dynamic list - the periodic search for new datapoints now runs in the adapter, so lists stay up to date even when no browser has them open, and several open devices no longer each save the dashboard ([#893](https://github.com/hdering/ioBroker.aura/issues/893))
- 🐛 **Bug fix:** Device card - the conditions and badges editors of a child widget show `{{dp}}` again instead of the resolved datapoint, so editing a rule no longer replaces the placeholder with the datapoint of the preview device ([#894](https://github.com/hdering/ioBroker.aura/issues/894))


### 0.98.0 (2026-10-30)
- 🐛 **Bug fix:** Advanced chart - optional label at the now line (e.g. "now {HH:mm}"), at the top or bottom of the line
- 🐛 **Bug fix:** Advanced chart - short explanations under the paging and forecast settings in the editor
- 🐛 **Bug fix:** Dimmer, slider, light and input bar sliders can be dragged with a finger again on phones and tablets; the dimmer shows the percentage while dragging in every layout
- 🐛 **Bug fix:** Charts - paging bar: the date now sits before the arrows, so ‹ › no longer move away from under the pointer while paging; on a narrow chart the bar moves to a row of its own instead of squeezing out the range chips
- 🐛 **Bug fix:** Popups - widgets in popup views and embedded widgets now look and behave exactly as on the tab: own title and icon colours, header items, status row, conditions (including a locked widget), style overrides, wrapped titles and the CSS classes for custom styles
- 🐛 **Bug fix:** Popups - an embedded widget keeps its proportions instead of being stretched to a square (the media player's controls were cut off)
- 🐛 **Bug fix:** Popup editor - a new widget gets its type's default size, and the toolbar wraps so the widget just added stays in view
- 🐛 **Bug fix:** Advanced chart - unit per series: the tooltip, value labels and current value use it ahead of the axis unit, e.g. for a series on a third y axis added via JSON
- 🐛 **Bug fix:** Advanced chart - a series without any point in the shown window (e.g. measured values on a forecast-only day) no longer draws a flat line at 0; its legend entry stays, greyed out
- 🐛 **Bug fix:** Charts - link groups can share the date only (navGroupMode / echartNavGroupMode "date"): linked charts page together while each keeps its own range
- 🐛 **Bug fix:** Advanced chart - custom layout: the chart itself is a cell component ("Diagram"), so buttons and texts can be placed around it; chart cells can mirror charts from popup views and say why a chart is not shown
- 🐛 **Bug fix:** Energy balance - pie and donut charts show up on iPhone and iPad again (Safari, Firefox and every other iOS browser) ([#877](https://github.com/hdering/ioBroker.aura/issues/877))
- 🐛 **Bug fix:** Popup editor - "New widget" opens the same dialog as the dashboard editor (search, templates, datapoint detection, recently used, presets), with {{dp}} prefilled; the type dropdown is gone
- 🐛 **Bug fix:** Layouts - Navigation: the idle and auto-return delays accept typed values again instead of jumping to the minimum on the first digit ([#878](https://github.com/hdering/ioBroker.aura/issues/878))
- 🐛 **Bug fix:** Custom layout - new vertical alignment "Baseline" for text cells: cells of one row sit on the same text line, e.g. a large value next to a smaller unit ([#879](https://github.com/hdering/ioBroker.aura/issues/879))


### 0.97.1 (2026-10-29)
- 🐛 **Bug fix:** Advanced chart - forecasts: the time series can reach into the future: a rolling lead per chip (`2d+36h`) or for all chips, paging forward up to the last forecast point or a fixed limit, and a current period that starts today


### 0.97.0 (2026-10-29)
- 🐛 **Bug fix:** Charts - a failing history query (e.g. InfluxDB refusing to average a datapoint) is now shown on the chart and logged to the browser console instead of drawing an empty or flat curve
- 🐛 **Bug fix:** Datapoints with a colon (or other characters ioBroker allows, like & = /) in their ID now update live instead of only after a page reload ([#874](https://github.com/hdering/ioBroker.aura/issues/874))
- 🐛 **Bug fix:** Speech output - devices whose browser has no voice of its own (e.g. Fully Kiosk on Android) now speak text announcements through an online voice served by Aura; can be switched off in the instance settings, then speech.lastResult reports unsupported ([#834](https://github.com/hdering/ioBroker.aura/issues/834))
- 🌟 **New feature:** Status symbols - an own status entry can now show its datapoint as a value (number with unit or text with bindings) instead of an icon, in any corner of the widget; optional highlight rule with comparisons like >30 ([#875](https://github.com/hdering/ioBroker.aura/issues/875))
- 🐛 **Bug fix:** Shutter - the position inversion option ("Actuator convention") is no longer labelled as HmIP-only; the hint now also names KNX actuators where 0 % means open ([#876](https://github.com/hdering/ioBroker.aura/issues/876))


### 0.96.0 (2026-10-28)
- 🌟 **New feature:** Phone/tablet column flow - a column block can split its width unevenly (e.g. 2:1, 1:2:1), so a widget can take two thirds next to one taking one third ([#851](https://github.com/hdering/ioBroker.aura/issues/851))
- 🌟 **New feature:** Announcements - new admin page "Ansagen": datapoint + condition → spoken text on chosen devices, with time window, weekdays and a lock such as at most once a day, no script needed ([#834](https://github.com/hdering/ioBroker.aura/issues/834))
- 🐛 **Bug fix:** Advanced chart - time axis labels no longer overlap on narrow charts; labels that would collide are left out; the approximate number of labels can be set under X axis ([#869](https://github.com/hdering/ioBroker.aura/issues/869))
- 🐛 **Bug fix:** Advanced chart - settings that do not apply to the selected mode are shown greyed out with the reason instead of disappearing; the horizontal lines switch now also works in comparison mode ([#869](https://github.com/hdering/ioBroker.aura/issues/869))
- 🐛 **Bug fix:** Universal widget - vertical and horizontal grid lines are now visible in borderless themes such as Lovelace and Material 3 ([#870](https://github.com/hdering/ioBroker.aura/issues/870))
- 🐛 **Bug fix:** Admin - all admin pages (overview, layouts, popups, messages, announcements, widgets, frontend design, settings …) now use the same heading size, the same distance to the top and the same gap between heading and content
- 🐛 **Bug fix:** Universal widget - a select cell shown as circle menu can show a second datapoint large in the button (e.g. the measured temperature), with the selected entry small below ([#864](https://github.com/hdering/ioBroker.aura/issues/864))
- 🌟 **New feature:** Image, slideshow and camera - new option "Fill tab" like the iFrame: the widget covers the whole tab area, e.g. as a photo frame on a wall tablet; "Fill tab" now also works in popup views, where the widget fills the fullscreen popup or the set popup size, and the popup view editor shows it covering the whole canvas ([#865](https://github.com/hdering/ioBroker.aura/issues/865))
- 🐛 **Bug fix:** Universal widget - slider cell gets an optional status datapoint like the slider widget: the position and value come from it, dragging still writes the main datapoint ([#866](https://github.com/hdering/ioBroker.aura/issues/866))
- 🌟 **New feature:** Advanced chart - paging steps by the selected range (day, week, month …) and switching the range keeps the browsed date; the picked date can be the end or the start of the window; charts with the same link group page together, and optional datapoints set or report date and range or page from a script/button (prev, next, today, now) ([#871](https://github.com/hdering/ioBroker.aura/issues/871))
- 🌟 **New feature:** Simple chart and distribution chart - same paging as the advanced chart (prev/next by the selected range, jump to current, date picker), link groups that work across all three chart types, and the date/range/command datapoints; the distribution chart also gets weeks, calendar months and years for its own range, a 1-year preset and own range chips ([#871](https://github.com/hdering/ioBroker.aura/issues/871))
- 🐛 **Bug fix:** Screensaver - new datapoints idle.allIdle (true once no panel is in use) and idle.inUse (number of panels in use) summarise the idle state of all devices; switched-off devices and devices with idle detection off are not counted ([#868](https://github.com/hdering/ioBroker.aura/issues/868))
- 🐛 **Bug fix:** Popups - in a fullscreen popup a single iFrame, camera, chart or other widget without its own content height now fills the whole screen edge to edge, also when embedded directly ("Show widget") and without "Fill tab"
- 🐛 **Bug fix:** Timer - new datapoint timers.<id>.reapply: set it to true (e.g. from a script) and the timer writes the value its schedule wants right now (the last due event or the active holiday/vacation value), e.g. after a power cut or manual switching; optional "Catch up on adapter start" does the same on every adapter start ([#872](https://github.com/hdering/ioBroker.aura/issues/872))


### 0.95.0 (2026-10-27)
- 🐛 **Bug fix:** Weather - the widget no longer overflows when a custom temperature font size or forecast row spacing is set
- 🐛 **Bug fix:** AI assistant (MCP) - size checks say "cannot be judged" instead of "fits" when the widget uses its own typography, and popup views can now be measured in the browser
- 🌟 **New feature:** New widget "News (RSS)" - shows RSS/Atom feeds or the rssfeed adapter as a list, cards, a ticker or a rotating headline; articles open in a popup or a new tab; optional unread marks, spoken announcements of new articles, a read-aloud button and loading images through Aura ([#854](https://github.com/hdering/ioBroker.aura/issues/854))
- 🐛 **Bug fix:** Overview - the "widget references to missing DPs" check now includes widgets inside groups and device cards right after a page reload, not only after clicking "Refresh" ([#859](https://github.com/hdering/ioBroker.aura/issues/859))
- 🐛 **Bug fix:** Slideshow - number fields such as the transition duration accept typed values again instead of jumping to the minimum on the first digit ([#860](https://github.com/hdering/ioBroker.aura/issues/860))
- 🌟 **New feature:** Popups - new datapoints popup.close (all devices) and clients.<id>.popup.close (one device): writing true closes every open popup on the device, whether opened by a click, a trigger or popup.open, stacked popups included ([#861](https://github.com/hdering/ioBroker.aura/issues/861))
- 🐛 **Bug fix:** Fill level (wave) - the charging bolt and the charging sweep stay inside the tank instead of spilling below it when the widget is taller than wide ([#863](https://github.com/hdering/ioBroker.aura/issues/863))
- 🐛 **Bug fix:** Popups - widgets in a popup view no longer stay squeezed to a fraction of the dialog (looking like the phone layout) when the popup was opened before its view had its final width, e.g. a screensaver popup ([#862](https://github.com/hdering/ioBroker.aura/issues/862))
- 🐛 **Bug fix:** Room climate - with placeholder datapoints such as {{parent}} the history series (temperature, humidity) and time range can be set again with the adapter instance left empty, so a popup can show the humidity history ([#857](https://github.com/hdering/ioBroker.aura/issues/857))
- 🌟 **New feature:** Thermostat - dial and circle menu can show the measured temperature large and the setpoint small (new option "Large display"); also for the room climate circle menu ([#864](https://github.com/hdering/ioBroker.aura/issues/864))
- 🌟 **New feature:** Phone and tablet layout - the column flow can be split into blocks with their own number of columns (1-4), e.g. four widgets in a row at the top and two wider ones below; set in the editor's mobile/tablet order panel ("+ Block" between blocks, the arrows move widgets from block to block) ([#851](https://github.com/hdering/ioBroker.aura/issues/851))


### 0.94.0 (2026-10-26)
- 🌟 **New feature:** Scenes - the widget settings can limit which datapoints "Add device" offers in the dashboard: whole instances or wildcard patterns like *.STATE ([#825](https://github.com/hdering/ioBroker.aura/issues/825))
- Popups - a popup that closes itself after n seconds now resets the idle datapoint clients.<id>.idle.active to false, so the screensaver popup comes back after the next idle period ([#856](https://github.com/hdering/ioBroker.aura/issues/856))
- 🌟 **New feature:** Slideshow - new widget that shows photos and videos from a folder on the server, sorted by capture date (EXIF) or at random, with fade-to-black, crossfade, slide and page-turn transitions and optional video sound; works as a tile or as a screensaver ([#848](https://github.com/hdering/ioBroker.aura/issues/848))
- Room climate - in a popup opened from a list row with {{parent}} datapoints the history chart now shows data: an empty history instance falls back to the triggering widget's instance or is detected from the datapoint ([#857](https://github.com/hdering/ioBroker.aura/issues/857))
- 🌟 **New feature:** Popups - a datapoint trigger can now combine several conditions with AND / OR and brackets, e.g. doorbell AND someone at home; the popup opens when the combination becomes true ([#849](https://github.com/hdering/ioBroker.aura/issues/849))
- Editor - the settings popovers of sections and tabs are wider while markers or conditions are open and can be dragged wider at their edge (double-click resets); a marker condition row wraps instead of squeezing the datapoint field ([#850](https://github.com/hdering/ioBroker.aura/issues/850))
- 🌟 **New feature:** JSON table - new per-column switch "Mapping" (Zuordnung): show chosen values as an icon and/or text in their own colour, e.g. a call list type 1/2/3 as incoming/missed/outgoing phone icons; the entries can be imported from common.states of a datapoint ([#852](https://github.com/hdering/ioBroker.aura/issues/852))
- 🌟 **New feature:** JSON table - a row click can open a popup for that entry: the row's fields, hidden columns included, are available as {{row_<field>}} (raw) and {{rowtext_<field>}} (as printed) in the popup title, an HTML popup or a popup view; HTML popups now resolve {{...}} placeholders in their static markup ([#858](https://github.com/hdering/ioBroker.aura/issues/858))
- Image / Camera - new option "Reload on change of" (reloadDp): every write to that datapoint reloads the picture or stream, e.g. after a script saved a new snapshot under the same name; the image widget also reloads when its source datapoint is written again with the same path, and its refresh interval now works for a datapoint source too ([#853](https://github.com/hdering/ioBroker.aura/issues/853))
- 🌟 **New feature:** iFrame - new sound button (on/off) and "start muted" option for videos and audio inside the embedded page; works for pages loaded through the proxy or served by Aura itself, e.g. a direct video link with the proxy switched on ([#855](https://github.com/hdering/ioBroker.aura/issues/855))
- Popups - in a popup without a fixed height, content-sized widgets (status overview, calendar, list …) now fill their grid slot like in the editor instead of ending at their content, and no longer jump in height while loading
- Connected devices - a device keeps its client id when the browser wipes its web storage (e.g. Fully kiosk), a ?client= link only applies while it is in the URL instead of sticking to the device for good, two identical tablets that start at the same time are told apart within a minute, and giving a device a fixed id no longer deletes an id that belongs to another device ([#844](https://github.com/hdering/ioBroker.aura/issues/844))


### 0.93.1 (2026-10-25)
- 🐛 **Bug fix:** Camera - .mp4/.webm clips (e.g. Ring Livestream.mp4) now play in a video player; new optional ready datapoint starts the stream when the recording is finished instead of after a fixed delay ([#843](https://github.com/hdering/ioBroker.aura/issues/843))


### 0.93.0 (2026-10-25)
- 🌟 **New feature:** Camera - intercom: an "Answer" button opens a two-way call through go2rtc (webrtc.html), with an optional call datapoint for the doorbell ([#836](https://github.com/hdering/ioBroker.aura/issues/836))
- 🐛 **Bug fix:** Universal - conditions on a switch cell in button mode now apply bold, italic, font size and text colour to the button caption; button, input and dropdown cells pick up the condition font size too ([#842](https://github.com/hdering/ioBroker.aura/issues/842))
- 🐛 **Bug fix:** Connected devices - two identical devices (e.g. two Fire tablets of the same model running Fully) no longer share one client ID; the second one moves to its own ID on its next connect ([#844](https://github.com/hdering/ioBroker.aura/issues/844))
- 🌟 New feature: Speech output - write a text, a sound file or "volume;text" to speech.say (all devices) or clients.<id>.speech.say and the dashboard speaks or plays it, queued one after another; JSON adds voice, language, rate, interrupt, "only with display on" and a target; per device: muted, volume, playing and lastResult; several tabs of one browser play an announcement once, and one older than 10 minutes (e.g. reaching a tab the browser had put to sleep) is skipped. If the browser blocks sound until a tap, an "Enable sound" button appears and the announcement plays on the next touch ([#834](https://github.com/hdering/ioBroker.aura/issues/834))
- 🌟 **New feature:** SayIt - announcements of a SayIt instance with output type "Browser" now also play on the Aura dashboards, the existing sayit.0.tts.text scripts stay unchanged ([#834](https://github.com/hdering/ioBroker.aura/issues/834))
- 🐛 **Bug fix:** Messages - new "speak" option reads title and text out on the device that shows the message; Admin → Messages → Defaults can switch it on per severity, e.g. for warnings and errors ([#834](https://github.com/hdering/ioBroker.aura/issues/834))
- 🌟 **New feature:** Room climate - new "Custom" layout: switching to it rebuilds the current layout as a custom grid, including the history chart, the value columns and the comfort badge ([#838](https://github.com/hdering/ioBroker.aura/issues/838))
- 🌟 **New feature:** Room climate - the target temperature can be set from the widget: "Target adjustable" adds -/+ beside the target and quick-select buttons, and the custom layout offers the circle menu as in the thermostat ([#838](https://github.com/hdering/ioBroker.aura/issues/838))
- 🐛 **Bug fix:** Thermostat, shutter, select - the circle menu is now also a component of the custom layout, and switching a circle layout to Custom keeps the round button ([#838](https://github.com/hdering/ioBroker.aura/issues/838))
- 🌟 **New feature:** Custom layout - the select cell can be shown as a circle menu: a round button with the current entry that fans all entries out, optionally with -/+ steps for numbers ([#838](https://github.com/hdering/ioBroker.aura/issues/838))
- 🌟 **New feature:** Custom layout - new cell type "Chart": mirrors an existing chart widget inside one cell, so a device and its history fit into one widget ([#838](https://github.com/hdering/ioBroker.aura/issues/838))
- 🐛 **Bug fix:** Device card - "Popup: widget content" on a child widget now shows the data of the card's own device instead of an empty chart or value ([#845](https://github.com/hdering/ioBroker.aura/issues/845))
- 🐛 **Bug fix:** Static list - the rule of a separator now also shows in borderless themes (Lovelace, Material 3, ...), where it stayed invisible ([#846](https://github.com/hdering/ioBroker.aura/issues/846))


## License

MIT License

Copyright (c) 2026 hdering <aura@dering-online.de>

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.























































































































































































































































































































































































































































































































































































































































































































