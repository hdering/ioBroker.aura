# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- Custom layout - column widths can now be set to "auto" (as wide as the content) instead of a ratio, so icon/title columns stay in place when the widget is rendered full-width on mobile
- Static and dynamic list - display-only value conversion (presets such as Wh to kWh, or a custom factor/offset) and time/date formatting, configurable per datapoint or list-wide, just like the value widget
- Static list, dynamic list and status overview - "row click" now defaults to "off": rows stay inert until a popup or navigation action is picked
- Manage datapoints - the datapoint id of the selected entry is shown in the same roomy field the value widget uses, instead of a cramped one-line strip; in the dynamic list the full path now wraps instead of being cut off
