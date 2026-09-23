# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- Room climate - add any number of extra readings (CO2, VOC, dew point, comfort, air quality, brightness, presence) with their own units, colour bands and value labels; dew point, absolute humidity and comfort are calculated from temperature and humidity (#698)
- Room climate - the chart can now draw those readings as extra series, on a second y axis where the scale differs (#698)
- Settings - the Layouts and Frontend design pages no longer overflow or squeeze their buttons on a phone; their layout/scope tree folds into a bar above the detail
- List - on a phone the "Manage datapoints" dialog folds the datapoint list into a bar above the editor, so the selected entry can be configured
- Widgets with a click action now show a small icon that runs it, also in the folded header of a collapsed widget; it can be switched off, moved to another corner or given its own symbol under Appearance (#702)
- Widgets can show extra values in their header, expanded and collapsed: a datapoint, a value the widget already has (main value, list sum, average, count …), a text with bindings or the click-action icon, beside the title or in a second row; set up under Appearance → Header (#676)
- Settings - a protected tab or section no longer shows up empty in the editor after an update, and "Remove PIN" works again: a login kept from an older version now asks for the admin password once (#704)
- Chart (advanced) - the labels of the first and last point of a JSON chart are no longer cut off at the edge (#703)
- Settings - the overview no longer lists the mode-dependent datapoints of an air-conditioner widget (Daikin `{mode}`) as missing; they are only reported when no operation mode has them (#701)
- Energy flow (evcc) - supports the new charge modes of evcc 0.316: Off · Smart · Now plus an "always charge" toggle; older evcc versions keep PV and Min+PV (#700)
