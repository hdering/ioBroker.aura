# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- Messages - scripts can raise info, warning and error notices in the dashboard by writing to aura.0.messages.send; they show as toasts in one of nine screen positions, with an optional countdown, forced confirmation, action buttons and a shared history (#429)
- Messages widget - lists the message history with severity, time-range and unread filters; a click opens the full message
- Settings - new Admin -> Messages page builds the message JSON from a form, sends a test message and manages the history
- Settings - optional message bell in the header showing the number of unconfirmed messages
- Conditions - new effect "send a message", so a widget rule can raise a notice without a script
