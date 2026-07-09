# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
Status Overview - remove leftover jump-to-device behavior (no more pointer cursor or navigation on row click)
Datapoint picker - scene datapoints (scene.0.*) are now selectable and shown by default
Popups - choosing "no view" for a widget type default now correctly disables the popup instead of falling back to the built-in one
Tab bar - bottom-corner tab badges are no longer hidden behind iframe widgets that fill the tab
Dark themes - native controls (dimmer/slider rails, scrollbars, dropdowns) now render dark instead of light, so the dimmer slider rail is no longer brighter in the frontend than in the admin backend
Popups - widget visibility conditions now work inside popup/tab views (hide-widget and reflow "move others up"), matching how they behave on the dashboard
