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
- feat: Sections - conditions like on tabs: colour the icon/text/background, pulse/blink, hide or disable the menu entry (#907)
- fix: Section bar - markers sit on the entry's corner instead of widening it, so entries no longer get pushed out of the bar on phones (#907)
- feat: Tabs - a condition's accent colour now also colours the icon of an inactive tab (#907)
- feat: Tab bar - new switch to hide the tab bar in the frontend (global, per layout or per section); tabs stay reachable through their address (#910)
