# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
MCP - aura_review no longer suggests folding a KPI row into a list: tiles with their own thresholds, conditions or badges are left out of the tile-row finding
Custom layout - a matching cell condition now colors the bar of a progress or bar-style slider cell, not just the text on it
Markers - the label text of a widget, section or tab marker now shows datapoint values, e.g. "{0_userdata.0.Pool.MaxRun} min", including operation chains and expressions like free HTML
