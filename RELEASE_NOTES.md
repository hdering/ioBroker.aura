# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- Section menu - a popup opened by a widget inside the open section menu now appears on top of the menu instead of behind it
- Custom grid - clicking a cell in the edit dialog now highlights it in the preview even when an image or another spanning cell covers it
- Thermostat and selection widgets - new circle menu layout: a round button fans out the preset temperatures with -/+ or all selection entries around it, like the shutter's circle menu (#815)
- Universal widget: status icon and static icon cells now have an icon size slider in their content settings
- Connection lost banner - now has an opaque background in glass themes so the message stays readable over the dashboard (#826)
- List widgets - the -/+ stepper can show and read durations (mm:ss, hh:mm, hh:mm:ss) and write the value as number, text or time string, e.g. for Sprinkle Control running times (#827)
- Input, selection, dial, slider, dimmer and thermostat widgets - new optional status datapoint: the widget shows the confirmed value from there while still writing to the main datapoint, like the switch (#828)
- Custom grid - cells placed on a spanning cell (e.g. lamps and values on a floor-plan image covering the whole grid) are now drawn on top of it, also as single cells
