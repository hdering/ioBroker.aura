# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.

- Auto-return - new "Pause" element for the header, tab bar and section menu: one tap keeps the device on the page you are looking at, and the pause ends by itself (#638)
- Auto-return - controllable per device through `aura.0.clients.<id>.idleReturn.snoozeMinutes` and `.delay` (and for all devices through `aura.0.idleReturn.*`) (#638)
- Auto-return - can now be switched off per section and per tab; scrolling counts as activity and a fullscreen widget suspends it (#638)
