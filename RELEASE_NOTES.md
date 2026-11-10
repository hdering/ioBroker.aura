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
- feat: List - shutter rows get a button size option, like the Rollladen widget (#943)
- fix: Web component - Aura draws the title, the component no longer adds its own second title (e.g. the name of the cameras' RTSP picture)
- feat: Web component - title and icon can come from the component instead of the widget (Title from / Icon from)
- feat: Web component - new option "Click on the component" (Off / Component): off by default - a click belongs to the widget and runs its normal click action; interactive components (e.g. calendar) need "Component"
- feat: Web component - dialogs of a component open as a popup of the widget and follow its popup options (size, fullscreen, look)
- fix: Adapter status - available updates follow the active repository: after switching back from Beta to Stable the Beta updates disappear right away instead of staying until admin's next repository check (#962)
