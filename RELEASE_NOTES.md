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
Dynamic list - rows can now show an icon in front of the name, set per datapoint together with its size (#572)
Lists - second line: value-to-text table (true becomes ONLINE) and its own conditions per datapoint (#572)
Lists - a custom filter can now read the row name and exclude with "does not contain", which the search field cannot do (#572)
Lists - sorting is now a dialog with a chain of criteria: row name, value or a datapoint of the second line, compared as number, text, active first or an order you type out; rows without a value stay at the end (#572)
Universal - conditions are now offered for title, unit, text, field, icon, image and button cells as well
Conditions - the widget level gained bold/italic and the element level gained pulse/blink, so both offer the same set
Conditions - the rule dialog now puts the card style and the element blocks side by side instead of stacking them full width
Conditions - hiding the title now works in a custom layout too
HTML and value widgets - bindings now work with umlauts and other non-ASCII letters in datapoint ids (#578)
Conditions - a rule now configures a widget's title, icon and value each in one place: visibility, text or icon, colour and weight; unset colour fields show an empty swatch and every field previews what the widget shows today
Conditions - a new effect pulses a ring around the frame instead of dimming the whole card, in a colour of its own, and border width, corner radius and opacity are picked from a list (#96)
Conditions - the rule dialog for list rows, second-line datapoints and custom-layout cells now has the same two-column layout as the widget rules, and its visibility switch offers unchanged/adjust/hide
Lists - the settings sections (display, values & colours, statistics, ...) now start collapsed
