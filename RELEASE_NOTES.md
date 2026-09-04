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
- Overview - new card explaining that Aura can now be controlled by an AI assistant over MCP, with the setup steps and a link to the documentation
- General - the loading screen now reports an unreachable ioBroker server after 8 seconds instead of spinning forever without explanation, and offers a reload button
- AI (MCP) - the endpoint can now be reached through `mcp-remote`, which is what Claude Desktop needs: OAuth discovery probes are answered with a plain 404 instead of the dashboard page, so the bridge no longer dies with `Unexpected token '<'`; a wrong token now reports itself as one instead of failing somewhere inside an OAuth flow, and browser-hosted clients get the CORS preflight they need (#612)
