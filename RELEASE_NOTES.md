# Release notes for the NEXT version — English only (the release linter rejects German).

# One bullet per user-facing change; these become the ioBroker changelog, then this

# file is auto-reset to this template on the next stable release. Suggested style:

# <Widget type> - <what changed> e.g. Thermostat - target temperature now shown inline

# <General / widget-independent change> e.g. Tabs can be hidden from the tab bar

# Settings - <what changed> e.g. Settings - add hex color mode for RGB lights

# Issue reference (optional): append (#519) — or paste the full issue URL — and the

# release turns it into a changelog link. release.ps1 also asks per entry.

- Sections and tabs can be protected with a PIN - the content only appears after the code was entered;
  a section and a tab inside it sharing the same code ask only once
- AI assistant (MCP, beta) - reorder layouts, sections and tabs, copy or move a widget between
  tabs, and save a widget as a reusable template
- AI assistant (MCP, beta) - find widgets by datapoint, type or title across the whole dashboard,
  copy or move whole tabs, sections and layouts, add a single widget to a group, and delete or
  rename saved templates
- AI assistant (MCP, beta) - popup views can now be edited widget by widget like tabs, deleting a
  group widget cleans up its children, and the schema answers can be narrowed to keep prompts small
- AI assistant (MCP, beta) - parallel edits no longer overwrite each other, an ambiguous widget id
  or view name is reported instead of guessed, tabs and popup views can be duplicated, and templates
  work with popup and group widgets
