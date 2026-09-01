# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.

- Sections and tabs can be protected with a PIN - the content only appears once the code was entered, no matter whether the section menu, the tab bar, a widget click action or a bookmarked URL led there. Set per section and per tab in the dashboard editor; a section and a tab inside it sharing the same code ask only once
- Dashboard editor - the section settings popover follows the admin theme again instead of showing up dark, and its marker editor starts collapsed like the tab settings
- AI assistant (MCP, beta) - popup views and group children are now first class: every widget command works there too, and a single group tile can be added or changed without rewriting the whole group
- AI assistant (MCP, beta) - structure commands: reorder layouts, sections and tabs, copy or move a widget between tabs, and copy or move whole tabs, sections, layouts and popup views
- AI assistant (MCP, beta) - reusable widget templates (save, insert, rename, delete, covered by backups) and a search that finds widgets by datapoint, type or title across tabs, groups and popups
- AI assistant (MCP, beta) - fewer silent failures: parallel edits no longer overwrite each other, an ambiguous widget id or view name is reported instead of guessed, an option written at the wrong level is an error instead of a no-op, deleting a group cleans up its leftover children, and slimmer schema answers keep prompts short
