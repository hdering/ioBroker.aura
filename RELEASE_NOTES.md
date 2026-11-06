# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
# Kind (recommended): start the bullet with 'feat:' or 'fix:' - the release turns it
# into the New feature / Bug fix marker; unmarked entries are asked for (or stay unmarked).
- fix: AI access (MCP) - backups taken before each change are now gzipped, a burst of changes within a minute shares one, and old ones are deleted (keep count and days configurable in the instance settings; existing files are cleaned up on start)
- fix: Chart - a series that drops out of a multi-series JSON datapoint now disappears from the time-series chart right away instead of staying drawn until reload (#926)
- feat: Universal widget (custom grid) - new per-cell line height option, so large values fit flat cells instead of being cut at the top (#933)
- feat: AI access (MCP) - with the web adapter extension switched on, the MCP endpoint is also reachable as `<web-port>/aura/mcp` and authenticates with its own token even when the web instance requires a login (needs a web adapter newer than 9.2.0)
- fix: Aura writes its own instance settings at most once per start - a PIN reset or an MCP token stored in clear text no longer restarts Aura (and the web instance with the extension switched on) several times in a row
- feat: Web components - every ioBroker web component of an installed adapter (e.g. the flow diagram of the flow adapter) appears as a widget of its own in the "New widget" dialog, with its own name, icon, size and settings, Aura's theme colors and tab navigation; the flow diagram can be added even before the flow adapter is installed (its settings name the missing adapter), the edit dialog shows the component's name as widget type, and title and icon are on by default (#891)
- feat: Settings - new option "Reachable on: only via the web instance (/aura/)" closes Aura's own port 8095 for the network; instance links and the MCP client block then point to `<web-port>/aura/`
- feat: js-controller 8 - Aura's port and listen address show up in the host's used resources, and a port already held by another instance is named in the log
- fix: Web adapter extension - together with another web extension that handles its own WebSockets (e.g. victron-cerbo), every socket connection of the web instance was closed right after connecting ("ws connection error: CLOSE_ABNORMAL", endless reconnects); Aura now leaves the web instance's WebSocket listeners untouched
