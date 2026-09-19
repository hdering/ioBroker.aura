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
- Datapoint picker - a new toggle shows the ioBroker object tree instead of the flat list, the browser remembers the chosen view, and Escape now closes the picker itself instead of the dialog behind it (#686)
- Editor - expanding or folding a collapsible widget no longer marks the widgets below it as changed (#676)
- Advanced chart - the curve no longer bends backwards at its end after the browser has been open for a while, and the history is re-read periodically so the chart keeps up with the datapoint
