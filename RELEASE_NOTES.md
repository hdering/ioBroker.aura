# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights

Widget Designer - save any widget as a reusable preset and insert it elsewhere; a mapping step asks for each datapoint (battery/status auto-detected from siblings)
Widget Designer - new backend page to manage presets: edit widget content, rename, delete, and export/import presets as JSON files
EVCC - grid power now reads from the JSON `status.grid` object as well, so it keeps working on adapters that expose resolved/nested nodes instead of a flat gridPower state
