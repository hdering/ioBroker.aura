# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- Status overview - new row action "Ignore" (option latchIgnore, with confirmation) hides a false alarm such as an empty wallbox for good; ignored datapoints are never remembered again and can be shown and restored with showIgnored
- Status overview - commands on status.<cat>.cmd run one after another, accept several ids (remove:<id1>,<id2>) and report their outcome in status.<cat>.cmdResult; excluded datapoints (excludeIdPatterns) take effect in the adapter immediately, without a browser
- Status overview - remembered entries of datapoints with a bare name (e.g. vehicleSoc) are named after their channel or title
