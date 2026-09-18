# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- Layouts - the admin page is now a master-detail view like Frontend Design: a tree of layouts and sections on the left, the selected one on the right with labelled actions, a section list with default section and menu visibility, and a searchable tab list with default tab, hidden state and drag ordering
- Menu widget - new "Overview" mode lists every section of the layout with its tabs as clickable chips, generated from the layout itself, with optional search field, group titles, chip size and an "all layouts" source (#669)
- Chart (Advanced) - a legend that wraps onto several rows no longer covers the chart; the plot now starts below the last legend row (#673)
- Select field - optional confirmation prompt before the picked entry is written to the datapoint, with a custom prompt text, like the input field already offers (#674)
- Select field - the dropdown size (small / medium / large) and a fixed width are configurable, so a long entry no longer resizes the control and the touch target can be made bigger (#679)
- JSON table - HTML columns can stretch their content to the column width, so a bar chart built from an HTML table fills the column like it does in vis instead of shrinking to a few pixels (#677)
- Widgets - every widget can start collapsed: "Collapsed by default" (now in the Appearance section, moved there for the group as well) folds the card to a single row with icon and title, a tap expands it and the widgets below move up; while expanded a fold button sits in a configurable corner; optionally the editor shows the widget collapsed as well (#676)
- JSON table - a table row no longer reserves half a font size of unused height, so a one-line table fits a small card instead of having the bottom of its letters cut off (#678)
- Fill level - optional datapoints for charging and connection: a bolt shows while the device charges, with an optional blinking or Knight-Rider effect on the fill, and a lost connection greys the widget out and shows its own icon; each datapoint can be read as a flag, an inverted flag (UNREACH) or a charge power (#671)
