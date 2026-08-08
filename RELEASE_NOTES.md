# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.

- Camera - embedded streams (go2rtc and friends) reload when the device wakes from display standby instead of stopping on a play button; new "Reload after standby" option, on by default (#526)
- iFrame - new "Reload after standby" option reloads embedded videos and streams after display standby, overriding "Keep alive" (#526)
