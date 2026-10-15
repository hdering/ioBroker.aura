# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- Web adapter extension - with socket.io, the web adapter's WebSocket listeners are no longer re-wired; Aura only adds its own for /aura/ (#784)
- Timer - holiday and vacation days can be picked with a date picker in the frontend (special-days button next to the add-event button, labelled with the current or next special day) and are written to the holiday / vacation datapoint; flag datapoints are only shown (#785)
