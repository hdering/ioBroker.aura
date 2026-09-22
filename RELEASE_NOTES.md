# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- Room climate - add any number of extra readings (CO2, VOC, dew point, comfort, air quality, brightness, presence) with their own units, colour bands and value labels; dew point, absolute humidity and comfort are calculated from temperature and humidity (#698)
- Room climate - the chart can now draw those readings as extra series, on a second y axis where the scale differs (#698)
