# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- MCP server - aura_validate no longer reports a write on read-only rows: a state or contact display writes nothing, and a row with writable false is taken at its word
- Extended chart - the whole chart follows the theme now: series colours, axis labels, axis and grid lines, the legend and the gauge track. A var(--token) is resolved before it reaches the canvas, so the same colour rule holds for charts as for every other widget (a token the theme does not define is reported by aura_validate). Light themes gain the most — the grid lines were a near-black fixed grey
- MCP server - aura_measure charges the second line under a list entry to the rows that have one, instead of to every row (a list of twelve with four second lines was reported 123 px too big)
- Documentation - step-by-step guide for connecting the AI assistant (MCP): enabling the endpoint, generating the token, pasting the client block, and setting up the ioBroker MCP server it needs
- MCP server - aura_measure counts a separator row as the shorter row it is (17 px instead of a full content row) and no longer claims separators are left out of the number
- MCP server - aura_validate accepts every payload shape the write tools take, a bare widget array included (it used to answer "kein Objekt" and demand an aura-tab envelope)
