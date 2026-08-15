# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- Messages - can now be sent with sendTo('aura.0','notify',{...}) as well; the call answers with the assigned id, and notifyAck / notifyDismiss confirm or close a message from a script
- Settings - Admin -> Messages now shows ready-to-copy setState and sendTo lines for the message you just built, plus a reference of every message datapoint
