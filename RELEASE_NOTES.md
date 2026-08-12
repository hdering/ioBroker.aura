# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.

- The name of every widget, and the popup heading, resolve [[dp.id]] to that datapoint's live value, e.g. "Living room [[0_userdata.0.Temp]] °C"
- Popup heading now also resolves the {{dp}} / {{parent}} / {{name}} placeholders - for a list row against the clicked row, so one heading serves every row
- Dynamic list - second line with additional datapoints, either per entry or as one template for every row via {{parent}} / {{dp}} / {{name}} placeholders, e.g. {{parent}}.BATTERY
- Dynamic list - template rows whose datapoint a device does not have are left out instead of showing a dash
- List and dynamic list - own display filters instead of just "only active / only inactive": rules with operator and value on the main datapoint, on the extra datapoints of the second line or on both, combined with AND/OR and offered by name in the filter menu
- List and dynamic list - the filter value can be picked from the values the configured datapoints currently hold, and the editor shows live how many entries a filter matches
- List and dynamic list - free-text search in the filter menu, matching the row name, the datapoint id and every value of a row
