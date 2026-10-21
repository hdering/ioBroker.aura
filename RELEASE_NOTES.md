# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- Fill level - a narrow vertical battery now shows the limit value next to the battery instead of hiding it (#819)
- Screensaver - each device reports its idle state in clients.<id>.idle.active after a configurable time without input; a popup trigger on it (with {{clientId}} for every device) opens a screensaver popup that closes on the next touch (#822)
- Popups - new "Fullscreen" option makes a popup cover the whole screen without margin or frame; also available as "fullscreen": true in popup.open (#822)
