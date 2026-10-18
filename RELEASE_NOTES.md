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
- Settings - every widget dialog follows the same frame: "Visible fields" (show/hide toggles), "Datapoints", "Settings" (widget topics as sub-headings), "Look" and "Behavior", then the status datapoints; all sections start folded and look the same
- Lists - the "+ datapoint of the device" picker for the second line now shows the object ID next to the name (#795)
- Static list - an entry can show one field of a JSON datapoint (JSON path button next to the datapoint), and the value conversion of both lists gains an "Expression" mode, e.g. `dp.objektName * 0.4 | fixed(2)` (#794)
- Load times - the settings no longer show a datapoint field the widget does not use
- Settings - the layout row now shows for every widget, also where "Standard" is the only layout; the camera lists "Standard" first and calls its grid layout "Custom"; the section title picks its style under "Look"
- AI assistant (MCP) - device card and popup children with {{dp}} / {{parent}} placeholders are no longer rejected as missing datapoints when the shared layout is changed (#789)
