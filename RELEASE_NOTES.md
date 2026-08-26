# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.

- Calendar - entries are no longer cut off on the left edge, keep the same spacing left and right, and follow the configured widget padding; the highlight bar of important events is visible again (#590)
- Lists - row conditions can now change the icon size, per datapoint and list-wide, in the static and the dynamic list (#572)
- List - the icon size of a row can now be set per datapoint, not only for the switch display (#572)
