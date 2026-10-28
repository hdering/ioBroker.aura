# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- Phone/tablet column flow - a column block can split its width unevenly (e.g. 2:1, 1:2:1), so a widget can take two thirds next to one taking one third (#851)
- Announcements - new admin page "Ansagen": datapoint + condition → spoken text on chosen devices, with time window, weekdays and a lock such as at most once a day, no script needed (#834)
- Advanced chart - time axis labels no longer overlap on narrow charts; labels that would collide are left out; the approximate number of labels can be set under X axis (#869)
- Advanced chart - settings that do not apply to the selected mode are shown greyed out with the reason instead of disappearing; the horizontal lines switch now also works in comparison mode (#869)
- Universal widget - vertical and horizontal grid lines are now visible in borderless themes such as Lovelace and Material 3 (#870)
- Admin - all admin pages (overview, layouts, popups, messages, announcements, widgets, frontend design, settings …) now use the same heading size, the same distance to the top and the same gap between heading and content
- Universal widget - a select cell shown as circle menu can show a second datapoint large in the button (e.g. the measured temperature), with the selected entry small below (#864)
- Image and slideshow - new option "Fill tab" like the iFrame: the widget covers the whole tab area, e.g. as a photo frame on a wall tablet; "Fill tab" now also works in popup views, where the widget fills the fullscreen popup or the set popup size (#865)
- Universal widget - slider cell gets an optional status datapoint like the slider widget: the position and value come from it, dragging still writes the main datapoint (#866)
- Advanced chart - paging steps by the selected range (day, week, month …) and switching the range keeps the browsed date; the picked date can be the end or the start of the window; charts with the same link group page together, and optional datapoints set or report date and range or page from a script/button (prev, next, today, now) (#871)
- Simple chart and distribution chart - same paging as the advanced chart (prev/next by the selected range, jump to current, date picker), link groups that work across all three chart types, and the date/range/command datapoints; the distribution chart also gets weeks, calendar months and years for its own range, a 1-year preset and own range chips (#871)
