# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- Editor - the import dialog now closes with ESC like every other dialog (#684)
- Chart (advanced) - rolling charts no longer draw a duplicate first bar from the reading before the window (#685)
- Group - the editor no longer lets a group whose height follows its children be dragged taller or shorter than the frontend renders it; the box could show a height that was never saved and snapped back on the next edit (#680)
