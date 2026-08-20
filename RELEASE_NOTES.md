# Release notes for the NEXT version — English only (the release linter rejects German).

# One bullet per user-facing change; these become the ioBroker changelog, then this

# file is auto-reset to this template on the next stable release. Suggested style:

# <Widget type> - <what changed> e.g. Thermostat - target temperature now shown inline

# <General / widget-independent change> e.g. Tabs can be hidden from the tab bar

# Settings - <what changed> e.g. Settings - add hex color mode for RGB lights

# Issue reference (optional): append (#519) — or paste the full issue URL — and the

# release turns it into a changelog link. release.ps1 also asks per entry.

- Chart (advanced) - y-axis bounds from a JSON datapoint are now found when the payload is wrapped in an array, min/max written the wrong way round are swapped, and the editor shows the accepted JSON shapes plus the paths that hold an array (#550)
- Chart (Distribution) - the stacked bar now fills its full height with small readings too; totals below 1 (e.g. 0.01 + 0.04 + 0.02 kWh) used to shrink the bar to a sliver and clip the segment percentages (#560)
- Chart (Distribution) - new "consumption/yield (increase)" aggregation for counters: it sums the increase over the period, so day counters that reset to 0 at midnight (sourceanalytix currentDay, PV day yield) add up instead of turning negative under "difference" (#561)
- Chart (advanced) - the "consumption/yield (increase)" aggregation showed far too low values for the year and total ranges: a day counter's midnight reset was mistaken for a stray reading, which dropped every day that reached the previous day's level, and ranges over roughly four months were fetched too coarsely to see the daily resets at all (#562)
- Map - a quick-access chip can now be filled with its colour instead of showing it as a thin border only, switchable per chip (#563)
- Popups - popups no longer disappear or fall back to a weeks-old state: loading the built-in popups marked the browser as having unsaved changes, so that browser stopped pulling the current popup configuration and pushed its own outdated copy back over it on the next admin visit
- Popups - a built-in popup you edited yourself is no longer reset to the shipped version when an update ships a new revision of it; use "Reset" in Admin - Popups to pull the new version on purpose
- Popups - editing a timer or syncing a dynamic list in the frontend no longer writes that browser's theme, group and popup configuration back to ioBroker along with the dashboard
