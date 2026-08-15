# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- Status overview - new "text alignment" setting (left / centered / right) for rows, cards and the Minimal layout's pills
- Chart (simple and advanced) - display-only value conversion, set with the fx button next to the datapoint field: presets like W to kW or Wh to kWh, or a custom factor and offset. The simple chart converts curve, current value, average and axis; the advanced one converts per series and fills in the unit of the axis the series belongs to. The datapoint and its history stay untouched (#540)
- Gauge - the value no longer sits under the needle hub, its font size is configurable, and it can be shown as a badge below the arc instead of (or next to) the big number - with its own label, like pointers 2 and 3. Each of the three pointers can now optionally take the colour of the zone its own value falls into (#539)
