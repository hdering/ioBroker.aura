# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
Advanced chart - can start on the current calendar day (00:00-24:00) instead of the rolling range
Editor - step-wise undo/redo (Ctrl+Z / Ctrl+Y or the arrows in the save bar), also after saving; "Discard" reverts all unsaved changes and is itself undoable
Editor - history menu in the save bar lists every step of the session by name and the saved states from the auto-backups; restoring one writes a safety backup first and is a single undo step
Editor - dropping a widget no longer re-renders every other widget on the tab, so releasing it no longer stutters on busy tabs
Messages - the presentation defaults take part in undo/redo; undoing them back to the saved values disarms the save bar again
Settings - the first change to a setting that was never saved before (fresh installation, unused datapoint groups) now arms the save bar and can be discarded like any other
Editor - the undo history survives a reload of the admin; steps come back as long as nothing else changed the configuration in between
Editor - unsaved changes are no longer saved automatically when the admin is reloaded; they stay unsaved, the save bar flags them as carried over from the last session, and saving, discarding or undoing them is the user's call
Adapter - a config datapoint (aura.0.config.*) written by a script or another tool without ack is backed up first; the previous value appears in the backup list as an external write
