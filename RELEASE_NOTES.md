# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.

MCP - aura_validate and aura_review now report a chart series whose datapoint no history adapter records, plus a typo in a series datapoint
MCP - aura_review takes a scope (one tab or the whole dashboard) and no longer reports element ids as missing datapoints or a power reading as a meter
MCP - energy balance entries are checked for history too, a datapoint logged to an uninstalled instance is reported, and aura_dashboard names the available history adapters
MCP - conditions.elements is now described in the schema (icon/title/value with their fields) instead of being an untyped object
