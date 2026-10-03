# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- Editor - saving no longer closes the "Edit widget" dialog on a tab in a PIN-protected section (#740)
- Groups - "Fit height to content" now works for widgets inside a group; the group grows and shrinks with the list (#741)
- Advanced chart - comparison mode can show a legend; clicking an entry hides that bar (#742)
- Universal widget - a dropdown cell whose entries do not include the current value now shows a dash instead of the raw value (#744)

- Shutter - quick-select buttons for fixed positions, optionally with a slat angle (#745)
- Datapoint picker - the setpoint, humidity and pressure fields of the climate widget (and the battery fill and panel fields) now open the picker on their own datapoint instead of the temperature (#746)
- Colors - every widget color can be taken from a datapoint: enter {id} or [[id]] in the color picker, also as the light or dark half of a pair (e.g. WLED colors for icons) (#747)
- New widget "Device card" - build a card once with {{dp}}/{{parent}} placeholders and reuse it for any number of identical devices; copies share the layout, so a change applies to all cards, and linked cards get the same colored frame in the editor (#743)
