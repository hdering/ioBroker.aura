# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- Dynamic list - the custom category filter now names the category in the closed field ("Floors: Upper floor, Attic"), so identically named entries from different categories stay distinguishable (#568)
- Frontend design - a theme picked for a whole layout is now applied in the frontend; before that only per-section overrides had any effect (#573)
- Frontend design - the header light/dark button and the themeMode.frontend datapoint now switch the *mode* only: a design that already matches the requested brightness is kept, and the configured design is no longer overwritten for good (#573)
- Frontend design - the theme presets are greyed out with a hint while "theme follows browser" is on, and the admin says when a light/dark mode datapoint replaces the picked design (#573)
- Status overview - the "All clear" message is now shown in the card and minimal layouts too; before that they stayed empty when nothing needed attention, and it can now be switched off entirely
- Calendar - new option "adjust height to content": the widget grows with its entries instead of filling a fixed cell height, like the status overview
- HTML and value widget - placeholders can now calculate: vis-style operation chains {id;round(1)}, named variables {a:id1;b:id2;a * b} and inline {{ ... }} expressions with Math functions, comparisons and filters (#571)
- HTML and value widget - the .ts / .lc suffixes render a datapoint's update and last-change timestamp, e.g. {id.lc;date(HH:mm)} (#571)
