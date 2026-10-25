# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- Camera - intercom: an "Answer" button opens a two-way call through go2rtc (webrtc.html), with an optional call datapoint for the doorbell (#836)
- Universal - conditions on a switch cell in button mode now apply bold, italic, font size and text colour to the button caption; button, input and dropdown cells pick up the condition font size too (#842)
