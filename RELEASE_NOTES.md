# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights

- Editor - tab bar now always stays on top in the editor; the footer (bottom) position applies to the frontend only
- Editor - the section menu is only previewed in the editor when set to "fixed sidebar"; top/bottom bar placement no longer moves the editor preview
- Tab bar - global clock/datapoint/text items are now inherited by every layout and section (also on single-tab sections); per-scope items are added on top instead of hiding the global ones
- Tab bar - the datapoint template field now grows with multiple lines and hints that HTML is supported
- Tab bar - the datapoint item ID can now be chosen via the standard datapoint picker
