# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
# Kind (recommended): start the bullet with 'feat:' or 'fix:' - the release turns it
# into the New feature / Bug fix marker; unmarked entries are asked for (or stay unmarked).
- feat: Map - own tile server is a regular map type again: URL template, min/max zoom as hard limits and attribution, e.g. for offline installs with a local tile cache (#934)
- feat: Map - recorded tracks get the chart's time controls: range chips, paging by the active range, and linking with charts via link group or date/range datapoints; long tracks are simplified (Douglas-Peucker) instead of cut to the newest points (#929)
