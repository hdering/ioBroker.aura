# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.

- Advanced chart - a timeseries chart can now mix history series with JSON datapoint series on one time axis, e.g. measured values plus a solar forecast (#595)
- Advanced chart - mode and series moved into the "Manage datapoints" dialog: series list on the left, the selected series in full detail on the right, global settings stay in the options panel
- Advanced chart - switching the mode no longer overwrites the series: a chart with a JSON series kept its data source after a look into another mode and back
