# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- Lost connection to ioBroker is now visible: after 5 s offline a banner shows since when, widgets are greyed out, and the status overview says "Status unknown" instead of "All clear"
- Shutter - "Re-set after drive" detects the end of a drive by the actual position reaching the target, so slow-reporting KNX actuators no longer get the slat angle mid-drive (#745)
