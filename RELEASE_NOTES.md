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
- feat: Timer - switching times are listed in ascending order of time instead of order of entry (#960)
- fix: Web components - a component that subscribes to datapoints with a wildcard (e.g. `assistant-satellite.0.*`) now gets their changes (#955)
- feat: Web components - a component can watch every object of a pattern (e.g. events of the calendar adapter); a component that throws in its object callback no longer breaks the object updates of the others (#953)
- feat: Section menu - tabs can be listed as sub-entries under each section (collapsible or always open, per layout with a per-section override); a tap opens the tab directly (#951)
- feat: Web components - own highlighted group "Web components" in "New widget" (tested, untested and missing-adapter entries plus "Other web component …") and in the widget type list; the edit dialog shows the component, its adapter and version; the fullcalendar calendar is now a tested component
