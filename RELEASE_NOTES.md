# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.

- Date picker - custom patterns without a native field (e.g. `yyyy`, `dd.MM`) now open a picker list of their own instead of only accepting typed input
- Shutter - slat tilt for venetian blinds and external blinds: its own datapoint with value range and inversion, a vertical regulator beside the blind graphic (left or right), step buttons or a popover in the flat layouts, and an option for whether the slats already follow the regulator while dragging (#547)
