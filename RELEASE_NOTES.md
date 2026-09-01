# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- AI assistant (MCP, beta) - two new tools aimed at the same thing: dashboards that use what AURA can do. aura_recipes hands the model finished, valid widgets for the jobs that come up - a room as one list instead of a row of value tiles, a counter as consumption bars, a tile with colour thresholds and conditions, a status overview, a thermostat dial, a whole room tab. aura_review goes the other way and looks over a tab that already exists, naming what would make it better: tile rows that belong in one list, numbers with no good or bad range, a meter shown as its raw reading, a bar chart without an aggregation, a list with no second line - each finding names the widgets and the recipe that fixes it, and stays a suggestion. On top of that the instructions now send the model to a recipe and to an existing tab of the dashboard before it reads the schema, so a generated view no longer comes back as the bare minimum the schema accepts
- Editor - the "AI prompt" dialog now pastes worked examples into the prompt (the same ones the MCP server hands out) and says what a good dashboard looks like, instead of only what is valid JSON. The old wording asked the model to leave options out, which is why generated views came back as bare tiles
