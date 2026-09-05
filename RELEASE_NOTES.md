# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- Fill - dragging an adjustable limit no longer triggers the click action of the surrounding group (#619)
- AI access (MCP) - the dashboard now reports the heights it really renders; aura_rendered shows what scrolls and where the estimate is off
- AI access (MCP) - aura_update_widgets changes several widgets in one validated write, so rearranging a column no longer fails on intermediate overlaps
- AI access (MCP) - aura_measure says how each widget type reacts to height, and aura_dashboard says on which row every tab ends
- AI access (MCP) - tab paths and popup names are accepted exactly as the error messages print them
- AI access (MCP) - new multiroom recipe, and an option a widget only reads on another layout is now reported instead of silently ignored
