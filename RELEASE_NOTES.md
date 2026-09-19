# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.

- Collapsed widgets - the folded card keeps a fixed slim padding and no longer shrinks onto the bare title row on dashboards with little widget padding, so the corner buttons stay inside the card (#676)
- Switch, dimmer, list rows, custom-layout cells and the group master switch can show a checkbox instead of the slide toggle (#683)
- Datapoint picker - a new toggle shows the ioBroker object tree instead of the flat list, and the browser remembers the chosen view (#686)
