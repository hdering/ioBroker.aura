# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- Distribution chart - a group can now take its 100 % from a datapoint (a prepayment, a budget): the entries show their share of it and the unused part becomes a "Rest" segment; the bar stack direction can be flipped, so the used part sits at the bottom and the Rest on top (#596)
- Fill level - scale minimum and maximum can now come from datapoints instead of fixed numbers (#596)
- Gauge - the scale minimum and maximum datapoints are now offered in the editor (#596)
- Editor - dialogs no longer open partly off screen after a switch to a smaller resolution: the remembered size is capped to the current window (and kept for the bigger screen), and a dialog can no longer be dragged out of reach
- Dynamic list - the display of the datapoints (switch, slider, value mapping ...) can now be set once for the whole list in the datapoint dialog, including that display's own settings; a single datapoint can still override it
- Advanced chart - a consumption ("delta") bar series no longer pushes the time axis out past the selected period: the window now opens on the same day/hour boundary the bars sit on, so lines and bars start at the same point instead of the line appearing to begin half a day late (#598)
- Advanced chart - decimal places and thousands separator moved from the options panel into the "Manage datapoints" dialog: its tabs now run Mode (with a tip on what each mode is for), Number format, Series, Values, so everything that applies to all series comes before them - and a single series can override decimals and separator for itself (#600)
- Dynamic list - the "Slider" and "Value" displays now actually render: a slider was only ever drawn when the datapoint name looked like a dimmer, every other row fell back to the automatic display
- List - a switch entry in the card layout now fills its cell with the labelled button, like the dynamic list already did, instead of keeping the compact toggle
- List / Dynamic list - the "Slider" display now offers the full option set of the Schieberegler widget: scale and step (a 0-255 dimmer or a -20-40 setpoint instead of a fixed 0-100), colour, bar look, track thickness and width, value / unit / min-max labels, write-on-release and a read-only progress bar
- Slider - the track thickness set in the editor is now applied (the field was written but never read)
