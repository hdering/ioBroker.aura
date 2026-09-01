# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- AI assistant (MCP, beta) - new tool aura_recipes hands the model finished, valid widgets for the usual jobs: a room as one list instead of a row of value tiles, a counter as consumption bars, a tile with colour thresholds and conditions, a status overview, a whole room tab. The instructions now send it to a recipe and to an existing tab of the dashboard before it reads the schema, so a generated view uses the widgets and options that make it readable instead of the bare minimum the schema accepts
- AI assistant (MCP, beta) - new tool aura_review looks over a tab that already exists and names what would make it better: rows of single-value tiles that belong in one list, numbers with no good or bad range, a meter shown as its raw reading, a bar chart without an aggregation, a thermostat with no actual temperature, a list with no second line. Each finding names the widgets and the recipe that fixes it, and stays a suggestion - nothing is changed without being asked
- Editor - the "AI prompt" dialog now pastes worked examples into the prompt (the same ones the MCP server hands out) and says what a good dashboard looks like, instead of only what is valid JSON. The old wording asked the model to leave options out, which is why generated views came back as bare tiles
