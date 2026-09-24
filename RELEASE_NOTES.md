# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- Custom CSS applied in the dashboard editor now styles only the dashboard preview, not the admin menu around it (#710)
- Admin overview - the AI access (MCP) card can be dismissed, like the getting-started card
- JSON table: sort rules like the static list - several columns in a row, compare as number, text, on/off or date (also dd.MM.yyyy), empty cells first or last; a header click still takes over (#706)
- JSON table: per-column thousands separator next to the decimal places; the "Umrechnung" switch is now called "Zahlenformat" and shows conversion, decimals and separator in one row (#707)
- Media player: the volume quick-select buttons (25/50/75/100 %) can be hidden to save a row of height (#708)
- Chart / Advanced chart: define your own time-range chips for the frontend selector, e.g. only months (1, 2, 3, 6, 12, 24 months, total); custom ranges now also support weeks, months and years (#709)
- Grid & Mobile - the mobile view can now use 2-4 columns like the tablet view (setting "Mobile columns"); the mobile order panel in the editor then arranges columns and full-width bands; in Frontend design the mobile and tablet settings are grouped side by side, and both order panels link straight to them (#413)
