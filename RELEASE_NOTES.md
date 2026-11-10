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
- feat: Web components - dialogs of a component (a form or its own content) open in Aura's popup style instead of the browser dialog, full width on phones (#957)
- feat: AI access (MCP) - new tool aura_web_components lists the installed web components with their tag, adapter, name, size and settings, so an AI can build web component widgets without guessing (#956)
- fix: Web components - after an ioBroker restart or an adapter update the list of components no longer stays incomplete until the page is reloaded
