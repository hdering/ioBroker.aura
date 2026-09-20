# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- JSON table - HTML columns get a width mode: own width, fill the column, or proportional (the longest value fills the column, shorter ones keep their ratio); bars built with `cellspacing` keep their gaps again (#677)
- Select field - in the editor the entry list's value column now grows with the longest value, so text values stay readable instead of being cut off; the same applies to the Universal widget's select cell (#679)
- Colors - every color field now offers the theme colors and can hold one color per brightness, so an icon tuned for the light design no longer disappears on the dark one (#689)
