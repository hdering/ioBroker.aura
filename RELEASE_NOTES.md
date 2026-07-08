# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
Load times - add a dedicated backend page (Admin -> Ladezeiten) that shows the metrics live, so you can watch them from the backend while using the frontend in another tab
Load times - the dashboard widget is superseded by that backend page and is now hidden from the widget picker; existing widgets keep working
Load times - the per-widget breakdown now shows which tab each widget is on, and (on the backend page) rows link straight to that widget in the dashboard editor
