# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- Background image - also accepts CSS colours and gradients (e.g. linear-gradient(#e66465, #9198e5)), typed in or composed with the new gradient builder (#830)
- Group - header items now sit in the group's own header bar (divider and spacing kept even with title and icon off, no more jumping row), and the title and icon colour can be set for the group header (#832)
- Alarm - with "Disarm only with PIN" the Off button now opens the PIN entry while the system is merely armed (it did nothing before); the PIN field has a cancel button and brings up the numeric keypad on phones and tablets
- Map - zoom in beyond level 19 (up to 22); past the tile server's last level the tiles are scaled up, handy for small plots like a mower's track (#837)
- Scenes - new widget for the ioBroker scenes adapter: trigger scenes with a tap, create them right in the dashboard, pick the devices and learn their current values; allowed devices and an optional PIN are set in the instance settings (#825)
