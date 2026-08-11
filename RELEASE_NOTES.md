# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- iFrame/Camera - embedded pages no longer show a permanent scrollbar on desktop when interaction is set to "click action only" (#529)
- Camera - HTML streams now offer the same interaction setting as the iFrame widget (click action / operable content) (#529)
- Connected devices - devices that never finished registering (missing navigate and popup datapoints) now complete their object tree automatically on the next connect (#532)
- Connected devices - "last seen" is now refreshed on every connect instead of only at first registration (#532)
- List / Dynamic list / Status overview - a row click now opens the datapoints of the clicked device by default (same branch, relevant datapoints only); the previous role-based popup is still available as "Automatisch"
