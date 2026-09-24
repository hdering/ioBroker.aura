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
