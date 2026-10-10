# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- History table - per-column options like the JSON table (hide, order, width, alignment, wrap, background and text colour, prefix/suffix, value as date/time), sort rules and sorting by clicking a column title (#760)
- Shutter - "Re-set after drive" now restores the slat angle only once, after a drive started from the widget; drives from a wall switch or logic no longer bring the old angle back (#745)
- History table - optional time grid: one row per interval (1 min to 1 day, e.g. every 30 minutes), showing the value at that moment or the average, minimum, maximum or sum of the interval (#760)
