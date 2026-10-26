# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- Scenes - the widget settings can limit which datapoints "Add device" offers in the dashboard: whole instances or wildcard patterns like *.STATE (#825)
- Popups - a popup that closes itself after n seconds now resets the idle datapoint clients.<id>.idle.active to false, so the screensaver popup comes back after the next idle period (#856)
- Slideshow - new widget that shows photos and videos from a folder on the server, sorted by capture date (EXIF) or at random, with fade-to-black, crossfade, slide and page-turn transitions and optional video sound; works as a tile or as a screensaver (#848)
- Room climate - in a popup opened from a list row with {{parent}} datapoints the history chart now shows data: an empty history instance falls back to the triggering widget's instance or is detected from the datapoint (#857)
- Popups - a datapoint trigger can now combine several conditions with AND / OR and brackets, e.g. doorbell AND someone at home; the popup opens when the combination becomes true (#849)

- Editor - the settings popovers of sections and tabs are wider while markers or conditions are open and can be dragged wider at their edge (double-click resets); a marker condition row wraps instead of squeezing the datapoint field (#850)
- JSON table - new per-column switch "Mapping" (Zuordnung): show chosen values as an icon and/or text in their own colour, e.g. a call list type 1/2/3 as incoming/missed/outgoing phone icons; the entries can be imported from common.states of a datapoint (#852)
- JSON table - a row click can open a popup for that entry: the row's fields, hidden columns included, are available as {{row_<field>}} (raw) and {{rowtext_<field>}} (as printed) in the popup title, an HTML popup or a popup view; HTML popups now resolve {{...}} placeholders in their static markup (#858)
- Image / Camera - new option "Reload on change of" (reloadDp): every write to that datapoint reloads the picture or stream, e.g. after a script saved a new snapshot under the same name; the image widget also reloads when its source datapoint is written again with the same path, and its refresh interval now works for a datapoint source too (#853)
