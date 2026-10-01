# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- Adapter logs - the search field can be preset in the widget settings; the frontend starts filtered and the text can still be changed; several terms separated by "|" match any of them (#727)
- Camera - MJPEG stream URLs (e.g. `.../stream.mjpeg`) now always play live; the refresh interval no longer reloads them every few seconds
- Universal widget - the grid is no longer capped at 20 rows and columns (#735)
