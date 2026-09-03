# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- Extended chart - the whole chart follows the theme now: series colours, axis labels, axis and grid lines, the legend and the gauge track. A var(--token) is resolved before it reaches the canvas, so the same colour rule holds for charts as for every other widget (a token the theme does not define is reported by aura_validate). Light themes gain the most — the grid lines were a near-black fixed grey
- Documentation - step-by-step guide for connecting the AI assistant (MCP): enabling the endpoint, generating the token, pasting the client block, and setting up the ioBroker MCP server it needs
- MCP server - aura_validate and aura_measure answer more accurately: aura_validate takes every payload shape the write tools take, a bare widget array included, and no longer reports a write on a read-only row (a state or contact display writes nothing, and a row with writable false is taken at its word); aura_measure charges the second line under a list entry only to the rows that have one (a list of twelve with four second lines was reported 123 px too big) and counts a separator as the shorter row it is
