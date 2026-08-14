# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
Chart (advanced) - new "1 year" and "total" time ranges, selectable in the config and in the frontend range switcher (#536)
Chart (advanced) - "total" charts everything the history adapter holds; the window start is detected per series instead of being configured (#536)
Chart (advanced) - consumption series accept time unit "Automatic", deriving hour/day/month/year buckets from the active time range, plus a new "Per year" unit (#536)
Chart (advanced) - time ranges beyond two months no longer lose data points to the query row limit
Conditions - new "Reload widget" effect: embedded content (iframe, camera, image) reloads when the rule fires, including widgets inside an open popup (#537)
Conditions - new "Has changed" operator matching any new value of a datapoint, so a widget can reload whenever its data source moves (#537)
Shutter - optional "actual position" datapoint for actuators whose real position lives on a read-only DP (e.g. HmIP-BROLL channel 3) while commands keep going to the controllable one; auto-detect fills it (#538)
