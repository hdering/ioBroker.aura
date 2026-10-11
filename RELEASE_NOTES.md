# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- Settings - web adapter extension: hint that the Visu App / ioBroker.pro remote access needs the same web instance as the cloud adapter (usually web.0) (#688)
- Group / List - group switch: choose whether a click from the mixed state turns all devices on or off (#764)
- Status overview: the colour of the row buttons "Replaced/Acknowledge", "Later" and "Ignore" can be set per button, and each button carries its own CSS class.
- Fill level - LED segments: "Fill width" now keeps the configured segment count and spreads it over the tile (the old behaviour is the new "Adapt count to length" switch), up to 200 segments, and the value can sit below or beside the segments with its own font size (#765)
