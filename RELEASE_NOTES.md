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
- feat: Group / Device card - new "No frame" option: no background, border or inner spacing, the widgets inside sit on the tab grid with the same edges and height as outside (#981)
- feat: Editor - resizing a widget shows its live size (grid cells and px) (#981)
- feat: Editor - nested groups without a header (e.g. a device card in a group) no longer stack their toolbars: the innermost one is shown, a button switches to the parent, and each level has its own colour (#981)
