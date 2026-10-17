# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- Map - all sections of the map settings now start folded when the settings open
- Universal Widget / Custom layout - optional vertical and/or horizontal separator lines between the grid cells, with adjustable colour and thickness (#793)
- Device widgets - any number of own status symbols next to battery / reach / window (e.g. motion sensor locked), optionally toggled by a click, with a freely adjustable order; also placeable as single custom layout cells; the status row can sit in any corner or on the card edge so it no longer covers switches and sliders, and the fill level, air control, alarm, button, camera, gauge, evcc, calendar, trash, trash schedule, map, HTML and universal widgets show it too (#792)
- AI assistant (MCP) - height check now computes the status overview card grid (columns, wrapped names, the +N more line) and warns when maxRows needs more rows than fit; the browser check reports the remaining space in px, treats a 1 px overflow as scrolling and can fill runtime lists to their worst case
- Settings - every widget's show/hide toggles are now listed under one "Visible fields" heading at the top of its own settings; RGB light, dimmer, knob and state image split their settings into sections that start folded
