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

- fix: Web components - after an adapter update the browser loads the new files of its components instead of cached ones (#954)
- fix: Thermostat - with a Homematic MANU_MODE datapoint the widget now shows the setpoint from SET_TEMPERATURE, so changes made on the device itself appear (#973)
- feat: Timer and group actions - optional delay between target datapoints, so e.g. several shutters start one after another instead of all at once; the adapter runs the sequence and stop always acts on all at once (#974)
