# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- Editor - the "+ Tab" wizard button is gone; tabs are built with the MCP server or from single widgets
- Import dialog - the AI prompt generator is gone; the MCP server produces better widget JSON
- List - editing a list with two rows on the same datapoint no longer leaves stale rows behind
- MCP server - aura_measure sizes a list row by its display, so a list of window contacts is no longer reported as fitting while it scrolls
