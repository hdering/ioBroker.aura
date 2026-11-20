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
- feat: Status overview - choose which battery datapoints count: boolean (LOWBAT), percent, volt and millivolt, with an own warning threshold in volts; a device shows one row (percent before voltage before LOWBAT), so battery voltages like OPERATING_VOLTAGE or a Zigbee "voltage" can be listed all the time (#1000)
- fix: Status overview - the adapter field under "Restriction" is now labelled as an include filter ("only these adapters, empty = all"), and the exclusion pattern shows how to hide a whole adapter (#998)
- feat: Web components - when a component cannot be loaded, the widget now says why: its file is not served (upload the adapter again) or the shared React (/lib/esm/react-19.js) is missing, which behind the web extension needs web 9.2.0; the backend check ("Check backend") reports the same for the web extension's instance; behind the web extension (<web>/aura/) with web before 9.2.0, Aura now serves /lib/esm/react-19.js itself, so web components such as flow, TR-064 or Laundrylens load there too (after a restart of the web instance)
- fix: Universal widget (custom grid) - a cell without its own horizontal alignment is centred; the editor now marks "Centre" for it instead of "Left", so choosing "Left" takes effect right away (#1001)
- feat: Web components - bind the value a component edits (e.g. a schedule or a list) to a datapoint (new widget option value datapoint); JSON text arrives as an object and changes are written back (#958)
- fix: Status overview - mains-powered HomeMatic IP devices (plugs, switches, dimmers) whose OPERATING_VOLTAGE reads 0 V are no longer reported as weak batteries; entries already remembered for them disappear (#1000)
- feat: Status overview - new "Detected datapoints" list in the widget editor: every found datapoint has a checkbox to hide it (stored in the existing exclusion list), and an alias and the datapoint it reads from are marked as duplicates, with one click to hide all originals or all aliases (#1002)
- fix: Status overview - aliases filed as alias.0.<room>.<device>.<state> now count as one device each instead of the whole room folder, so a percent battery alias no longer hides the voltage and LOWBAT aliases of the other devices in that room; device names and the battery level lookup follow (#1002)
