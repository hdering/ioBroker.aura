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
- feat: Header items - text items support HTML (e.g. an image per moon phase); every item carries a CSS class by slot and position, e.g. .aura-header-item-r1-right-0 (#883)
- feat: Header editor - tapping a slot in the overview no longer creates an item; use "Add item" (#883)
- feat: Dynamic list, list and status overview - the name pattern resolves {{dpname}}, {{parentname}}, {{parent2name}} ... to the object names, like the device card (#888)
