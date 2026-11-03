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
- feat: Distribution chart - per-entry value conversion (e.g. Wh → kWh), converted before delta/consumption is differenced; the group reference datapoint gets its own factor
- feat: Distribution chart - optional automatic unit (850 Wh, 1.25 kWh, 3.4 MWh) for values and totals
- feat: Value conversion - new preset Wh → MWh
- feat: News - adjustable ticker text size: default, fixed px, or automatic from the widget height (#906)
