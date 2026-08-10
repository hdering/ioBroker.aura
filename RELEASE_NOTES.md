# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- Lists and status overview - clicking a row now opens a detail popup for that datapoint: picked automatically from the datapoint's role, or configured per row (widget popup, jump to another tab, all datapoints of the device). Datapoints moved into a dedicated resizable dialog with the entry list next to a sectioned per-entry editor, the options panel is grouped into collapsible sections, and the datapoint search of the dynamic list now finds alias.0.* datapoints (#524)
