# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- Advanced chart - the current-time line on a category axis now shows which label it hits, warns when none matches and offers the labels from the data to pick from
- MCP - the per-widget "last change" display options are now part of the widget schema; three false validator warnings are gone (frame options called ineffective, universal widget with a custom grid but no defId, JSON chart on a string datapoint)
- Timer - switches more reliably: an edited entry fires again on the same day when its time is moved later, an entry saved while the connection was briefly lost is sent again on reconnect, one broken entry no longer stops all other timers, and an event due in the split second between two checks is no longer skipped (#778)
- Timer - inside a popup view or a device card, a timer whose target uses a placeholder like {{dp}} now keeps its own schedule and entries per device; before, all devices shared one schedule that only switched the device opened last (#778)
- Countdown - inside a popup view or a device card, a countdown whose target uses a placeholder like {{dp}} now runs separately per device; before, starting it for one device ran it for the device shown last (#778)
- Media player - shuffle and repeat now show their current state (accent color with a dot) and switch the mode back off on a second click (repeat steps through off / all / one); the cover no longer sticks to the previous track or freezes with Sonos (#782)
