# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.

- JSON table - a column can now format its value: show a timestamp as date/time, convert it by factor/offset, and set its decimal places (#697)
- Date picker - clearing the field now clears the datapoint, in the widget, in a Universal cell and in a list row (#695)
- Date picker - the input fields now take a font size and a text colour; in a Universal cell the cell's colour and bold/italic reach them too (#696)
