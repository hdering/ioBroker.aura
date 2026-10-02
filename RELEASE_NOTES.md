# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- Shutter - the up/stop/down buttons work again in the card itself; in a flat card the value and slider row covered them, so only the popup reacted (#739)
- Trash schedule - new option to limit the number of entries shown, e.g. only the next 3 pickups (#736)
- Universal widget - text cells can run vertically: turned 90° clockwise, 90° counter-clockwise or as upright stacked letters (#734)
- Timer - holiday and vacation lists accept date ranges ("2026-07-20/2026-08-07" or {"from","to"}) next to single days, and a plain true/false datapoint; examples in the settings are collapsed (#738)
- Dynamic list - removed datapoints no longer come back with the next automatic sync: with a filter set they are added to the exclude list, and "Delete all" clears the stored filter
