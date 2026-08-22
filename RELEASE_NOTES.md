# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- Chart (advanced) - consumption/yield bars are now labelled by their own period on the time axis; a yearly bar no longer shows stray day numbers left and right of the year, and the tooltip names the period instead of the second it starts at (#570)
- Custom layout - a switch cell can take its state from a separate status datapoint, so devices that split command and status (e.g. MQTT/Tasmota plugs with cmnd/stat) show the real state and label while switching still writes to the command datapoint; switch, status text and status icon cells now also recognise the string "on" and can compare the state against any value (#567)
