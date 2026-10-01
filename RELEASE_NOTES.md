# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- Adapter logs - the search field can be preset in the widget settings; the frontend starts filtered and the text can still be changed; several terms separated by "|" match any of them (#727)
- Camera - MJPEG stream URLs (e.g. `.../stream.mjpeg`) now always play live; the refresh interval no longer reloads them every few seconds
- Universal widget - the grid is no longer capped at 20 rows and columns (#735)
- Camera - a player page that reports its state (eusec `stream.html`) pauses the stream timeout while it waits for the HomeBase or plays, and names the camera the station is busy with; "start on tap" now also works without a wake-up datapoint
- Frontend - changes made in a widget on any tab other than the one last opened in the editor (timer events and master switch, auto-list sync, widgets shown in a popup) were silently dropped; they are saved again. Timers inside a group are saved too (#731)
- Custom layout - each cell can have a background colour (with transparency), filling the cell or only as a label behind its text; keeps values readable on a photo in the Image widget (#732)
