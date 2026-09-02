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
- AI assistant (MCP) - validation now warns when any control sits on a read-only datapoint: a switch row of a list, the up/stop/down of a shutter, the channels of a lamp - not just the widget datapoint
- AI assistant (MCP) - click actions are documented at last: every kind and its fields, an error for an invented one, and a plain note that no click action writes a datapoint (use chips, a list row, enum or httpRequest for that)
- AI assistant (MCP) - hands over the dashboard theme palette (new aura_theme tool, and the base tokens in aura_dashboard), so generated widgets use var(--accent-green) instead of a hard-coded hex that only fits one theme
- Calendar - custom layout now reaches every visible event, not just the next one: each field takes an event number in the cell config, so a whole agenda can be built as one grid row per event (#608)
- Calendar - custom layout gains the end time, the time span (09:00 - 10:30) and a calendar week that only prints where the week changes; the calendar icon is now per event too (#608)
