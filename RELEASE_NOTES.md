# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
Slider - optional scale showing the step values, min and max along the track; available in the Slider widget, list rows and the universal widget's slider cell (#643)
iFrame and HTML widgets - on phones the frame keeps its dashboard aspect ratio instead of the full row height, so the embedded page no longer sits in a tall empty box (#645)
Static and dynamic list - a datapoint in the second line can show when it last changed (or was last written) instead of its value; relative by default, with time and date formats available, and an empty datapoint id means the row own datapoint (#646)
