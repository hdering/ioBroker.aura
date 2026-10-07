# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- Auto height - widgets with "fit height to content" (also inside groups) no longer keep empty space below their content when the fluid grid stretches its rows (#759)

- Timer - schedule entries added in the frontend are no longer lost when the widget is edited in the admin open in the same browser (#758)

- Timer - optional fixed value for vacation and holiday days: written once when the exception starts, regular events pause meanwhile and the normal schedule is restored when it ends (#757)

- Fill level - LED segments: configurable segment count and a "fill width" option that adds segments to span wide (or tall) tiles (#756)
