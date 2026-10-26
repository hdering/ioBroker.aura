# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- Scenes - the widget settings can limit which datapoints "Add device" offers in the dashboard: whole instances or wildcard patterns like *.STATE (#825)
- Popups - a popup that closes itself after n seconds now resets the idle datapoint clients.<id>.idle.active to false, so the screensaver popup comes back after the next idle period (#856)
- Slideshow - new widget that shows photos and videos from a folder on the server, sorted by capture date (EXIF) or at random, with fade-to-black, crossfade, slide and page-turn transitions and optional video sound; works as a tile or as a screensaver (#848)
