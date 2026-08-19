# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- Mirror - every widget type can be mirrored now; the menu widget reported an unknown type
- Menu - a mirrored menu shows the layout being edited instead of the first one
- Advanced chart - stacked areas are now filled with the colour you picked instead of a paler mix with the background (#557)
- Advanced chart - new "Area opacity" option per series sets the fill strength of its area (#557)
- Chart & Climate - new "Horizontal grid lines" option draws helper lines at the y values, like in the advanced chart (#558)
