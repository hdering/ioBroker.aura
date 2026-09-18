# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- Layouts - the admin page is now a master-detail view like Frontend Design: a tree of layouts and sections on the left, the selected one on the right with labelled actions, a section list with default section and menu visibility, and a searchable tab list with default tab, hidden state and drag ordering
- Menu widget - new "Overview" mode lists every section of the layout with its tabs as clickable chips, generated from the layout itself, with optional search field, group titles, chip size and an "all layouts" source (#669)
- Chart (Advanced) - a legend that wraps onto several rows no longer covers the chart; the plot now starts below the last legend row (#673)
