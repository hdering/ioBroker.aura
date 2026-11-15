# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
# Kind (recommended): start the bullet with 'feat:' or 'fix:' - the release turns it
# into the New feature / Bug fix marker; unmarked entries are asked for (or stay unmarked).
- fix: Clients - a client delete via clients.deleteRequest written with ack=true is now ignored and logged instead of executed; write it without ack
- fix: Network requests to the WebSocket proxy and through the web extension now time out instead of hanging
- fix: Device card - without frame, its widgets no longer end short on the right in the phone/tablet stack in browsers with classic scrollbars such as Fully Kiosk (#989)
- feat: Section menu - new option to pin the hamburger in the tab bar, so it stays reachable when a tab further along is open (mainly on phones)
