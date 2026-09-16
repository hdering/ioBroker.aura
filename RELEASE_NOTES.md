# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- Gauge, Dial, Level and Slider - the scale now starts on the range the datapoint declares (common.min/max) instead of always 0...100; an existing widget gets a one-click hint in the editor (#665)
- Diagnostics - the `?diag=1` report now names the elements a redraw loop mounts and discards, and counts state changes, reconnects and subscribed datapoints even when the report was opened on a page that was already running (#636)
