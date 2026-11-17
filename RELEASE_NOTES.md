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
- fix: Adapter - no more "adapter is shutting down" warnings and "Connection is closed" rejection when the instance restarts itself right after an update
- feat: The loading bar along the top edge also runs while the connection to ioBroker is being established (start-up, reconnect) until the offline banner appears, so a page without any hint is always current
- fix: Status overview - classic HomeMatic window/door contacts (role value.window, e.g. HM-Sec-SCo) are now found, one row per window; a heating group's window state no longer duplicates the contacts of its room
- feat: Status overview - better default names: generic channel names like "Channel sensor" give way to the device name, and a state name repeating its channel ("X:0.LOW_BAT") loses the prefix; new name filter preset to drop the HomeMatic channel number
- feat: Status overview - own display names per device ("Edit device names"), used for every row of the device, the remembered hints and the history
- fix: Last change - the datapoint field for the timestamp is now also shown when the widget has its own datapoint; a fixed id left there (e.g. in a device card child) made every card show the same time and could not be seen or cleared (#996)
