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
- fix: PIN-protected tabs and sections can show their conditions and markers while locked - new option "Show markers and conditions while locked" in the PIN settings (#944)
- fix: Mirror - a mirrored widget now shows its source's conditions, markers and click action; settings of the mirror itself still take precedence (#945)
- fix: Web component - the flow diagram now updates as soon as it is changed and saved in the Flow tab of admin, without reloading the page (#946)
- feat: Charts - pick a free date range from-to in the paging bar (e.g. a holiday); arrows page by its own length, linked charts follow, and an optional end datapoint makes it scriptable (#931)
- feat: Charts - optionally return to the configured range and current date after N minutes without use, for wall tablets; linked charts follow (#932)
- fix: Charts - windows up to 3 hours no longer break off for datapoints that log every few seconds; when the raw values exceed 1000 rows, the chart now fetches them in fine steps
- feat: Charts - computed series from several datapoints with a formula (e.g. voltage x current, sum of three meters); inputs logged on change keep their last value, works with delta bars and the previous-year comparison, plus a new period value "area over time" (W to Wh) for any series (#930)
- fix: Menu - the header settings now work: title and icon can be shown above the menu entries (off by default, so existing menus stay unchanged) (#949)
- feat: JSON table - the last row can be shown as a highlighted footer (e.g. a sum row) with its own colours, bold/italic and pinned to the bottom; it stays in place when sorting, searching or limiting rows. Header and footer settings now live together under Look (#938)
- feat: Collapsible widgets - when expanded, the title row looks like the folded header (chevron in front, icon and title in the same place, same weight) and a click on it folds the widget again; switches and buttons in the row keep their own click (#941)
