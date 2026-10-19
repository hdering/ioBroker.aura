# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- Countdown - can start automatically when a watched datapoint switches on, e.g. turn a plug off 30 min after it was switched on elsewhere (#796)
- Lists and the status overview can publish their content to ioBroker (count, JSON list and ready-to-send text of the shown rows), computed by the adapter even without an open browser - e.g. for an evening report by mail or Telegram (#798)
- Admin - the instance (e.g. aura.1) is shown next to the version in the sidebar, so several Aura instances can be told apart at a glance (#801)
