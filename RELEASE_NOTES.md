# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- Icon picker - picking a PNG/GIF adapter icon now asks right away whether it keeps its colours or is drawn in the icon colour, and the current icon's colour setting can be switched later at the bottom of the picker (#716)
- Universal widget / custom layout - the colour fields of a "State icon" and "Switch" cell now show the colour the cell really draws when none is set, instead of a green that was never applied (#716)
- Header items - a centred title now stays in the middle of the card when values or buttons sit on the right, and items on "Row 1 centre" line up right behind the title instead of covering it; the header editor shows the row that way (#676)
