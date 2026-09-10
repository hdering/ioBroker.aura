# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- evcc - the widget is now called "Energiefluss (evcc)", and a freshly added one matches the text and icon size of every other widget instead of towering over them; automatic scaling only shrinks a narrow tile, and the size sliders still scale it up (#629)
- evcc - the widget now follows the global font scale like the other widgets do
- Date/time fields - no more double picker icon: where a browser insists on drawing its own clock, Aura no longer puts a second one next to it (#633)
- evcc - pick the evcc instance from a dropdown of the ones actually installed, and type a prefix by hand when none is; clearing the prefix field no longer snapped the old value back and appended what you typed next (#629)
- evcc - production and house consumption can now come from datapoints of your own, like grid and battery already could; with all five set the widget draws any PV system without an evcc instance, and the settings are named accordingly (#629)
