# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- Popups - the background colour can now be set globally, per popup view and per click action; new theme tokens `--popup-bg` / `--popup-border` colour every popup of a layout (#611)
- AI (MCP) - aura_measure now computes heights for the dashboard's own font scale and widget padding instead of the default ones, and counts a section separator with a heading as the taller row it is; list heights used to come out too small from about four rows on
- Overview - new card explaining that Aura can now be controlled by an AI assistant over MCP, with the setup steps and a link to the documentation; it now sits above the health cards instead of below them, and once MCP is switched on it shrinks to a status line naming the level the assistant runs at, unfoldable back into the full guide
- Overview - the orphaned-datapoint and broken-reference lists show five entries each and move the rest into a "show all" dialog, so a damaged installation no longer stretches the page and pushes everything below it out of sight
- General - the loading screen now reports an unreachable ioBroker server after 8 seconds instead of spinning forever without explanation, and offers a reload button
- AI (MCP) - the endpoint can now be reached through `mcp-remote`, which is what Claude Desktop needs: OAuth discovery probes are answered with a plain 404 instead of the dashboard page, so the bridge no longer dies with `Unexpected token '<'`; a wrong token now reports itself as one instead of failing somewhere inside an OAuth flow, and browser-hosted clients get the CORS preflight they need (#612)
- Settings - the MCP section now offers two ready-made client blocks side by side, each with a copy button: the short HTTP one for Claude Code, and one that runs the same server through mcp-remote for Claude Desktop, which cannot speak HTTP itself (#612)
