# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- Advanced chart - optional label at the now line (e.g. "now {HH:mm}"), at the top or bottom of the line
- Advanced chart - short explanations under the paging and forecast settings in the editor
- Dimmer, slider, light and input bar sliders can be dragged with a finger again on phones and tablets; the dimmer shows the percentage while dragging in every layout
- Charts - paging bar: the date now sits before the arrows, so ‹ › no longer move away from under the pointer while paging; on a narrow chart the bar moves to a row of its own instead of squeezing out the range chips
- Popups - widgets in popup views and embedded widgets now look and behave exactly as on the tab: own title and icon colours, header items, status row, conditions (including a locked widget), style overrides, wrapped titles and the CSS classes for custom styles
- Popups - an embedded widget keeps its proportions instead of being stretched to a square (the media player's controls were cut off)
- Popup editor - a new widget gets its type's default size, and the toolbar wraps so the widget just added stays in view
- Advanced chart - unit per series: the tooltip, value labels and current value use it ahead of the axis unit, e.g. for a series on a third y axis added via JSON
- Advanced chart - a series without any point in the shown window (e.g. measured values on a forecast-only day) no longer draws a flat line at 0; its legend entry stays, greyed out
- Charts - link groups can share the date only (navGroupMode / echartNavGroupMode "date"): linked charts page together while each keeps its own range
- Advanced chart - custom layout: the chart itself is a cell component ("Diagram"), so buttons and texts can be placed around it; chart cells can mirror charts from popup views and say why a chart is not shown
- Energy balance - pie and donut charts show up on iPhone and iPad again (Safari, Firefox and every other iOS browser) (#877)
- Popup editor - "New widget" opens the same dialog as the dashboard editor (search, templates, datapoint detection, recently used, presets), with {{dp}} prefilled; the type dropdown is gone
- Layouts - Navigation: the idle and auto-return delays accept typed values again instead of jumping to the minimum on the first digit (#878)
