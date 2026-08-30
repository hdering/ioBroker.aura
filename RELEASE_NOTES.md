# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.

- Lists - a condition on a row now reaches every display type and every layout: text size and colour on the switch labels, sensor states, window contacts, sliders, steppers and the date/text fields, and the icon swap/hide in the minimal layout (#601)
- Conditions - a rule watching a list with "one entry" now sends one message per triggering entry, and the message text can address that entry with {{dp}} / {{parent}} / {{name}} - e.g. a title of "Motion: [[{{parent}}.NAME]]" (#605)
