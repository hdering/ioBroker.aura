# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
Popup (widget content) - embedded widget now fills the configured popup width/height instead of collapsing to a narrow box; without an explicit size it uses the widget's own designed size, so groups no longer squeeze their children
Universal widget - string datapoints are no longer coerced to numbers when no value factor/offset is set, so values like "0x004" display as-is instead of being parsed as hex
