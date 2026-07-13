# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights

- Value & JSON-table widgets - `aura-file:` paths now resolve inside HTML `<img src>`, so images/icons from the ioBroker file system can be embedded the same way everywhere
- JSON-table widget - new per-column width (px), text alignment and line-wrap options, plus an optional max-rows limit and click-to-sort column headers
