# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- iFrame - "Keep alive" now keeps the page across tab and section switches, also with "Fill tab"; without it, a hidden iFrame is unloaded and reloads fresh when shown again (#65)
- Widgets, popups and tabs can have a background image (fit, alignment, darken): per widget under Edit → Advanced, for popups globally, per popup view and per click action, behind a tab per tab, section or layout (#442)

- Status overview - weak batteries and unreachable devices can be remembered until they are closed ("Changed"/"Acknowledge") or put back ("Later"); the adapter keeps the list for all browsers, rechecks after closing, can close on a voltage jump, and offers aura.0.status.<category>.cmd/.event for scripts
- Status overview - configurable row buttons that write a value with placeholders ({id}, {device}, {serial}, {name}, {room}), optionally after a second tap; "since …" can also be shown for batteries and reachability
