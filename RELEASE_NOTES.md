# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.

- Widget management now lists the widgets of all layouts and sections instead of only the active one, with a layout filter and layout/section shown per widget
- Chart (advanced) - new "Consumption (difference)" aggregation for ever-rising meters (electricity, water, gas): plots consumption per hour, day, week or month instead of the meter reading, with counter resets clamped to zero (#521)
