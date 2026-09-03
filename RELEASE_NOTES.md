# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- MCP server - aura_validate no longer reports a write on read-only rows: a state or contact display writes nothing, and a row with writable false is taken at its word
- MCP server - aura_validate refuses a var(--token) in an eCharts series colour: the canvas cannot resolve it and the series stays invisible, so the finding names the value to use instead
