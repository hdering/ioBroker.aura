# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- Tablet mode - between the mobile and a new tablet breakpoint (measured on the window width), widgets flow into a configurable number of columns (default 2) that fill the width instead of scrolling or being cut off; the order follows a new tablet order panel in the editor and falls back to the mobile order, and the section menu gets its own tablet placement (automatic = the docked sidebar becomes a hamburger) (#413)
- Settings - Frontend design page rebuilt around the three scope chains: the tab rows are now "Global", "Global → Layout" and "Global → Layout → Section", every group stays visible at every scope (locked rows explain why and jump up), a scope bar says what is being edited, own values are orange in the tree, on the tabs and on the control itself, each setting shows where it is inherited from or overridden below, and a "Levels" dialog lists one setting across all layouts and sections; browser sync, my themes, behavior and the wizard limit became groups of their own
- Getting started - a new documentation guide walks through the first setup in order (target device, global basics, guidelines, grid and breakpoints, layouts and sections, first widgets, mobile check, device assignment, backup), the admin overview opens with a dismissible card linking to it and to each step's admin page, and an empty dashboard tab now links to the admin area and to the guide
