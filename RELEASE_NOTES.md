# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
Group - now wraps its children with one equal spacing on all four sides and between widgets (no empty row below), with or without a title/icon; when title and icon are disabled the editor header strip is gone and the group's move/menu controls appear as a small toolbar on hover
Group - an icon-only group (title off, icon on) now shows its icon header in the live view too, matching the editor
