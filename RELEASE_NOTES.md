# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
- Frontend Design - new "Values & Formatting" tab (global scope) holding the global decimals and DP name cleanup settings, which moved here from Settings
- Values - new thousands separator for numeric values (off, 1.234,5, 1,234.5, 1 234,5, 1'234.5) with a matching decimal separator; set globally and overridable per widget, cell and list entry
- Widget options - unit, decimals and thousands separator now sit together in one row; leaving decimals empty or picking "Global" inherits the global default
