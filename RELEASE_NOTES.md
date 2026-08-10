# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- Lists - clicking a row opens a detail popup for that datapoint; the popup is picked automatically from the datapoint's role (#524)
- Status overview - clicking an entry opens the detail popup of that datapoint (#524)
- New click action "all datapoints of this device" - lists every sibling datapoint of the clicked one (#524)
- Dynamic list - the datapoint search now finds alias.0.* datapoints (#524)
- List widgets - datapoints are now managed in a dedicated, resizable dialog with an entry list next to a full per-entry editor; the options panel is grouped into collapsible sections
