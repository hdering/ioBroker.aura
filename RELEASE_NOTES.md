# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
Import - tab/section/layout imports now keep their original size: exports record the source grid geometry and imports rescale widgets (and group children) to your grid, so a tab built on a larger grid no longer imports tiny and squeezed (legacy files without geometry are auto-fitted)
