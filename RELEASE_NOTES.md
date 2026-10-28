# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- Phone/tablet column flow - a column block can split its width unevenly (e.g. 2:1, 1:2:1), so a widget can take two thirds next to one taking one third (#851)
- Announcements - new admin page "Ansagen": datapoint + condition → spoken text on chosen devices, with time window, weekdays and a lock such as at most once a day, no script needed (#834)
