# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- Charts - a failing history query (e.g. InfluxDB refusing to average a datapoint) is now shown on the chart and logged to the browser console instead of drawing an empty or flat curve
- Datapoints with a colon (or other characters ioBroker allows, like & = /) in their ID now update live instead of only after a page reload (#874)
- Speech output - devices whose browser has no voice of its own (e.g. Fully Kiosk on Android) now speak text announcements through an online voice served by Aura; can be switched off in the instance settings, then speech.lastResult reports unsupported (#834)
- Status symbols - an own status entry can now show its datapoint as a value (number with unit or text with bindings) instead of an icon, in any corner of the widget; optional highlight rule with comparisons like >30 (#875)
- Shutter - the position inversion option ("Actuator convention") is no longer labelled as HmIP-only; the hint now also names KNX actuators where 0 % means open (#876)
