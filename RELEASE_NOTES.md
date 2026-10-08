# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- Status overview - new layout "Recently changed" (history): lists every closed hint the adapter recorded in aura.0.status.<category>.history (survives restarts) with relative date, "by button" or "detected automatically", how long the battery was weak and how long the previous one lasted; "Reopen" takes back a change confirmed by mistake (reopen:<id>@<time> on .cmd); import:<JSON> on .cmd and a one-time takeover of 0_userdata.0.Batterien.Verlauf bring in an older record; retention is set in the instance settings (default 50 changes / 2 years)
