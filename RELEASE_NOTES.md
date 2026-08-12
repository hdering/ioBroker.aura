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
