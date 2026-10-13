# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- Settings - the guidelines page explains why the frontend hides the lines while "Fill window width" is on
- Status overview - classic HomeMatic battery devices (window contacts, handles, smoke detectors …) now show "battery low"; mains actuators stay out, one row per device
- Status overview - remembered batteries imported by their full datapoint id are now picked up by the widget (snooze, recheck, quiet entries)
- Timer - switch any number of datapoints with one schedule (e.g. several thermostats), all get the same value (#774)
