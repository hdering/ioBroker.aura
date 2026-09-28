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
- Header items - a centred title now stays in the middle of the card when values or buttons sit on the right, and items on "Row 1 centre" sit beside the title instead of covering it - left, right or below, chosen per item; the header editor shows the row that way. Lists keep their header line and divider when only header items are shown, with title and icon off. New "Row 1 left" place. Title and icon are now tiles in the header editor: tap or drag them to move the title (left, centre, right) and the icon (far left, before or after the title, far right), and the title can move to the second row; Appearance only switches them on and off (#676)
- Widget editor - Appearance groups icon, title, icon picker/size and the header in one compact block, and gets a reset button like Advanced (#676)
- Fill level - the "Bar" layout can show the value inside the bar, which then uses the width the label gave up; orientation and bar size are now settable for this layout too (#719)
- Fill level / Universal widget - the bar's fill colour, unfilled area and the value's text colour over each part can be set separately, the same settings in the fill level bar and the progress cell; the progress cell can also show its value beside the bar (#720)
