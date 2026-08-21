# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
Custom layout - switch cells in button mode can now carry separate captions, background and text colours for ON / true / 1 and OFF / false / 0
Dynamic list - the datapoint search can now filter by custom enum categories (e.g. enum.floors); floors that hold rooms resolve down to the datapoints of those rooms (#568)
Advanced chart - new "Show percentage share of the stack" option labels each stacked value with its share of the stack total, alone or in brackets behind the value, and adds it to the tooltip (#569)
HTML - the HTML code can now contain live datapoint placeholders: {any.dp.id} for any state, {dp} for the widget's own value datapoint, both with an optional JSON path ({dp}#battery.soc); placeholders are also filled in HTML that comes from a datapoint
