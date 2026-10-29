# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- Charts - a failing history query (e.g. InfluxDB refusing to average a datapoint) is now shown on the chart and logged to the browser console instead of drawing an empty or flat curve
- Datapoints with a colon (or other characters ioBroker allows, like & = /) in their ID now update live instead of only after a page reload (#874)
