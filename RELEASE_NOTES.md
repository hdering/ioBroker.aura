# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- Datapoint picker - the tree lists sub-folders before the datapoints of a folder (#686)
- Datapoint picker - the "With History" filter now covers every logging adapter (history, influxdb, sql, ...) and no longer marks datapoints that only carry an iot/Alexa custom entry (#686)
- Group - a child widget is now at least as tall inside a group as the same widget on the tab, so its content is no longer cut off; existing groups grow by about one row per five child rows (#680)
- Group - the editor lets a group be dragged taller than its children again; the extra room is shared evenly among them and the frontend shows the same height (#680)
- Layouts - new "Preload icons for offline devices" switch (global or per layout): the device loads every icon of the layout right after start, keeps it locally and no longer asks the public Iconify hosts; Frontend design → Icons shows which icons the adapter already holds and preloads the missing ones (#290)
- Adapter - `info.iconCache` lists the icons the adapter serves from its own cache, and every newly cached icon is logged (#290)
- Group - a child can be pulled back onto the tab with a click on its grip; dropping it anywhere in the free tab area works too, and dropping it back onto its own group no longer loses it
