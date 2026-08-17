# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.

- Messages - editing the presentation defaults under Admin -> Messages now activates the Save button instead of writing every keystroke straight to the instance; Undo restores the stored values
- Messages - the send time can now be shown on the message card: pick the default under Admin -> Messages (clock, or date plus clock), and override it per message with `showTime` / `timeFormat`
