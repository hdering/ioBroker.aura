# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- Settings - "Fill window width" grid can now also stretch vertically: rows either scale with the width (widgets keep their aspect ratio) or fill the window height; off by default (#413)
- Widget fullscreen - browser fullscreen no longer drops back right after opening when entering it resizes the window across a layout breakpoint (Firefox on phones in landscape) (#711)
- Chart - the tooltip now shows the year when the chart spans more than a month, crosses a year boundary or lies in an earlier year; daily values drop the meaningless 00:00 (#712)
- JSON table - columns can now have their own background and text colour ("Colours" switch in the column settings) (#715)
- Chart - value labels on the highest bar or point no longer run into the legend or get cut off at the top edge (#713)
- Chart (advanced) - boolean datapoints plot as 0/1 on a clean 0…1 axis and draw as a step line by default; new "Step line" switch per series and axis texts instead of numbers (e.g. 0=On; 1=Off) (#718)
