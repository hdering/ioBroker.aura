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
- fix: AI access (MCP) - backups taken before each change are now gzipped, a burst of changes within a minute shares one, and old ones are deleted (keep count and days configurable in the instance settings; existing files are cleaned up on start)
- feat: AI access (MCP) - with the web adapter extension switched on, the MCP endpoint is also reachable as `<web-port>/aura/mcp` and authenticates with its own token even when the web instance requires a login (needs a web adapter newer than 9.2.0)
