# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- Markers - the aggregate count of a tab or section can now count only conditional markers or sum the numbers of count markers, and a single marker can be excluded from it
- Settings - with "theme follows browser" the light and the dark theme can now be picked and fine-tuned separately: the preset grid stays usable and CSS variables have a shared, a light and a dark tab (#640)
- Settings - own themes can be saved, renamed, duplicated, exported and imported, and are offered wherever a theme is picked - including as the light or dark half of the browser sync (#640)
