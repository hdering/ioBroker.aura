# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- "Show last change" can now show the last update instead (datapoint written, even with the same value) — in the widget display settings, carousel items, list entries, dynamic lists and custom cells
- Opening Aura below a path other than its root (e.g. an old .../aura/ bookmark) loads the dashboard again instead of a blank page - it now redirects to the root (regression in 0.77.0)
