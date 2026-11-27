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
# 'breaking:' marks a change users must act on - it becomes the Breaking change marker
# and is listed first (bold in the admin). Use `backticks` for paths, ports, option names.
# Pair it with an upgrade notice in io-package.json common.messages (release.ps1 warns if missing).
# Long list before a stable release: put a '## Summary' block above an '## All changes' heading
# (about 10 bullets, same style). The stable release then puts only the summary into the
# admin news and README; the full list goes to the GitHub release notes. Betas ignore it.
- feat: Alarm system - works without the alarm adapter: every control (state, modes, zones, contacts, countdown, notices, panic, PIN request) can be bound to your own datapoints; mode buttons and zones come from a list in the settings or from a JSON datapoint and get their own labels, icons and colours (#1037)
