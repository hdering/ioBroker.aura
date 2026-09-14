# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- Keyboard shortcuts on Mac, iPad and iPhone now accept Cmd (and Option for copy-drag) and hint the matching key symbols (#651)
- Add widget - a search box filters the list as you type, and non-matching entries are hidden (#652)
- Add widget - picking a type no longer adds it right away, so its hint stays readable and another type can be chosen (#652)
- Custom CSS - the tab bar carries .aura-tabs-top / .aura-tabs-bottom, so a rule can pad the footer bar only
- AC control - Daikin air conditioners (daikin-cloud) can be picked as a manufacturer, filling every datapoint from one device (#650)
- AC control - setpoint, fan speed and vanes follow the operation mode where a device keeps one datapoint per mode, and take their limits from it (#650)
- AC control - vane positions are selectable, with a Powerful button and room humidity alongside them (#650)
- Widgets can show a fullscreen button, so a chart or list fills the screen on a phone (#644)
