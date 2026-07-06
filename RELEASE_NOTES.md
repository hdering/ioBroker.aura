# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
Map - opens on a sensible overview and zooms to the marker once its position resolves (no more long wait on a blank zoomed-in patch)
Map - keeps following a slowly moving marker instead of staying put on small position changes
Datapoint picker - adds a "Show inactive" toggle to reveal states of disabled/uninstalled adapters and orphaned or imported datapoints
