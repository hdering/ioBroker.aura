# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
- Clock - optional source datapoint: formats a time value from a datapoint (ISO timestamp, HH:mm or Unix time) instead of the current time, with a new REL token for relative output ("in 3 h 12 min")
- evcc - grid power is read again with evcc adapter 0.2.9+ (renamed states status.Grid.Power); optional custom grid power datapoint added
- JSON table - table header stays readable in light mode when the widget is set to transparent
- Section menu - separate placement for mobile; a docked sidebar no longer forces the tab bar to stay visible with a single tab
