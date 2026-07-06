# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
Load times - color-coded good/ok/slow thresholds with reference lines and latest-value badges so numbers are interpretable at a glance
Load times - samples are now tagged per client; widget defaults to the current device and can filter/compare individual clients
Load times - time range (1h/6h/24h/7d/all) is now switchable live from the widget header, not only in edit mode
Load times - new "Details" view attributes slowness per widget (render and ready time) and per backend command, so you can see which one is responsible
Settings - add performance-diagnostics switches: record load-time metrics (default on) and optional per-widget timing (default off, higher overhead)
