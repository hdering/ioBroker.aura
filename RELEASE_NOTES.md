# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- Icons whose name contains a number (e.g. trash, table, layers, bar chart) were requested under a wrong name, so they never showed and logged "icon cache — fetch failed" without internet access (#787)
- Messages - a message closed by a script (messages.dismiss) stayed open when another message was sent in the same moment, e.g. an error followed by its all-clear
