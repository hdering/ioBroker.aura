# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- Shutter - the actuator convention (0 % = open) can now be set in the up/down and push-button control modes too (#876)
- Datapoints shown in the header, tab bar and section menu now load together with the active tab instead of last
- Thermostat - header items in the dial layout get a row of their own above the scale instead of overlapping it on narrow cards
- Thermostat and other widgets - switching to the custom layout keeps the status symbols when only own status items are configured
- AI assistant (MCP) - height checks now count the header subtitle and report content that reaches into the card padding or is cut off without scrolling; the custom layout template carries the status badges cell; every browser measurement names the frontend build it came from, and one from an outdated browser no longer claims that nothing is cut off
- Gauge, HTTP action and Countdown - new widgets start one or two rows taller, so their content no longer reaches into the card edge or gets cut off
- iFrame - with the proxy enabled, searching in single-page apps such as Paperless-ngx no longer ends in "Missing url parameter"; plain search forms keep their input too (#881)
