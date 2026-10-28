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
