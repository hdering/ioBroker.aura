# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- Widget header items: each item now has its own icon size, icon colour, text size and text colour (#725)
- Widget header: title and icon settings (show, icon, icon size) moved from Appearance into the header dialog, so everything about the header is set in one place (#725)
- Widget header: the widget icon can now be placed on any header slot, including the middle of row 1 and all three places of row 2 (#725)
- Widget header: the widget's own title and icon get their own colour and size, and all header settings line up in columns (#725)
- Custom CSS - plain rules on `.aura-widget-title` and `.aura-widget-icon` now reach every widget type, and the six header slots have their own classes (#726)
- Widget fullscreen - a chart opened in fullscreen no longer stays empty on a phone in landscape (#728)
