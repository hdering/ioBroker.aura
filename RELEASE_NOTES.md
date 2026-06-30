# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
Dynamic List - optionally group datapoints by room with the room name as a section heading
Dynamic List - room section headings now support custom font size, text color and background color
General - fix datapoints with a JSON path (e.g. dp?soc) in header, tab bar and camera fields being rejected; the nested value is now shown
