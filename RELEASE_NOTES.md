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
- fix: Group - the group action no longer makes the group and its children taller; the divider under the title stays at the same height with and without it (#915)
- fix: News - the ticker no longer stops on touch screens after it was tapped or swiped over; pausing on hover now only applies to mouse pointers (#916)
- feat: Tabs - linked tabs: a tab can be shown in further layouts via '+ Tab' > 'Link an existing tab' in the editor; name, icon and order stay per layout, the widgets and the PIN come from the original (#896)
- feat: Tabs - tab and section conditions resolve {{clientId}} in their datapoints, so a tab can be shown or hidden per device (#896)
- fix: Editor - the tab settings panel is more compact and no longer shows a second scrollbar; the editor page itself no longer scrolls by the height of the save bar
