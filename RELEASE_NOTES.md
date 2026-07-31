# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights

Static list - statistics are shown on the same line as the title instead of a second header row
Group - the editor now shows the same spacing as the frontend and never shows an inner scrollbar, at any grid row height or gap: children fill the group box in both views, grid settings, header height and fitted height are resolved identically, and a child too small for its own content is clipped the same way in both views
Group - an empty group no longer collapses to a single grid row in the editor: it keeps its configured height and can be resized until the first child is added
Group - new groups start wider and taller instead of as a narrow strip; default sizes dialog no longer caps width/height at 12
Settings - every Design card (theme, CSS variables, typography and spacing, grid and mobile, guidelines and resolution, header, section menu, navigation, tab bar) has a "Reset" button that restores the default values, or removes the layout/section overrides in scoped views
