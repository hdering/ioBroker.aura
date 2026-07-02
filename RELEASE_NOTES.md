# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
Weather - fix jumbled/incorrect forecast weekday labels when using adapter data source (open-meteo-weather emits DD.MM.YYYY dates)
Weather - forecast now shows rain amount consistently (0 mm on dry days) instead of hiding it, so the column no longer looks ragged
