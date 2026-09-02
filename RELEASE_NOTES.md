# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- General - widget titles keep their descenders (g, p, y) when the font scale is above 100 %
- AI assistant (MCP) - now reads the editor guidelines as the target screen and builds tabs that fit it, instead of guessing the width from existing widgets
- AI assistant (MCP) - list heights are now measured per layout and per option (second line, header), and the answer names what the number leaves out
