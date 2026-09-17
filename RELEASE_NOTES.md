# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
Advanced chart - can start on the current calendar day (00:00-24:00) instead of the rolling range
Editor - undo/redo for every edit: step-wise via Ctrl+Z / Ctrl+Y or the arrows in the save bar, also after saving; "Discard" reverts all unsaved changes and is itself undoable; the history menu in the save bar lists every step of the session by name plus the saved states from the auto-backups, restoring one writes a safety backup first and is a single undo step; the history survives a reload of the admin as long as nothing else changed the configuration in between. Unsaved changes are no longer saved automatically when the admin is reloaded but stay unsaved and are flagged as carried over from the last session; toggling a timer or an auto-list picking up new datapoints no longer saves the whole dashboard on its own either. Dropping a widget no longer re-renders every other widget on the tab, so releasing it no longer stutters on busy tabs, and the preview renders with the font scale of the layout being edited, so the admin shows what the frontend shows (#668)
Messages - the presentation defaults take part in undo/redo; undoing them back to the saved values disarms the save bar again
Settings - the first change to a setting that was never saved before (fresh installation, unused datapoint groups) now arms the save bar and can be discarded like any other
Adapter - a config datapoint (aura.0.config.*) written by a script or another tool without ack is backed up first; the previous value appears in the backup list as an external write
Popups - a fresh installation no longer receives every built-in popup view and type assignment on the second load, a discard or a restore; only the datapoint view is seeded until a popup is actually configured
Frontend - opened in the same browser as an admin, the frontend no longer mirrors the admin's unsaved edits live (every widget drag used to show up there at once); it shows the saved configuration, leaves the admin's copy and flags alone, and takes a save over the moment it arrives
Value widget - in the "minimal" layout value and title shrink to stay inside the card instead of the title being cut off at the bottom edge (#668)
Value widget - a double click in the HTML template field selects the clicked word again instead of the whole template (#670)
