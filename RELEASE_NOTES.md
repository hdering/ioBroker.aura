# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- Weather - the widget no longer overflows when a custom temperature font size or forecast row spacing is set
- AI assistant (MCP) - size checks say "cannot be judged" instead of "fits" when the widget uses its own typography, and popup views can now be measured in the browser
- New widget "News (RSS)" - shows RSS/Atom feeds or the rssfeed adapter as a list, cards, a ticker or a rotating headline; articles open in a popup or a new tab; optional unread marks, spoken announcements of new articles, a read-aloud button and loading images through Aura (#854)
- Overview - the "widget references to missing DPs" check now includes widgets inside groups and device cards right after a page reload, not only after clicking "Refresh" (#859)
- Slideshow - number fields such as the transition duration accept typed values again instead of jumping to the minimum on the first digit (#860)
- Popups - new datapoints popup.close (all devices) and clients.<id>.popup.close (one device): writing true closes every open popup on the device, whether opened by a click, a trigger or popup.open, stacked popups included (#861)
- Fill level (wave) - the charging bolt and the charging sweep stay inside the tank instead of spilling below it when the widget is taller than wide (#863)
- Popups - widgets in a popup view no longer stay squeezed to a fraction of the dialog (looking like the phone layout) when the popup was opened before its view had its final width, e.g. a screensaver popup (#862)
- Room climate - with placeholder datapoints such as {{parent}} the history series (temperature, humidity) and time range can be set again with the adapter instance left empty, so a popup can show the humidity history (#857)
