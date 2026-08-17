# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- Advanced chart - stacked areas are drawn without an outline, so a series sitting at 0 no longer looks like a line; the outline can be switched back on per series, and line width can now be set to 0 (#541)
- Advanced chart - the right Y axis can be left unlabelled while still scaling its series, and the axis labels now take exactly the width they need instead of a fixed strip, so short labels no longer leave an empty band and long ones are no longer cut off (#541)
- Date picker - time and date fields now always show a button that opens the picker, also in browsers that draw none themselves (in Firefox a "HH:mm" field offered no dropdown at all); applies to the widget, custom layout cells and the timer event editor (#544)
