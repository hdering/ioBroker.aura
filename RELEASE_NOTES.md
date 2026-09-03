# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- MCP server - aura_measure counts the last-change line under a list row (+13.7 px): per affected row for the static list, for every row where the dynamic list switches it on list-wide
- MCP server - the widget schema no longer advertises 45 options a widget never reads: the option reader followed an import into another widget and attributed its options to the wrong type (the static list alone carried 25 of them, among them maxRows, entryDisplay and groupByRoom — all measured as ineffective)
