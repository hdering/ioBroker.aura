# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- Countdown - font size of the preset chips and the status text can now be set individually (#812)
- Switch - new control style "Button" with per-state caption and colours; the universal widget's switch cell gains the control style "Image"; both image modes take a URL, Base64, a file from the server or an upload from the PC
- iFrame - the fullscreen button now sits under Appearance like on every other widget, with corner choice, the "Fill screen" option and permanent visibility on touch devices; the embedded page stays operable in fullscreen (#813)
- Theme editor - every field now shows the name of its CSS variable (e.g. `--app-surface`); a click copies it as `var(...)` (#814)
- Section menu - the slide-in drawer is no longer see-through on the glass themes, and "Navigation → background" now colours the drawer and the docked sidebar like the section and tab bars (#814)
- Value conversion - new option "Adjust unit automatically": the value moves to the next unit prefix from 1000 up and below 1 down (850 Wh, 1.25 kWh, 3.4 MWh; also W, VA, V, A, Hz, g, m, l, bytes), with separate decimal places for the larger unit; works in the value widget, both lists including the second line and the universal widget's datapoint cell
