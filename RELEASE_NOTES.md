# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights

- Layouts - new "Sections" level: each layout can now hold several sections (the left-hand menu), each with its own tabs; export/import works per section, and a per-layout default section is used on open and for idle-return
- Design - settings now cascade global → layout → section: theme, typography, grid, guidelines and tab bar can be overridden per section, and header, layout menu and idle-return per layout
- Design - optional toggles to show the section menu and the tab bar even with a single entry (previously only shown from two)
- Tab bar - can now be positioned at the bottom (footer) instead of the top
- Layout menu - datapoint elements: pick the datapoint via the standard picker, and the template field supports HTML
