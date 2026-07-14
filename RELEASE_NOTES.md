# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights

- Static & Dynamic List - the "states" entry display was renamed to a more generic "value mapping"
- Static & Dynamic List - new "window/door contact" entry display reusing the contact widget's value presets (HmIP / boolean / numeric / string / custom) to map values to open / tilted / closed, with editable label, color and icon per state
