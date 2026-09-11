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
- evcc - the data source is now a dropdown of the energy instances actually installed (evcc, SMA, Fronius, E3/DC, Kostal, SENEC, sonnen, Victron, Shelly and more), or "manual"; picking a non-evcc one searches what that instance publishes and fills in the five datapoints, reporting what it found and what it could not (#629)
- evcc - power datapoints in kW are converted automatically, read from the datapoint's own unit, so an inverter reporting kW no longer draws an empty diagram (#629)
- Header - the single clock and single datapoint slot became a list: add as many clocks, datapoints and texts as you like, on the left next to the title or on the right; existing settings are carried over automatically (#634)
- Header, tab bar and section menu - a menu element can now be any widget, either a reference to one that already sits on a dashboard or an instance of its own; pick which of the widget's layouts the menu draws (a fresh one starts on the densest, so a switch no longer towers over a 32px bar), and its conditions, badges and click actions work there just as they do on the dashboard (#634)
- Conditions - the AND/OR between two clauses can now be set per row instead of for the whole rule, and clauses can be bracketed; a preview line spells out what the rule reads as (#635)
- Icons - widget, tab and list icons are now delivered by Aura itself instead of the public Iconify servers, so they also show up in Samsung Internet, Opera, Fully Kiosk and other browsers that block those hosts, and on a tablet with no internet; the icon search in the editor takes the same route (#636)
