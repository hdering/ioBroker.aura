# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.

- Icons - icons that still have to be fetched on a cold device are now forced to repaint, so they no longer stay invisible on Android until you touch the screen (#636)
- Menu elements - a widget added to the header, tab bar or section menu now starts at the size it would have on a dashboard and is resized by dragging the corner of its preview, pixel by pixel; the width/height fields and the per-element layout picker are gone, a new element opens itself and the whole row toggles it (#634)
