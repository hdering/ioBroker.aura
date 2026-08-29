# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.

- Advanced chart - a consumption ("delta") chart no longer runs on past its own data: the time axis used to end half a bucket after the newest reading, leaving an empty strip on the right, and now ends where the data does - so the curve reaches the right edge just as the bars reach the left one (#598)
- Thermostat - new "Rundskala" layout: a 270 dial with a draggable handle, the setpoint in its centre and the +/- buttons in the arc gap; the scale colour is configurable, either fixed or from a colour-threshold scale (#599)
