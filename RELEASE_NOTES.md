# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
Selection field - entries can now be read from a datapoint holding JSON instead of the manual list (#577)
Conditions - rules can now override a widget's title, icon, icon size and value text, plus border width, corner radius and opacity (#96)
Lists - conditions per row: colour, icon, text and visibility of name, value and icon; clause datapoints may use {{parent}} and are resolved per row (#572)
Dynamic list - rows can now show an icon in front of the name, list-wide or per entry (#572)
Lists - second line: value-to-text table (true becomes ONLINE) and its own conditions per datapoint (#572)
Lists - a custom filter can now read the row name and exclude with "does not contain", which the search field cannot do (#572)
Lists - sorting can use a datapoint of the second line (#572)
Universal - conditions are now offered for title, unit, text, field, icon, image and button cells as well
Conditions - the widget level gained bold/italic and the element level gained pulse/blink, so both offer the same set
Conditions - the rule dialog now puts style and display overrides side by side instead of stacking them full width
