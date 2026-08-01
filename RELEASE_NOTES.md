# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights

- Image - datapoint values holding an adapter asset path (e.g. /adapter/pirate-weather/icons/...) now render instead of staying blank; same path handling in universal widget cells, JSON table image columns, image popups, state images, switch/window contact images, camera and HTML img tags
- Every image field now lists the accepted path formats (URL, adapter path, ioBroker file, local file, base64) - see the new "Bildpfade" doc page
