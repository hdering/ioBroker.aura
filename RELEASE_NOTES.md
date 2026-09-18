# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- Image - adapter assets such as Pirate Weather icons are now read straight from the ioBroker file storage, so they no longer depend on the configured socket port serving them (#519)
- Groups - the editor sizes a group exactly like the frontend again: children stored with a gap between them (or next to a shorter widget) no longer leave an empty strip under the last child, and the children keep the size the frontend gives them (#680)
- Countdown - new widget: remaining time as hh:mm:ss with Start/Pause/Stop, ± buttons and preset chips; runs in the adapter, switches a datapoint at start and end, scriptable through its cmd state, and can also display a foreign remaining-time datapoint such as mytime (#675)
- Settings - the web instance can now be picked from a list instead of typing its port; its port, bind address and HTTPS setting are then used automatically
- Settings - new "Check backend" button that tests the web instance, the socket connection and the file delivery and reports what is wrong in plain words; the same check runs at every start and writes its result to the log and to info.backendCheck
- Select - with a fixed dropdown width, a value that is missing from the widget's own entry list is no longer printed in the closed control; it now shows a dash just like the automatic width, so several selectors can share one datapoint (#679)
