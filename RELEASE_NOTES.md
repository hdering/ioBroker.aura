# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights

Static & dynamic list - the sum line can now also show average, minimum and maximum, each with its own icon and text prefix
Value display - the HTML template can now reference any other datapoint, e.g. {alias.0.Raeume.Draussen.Suedseite.ACTUAL}, in addition to {dp} for the widget's own value
